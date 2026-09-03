const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'
const TOKEN_KEY = 'ai-fashion-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Fired on window when an authenticated request comes back 401 — the token
 * expired or was revoked. AuthProvider listens and signs the user out so
 * pages never render raw "Invalid token" strings.
 */
export const AUTH_EXPIRED_EVENT = 'auth:expired'

/** Set when a session dies mid-use, read once by the sign-in redirect. */
export function markSessionExpired() {
  try {
    sessionStorage.setItem('auth-expired', '1')
  } catch {
    /* ignore */
  }
}
export function sessionExpiredPending(): boolean {
  try {
    return sessionStorage.getItem('auth-expired') === '1'
  } catch {
    return false
  }
}
export function clearSessionExpired() {
  try {
    sessionStorage.removeItem('auth-expired')
  } catch {
    /* ignore */
  }
}

// Trust only a JSON { error } body; never surface a raw proxy/HTML body to the
// user. Anything else maps to a friendly line by status.
function errorMessageFor(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const e = (data as { error: unknown }).error
    if (typeof e === 'string' && e.trim()) return e
  }
  if (status >= 500) return 'The stylist is out for a moment. Please try again.'
  if (status === 429) return 'That’s a lot at once — give it a moment.'
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

/**
 * Small fetch wrapper:
 * - resolves the base URL from VITE_API_URL (default `/api`)
 * - attaches `Authorization: Bearer <token>` when a token is present
 * - sends/parses JSON
 * - throws an ApiError (with the server's `error` message) on non-2xx
 */
export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {}

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let authed = false
  if (auth) {
    const token = getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      authed = true
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const raw = await res.text()
  let data: unknown = undefined
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = raw
    }
  }

  if (!res.ok) {
    if (res.status === 401 && authed) {
      clearToken()
      markSessionExpired()
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
    const message = errorMessageFor(data, res.status)
    throw new ApiError(message, res.status)
  }

  return data as T
}

/**
 * Multipart upload helper. Sends `FormData` without a JSON `Content-Type` so the
 * browser can set the correct `multipart/form-data` boundary itself. Still
 * attaches the Bearer token and throws an `ApiError` on non-2xx like `apiFetch`.
 */
/**
 * Read a picked file into memory now, while its handle is still good. iOS
 * Safari can drop a picker's file handle after the picker closes (or when
 * the tab is backgrounded), and a multipart body streamed from it then ends
 * early — the server sees "Unexpected end of form". A file pinned into a
 * Blob uploads whole every time. A file with no type is given one from its
 * name so the server's filter can read it.
 */
export async function pinFile(file: File): Promise<File> {
  const buf = await file.arrayBuffer()
  const name = file.name || 'photo.jpg'
  const type = file.type || (/\.hei[cf]$/i.test(name) ? 'image/heic' : /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg')
  return new File([buf], name, { type, lastModified: file.lastModified })
}

/** The same form, with every file pinned into memory. */
async function pinForm(formData: FormData): Promise<FormData> {
  const out = new FormData()
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) out.append(key, await pinFile(value), value.name || 'photo.jpg')
    else out.append(key, value)
  }
  return out
}

const CUT_SHORT = /unexpected end of form|multipart|boundary|load failed|network/i

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  { method = 'POST', auth = true }: { method?: string; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {}

  let authed = false
  if (auth) {
    const token = getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      authed = true
    }
  }

  let body: FormData
  try {
    body = await pinForm(formData)
  } catch {
    throw new ApiError('That photo couldn’t be read. Pick it again.', 400)
  }

  // An upload cut short (a flaky connection, a backgrounded tab) is tried
  // once more: nothing was created when the body never arrived whole.
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body })
    if (res.status === 400 && CUT_SHORT.test(await res.clone().text())) {
      res = await fetch(`${BASE_URL}${path}`, { method, headers, body })
    }
  } catch (err) {
    if (err instanceof TypeError && CUT_SHORT.test(err.message)) {
      res = await fetch(`${BASE_URL}${path}`, { method, headers, body })
    } else throw err
  }

  const raw = await res.text()
  let data: unknown = undefined
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = raw
    }
  }

  if (!res.ok) {
    if (res.status === 401 && authed) {
      clearToken()
      markSessionExpired()
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
    const message = errorMessageFor(data, res.status)
    throw new ApiError(message, res.status)
  }

  return data as T
}

/** Image URLs from the API are same-origin relative paths; pass through absolutes. */
export function resolveImageUrl(url: string): string {
  return url
}

/** GET a binary response (a share card) with the session attached. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, { headers })
  if (!res.ok) throw new ApiError('Could not prepare the card.', res.status)
  return res.blob()
}
