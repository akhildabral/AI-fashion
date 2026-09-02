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
    const message =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : typeof data === 'string' && data
          ? data
          : null) ?? `Request failed with status ${res.status}`
    throw new ApiError(message, res.status)
  }

  return data as T
}

/**
 * Multipart upload helper. Sends `FormData` without a JSON `Content-Type` so the
 * browser can set the correct `multipart/form-data` boundary itself. Still
 * attaches the Bearer token and throws an `ApiError` on non-2xx like `apiFetch`.
 */
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

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: formData,
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
    const message =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : typeof data === 'string' && data
          ? data
          : null) ?? `Request failed with status ${res.status}`
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
