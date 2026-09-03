// The API client behind every module in this package. Each app configures it
// once at boot with its own base URL and token store (localStorage on the
// web, SecureStore on the phone); after that `apiFetch` / `apiUpload` /
// `apiFetchBlob` behave identically on both platforms.

export interface TokenStore {
  get(): string | null
  set(token: string): void
  clear(): void
}

export interface ApiConfig {
  /** Absolute on the phone; `/api` (same origin) on the web. */
  baseUrl: string
  tokens: TokenStore
  /**
   * Web only: re-read picked files into memory before a multipart send.
   * iOS Safari can drop a picker's file handle after the picker closes.
   */
  prepareForm?: (form: FormData) => Promise<FormData>
  /** Turn an image URL from the API into one the platform can load. */
  resolveImageUrl?: (url: string) => string
  /**
   * Mobile: try to renew the session when an authenticated request comes
   * back 401. Resolve true when a fresh token is in the store; the request
   * is then sent once more. Resolve false (or throw) to end the session.
   */
  refresh?: () => Promise<boolean>
}

let config: ApiConfig | null = null

export function configureApi(next: ApiConfig): void {
  config = next
}

function cfg(): ApiConfig {
  if (!config) throw new Error('configureApi() must run before the first request')
  return config
}

export function getToken(): string | null {
  return cfg().tokens.get()
}

export function setToken(token: string): void {
  cfg().tokens.set(token)
}

export function clearToken(): void {
  cfg().tokens.clear()
}

// ---- session expiry ----
// An authenticated request that comes back 401 means the token expired or
// was revoked. The token is cleared and every listener (the app's auth
// provider) is told, so screens never render raw "Invalid token" strings.

type Listener = () => void
const expiredListeners = new Set<Listener>()

/** Subscribe to session expiry; returns the unsubscribe. */
export function onAuthExpired(listener: Listener): () => void {
  expiredListeners.add(listener)
  return () => {
    expiredListeners.delete(listener)
  }
}

function sessionExpired(): void {
  clearToken()
  for (const l of expiredListeners) l()
}

// Trust only a JSON { error } body; never surface a raw proxy/HTML body to the
// user. Anything else maps to a friendly line by status.
function errorMessageFor(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const e = (data as { error: unknown }).error
    if (typeof e === 'string' && e.trim()) return e
  }
  if (status >= 500) return 'The stylist is out for a moment. Please try again.'
  if (status === 429) return 'That’s a lot at once. Give it a moment.'
  if (status === 413) return 'That photo is too large.'
  if (status === 401 || status === 403) return 'Please sign in again.'
  return 'Something went wrong. Please try again.'
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Skip attaching the Authorization header even if a token exists. */
  auth?: boolean
}

function authHeaders(auth: boolean): { headers: Record<string, string>; authed: boolean } {
  const headers: Record<string, string> = {}
  if (!auth) return { headers, authed: false }
  const token = getToken()
  if (!token) return { headers, authed: false }
  headers['Authorization'] = `Bearer ${token}`
  return { headers, authed: true }
}

async function parseBody(res: Response): Promise<unknown> {
  const raw = await res.text()
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function settle<T>(res: Response, data: unknown, authed: boolean): T {
  if (!res.ok) {
    if (res.status === 401 && authed) sessionExpired()
    throw new ApiError(errorMessageFor(data, res.status), res.status)
  }
  return data as T
}

/**
 * One attempt to renew an expired session. Only one renewal runs at a time;
 * concurrent 401s wait for the same result.
 */
let renewing: Promise<boolean> | null = null
async function renewSession(): Promise<boolean> {
  const { refresh } = cfg()
  if (!refresh) return false
  if (!renewing) {
    renewing = refresh()
      .catch(() => false)
      .finally(() => {
        renewing = null
      })
  }
  return renewing
}

/**
 * Small fetch wrapper:
 * - prefixes the configured base URL
 * - attaches `Authorization: Bearer <token>` when a token is present
 * - sends/parses JSON
 * - on a 401 with a refresh hook configured, renews the session once and retries
 * - throws an ApiError (with the server's `error` message) on non-2xx
 */
export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, auth = true }: RequestOptions = {},
): Promise<T> {
  const send = async () => {
    const { headers, authed } = authHeaders(auth)
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${cfg().baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return { res, authed }
  }

  let { res, authed } = await send()
  if (res.status === 401 && authed && (await renewSession())) {
    ;({ res, authed } = await send())
  }
  return settle<T>(res, await parseBody(res), authed)
}

const CUT_SHORT = /unexpected end of form|multipart|boundary|load failed|network/i

/**
 * Multipart upload helper. Sends `FormData` without a JSON `Content-Type` so
 * the platform sets the `multipart/form-data` boundary itself. Still attaches
 * the Bearer token and throws an `ApiError` on non-2xx like `apiFetch`.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  { method = 'POST', auth = true }: { method?: string; auth?: boolean } = {},
): Promise<T> {
  const { baseUrl, prepareForm } = cfg()
  const { headers, authed } = authHeaders(auth)

  let body: FormData
  try {
    body = prepareForm ? await prepareForm(formData) : formData
  } catch {
    throw new ApiError('That photo couldn’t be read. Pick it again.', 400)
  }

  // An upload cut short (a flaky connection, a backgrounded app) is tried
  // once more: nothing was created when the body never arrived whole.
  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, { method, headers, body })
    if (res.status === 400 && CUT_SHORT.test(await res.clone().text())) {
      res = await fetch(`${baseUrl}${path}`, { method, headers, body })
    }
  } catch (err) {
    if (err instanceof TypeError && CUT_SHORT.test(err.message)) {
      res = await fetch(`${baseUrl}${path}`, { method, headers, body })
    } else throw err
  }

  return settle<T>(res, await parseBody(res), authed)
}

/** An image URL from the API, as the platform can load it. */
export function resolveImageUrl(url: string): string {
  const r = cfg().resolveImageUrl
  return r ? r(url) : url
}

/** GET a binary response (a share card) with the session attached. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const { headers } = authHeaders(true)
  const res = await fetch(`${cfg().baseUrl}${path}`, { headers })
  if (!res.ok) throw new ApiError('Could not prepare the card.', res.status)
  return res.blob()
}
