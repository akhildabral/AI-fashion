// The web app's configuration of the shared API client: the tokens live in
// localStorage, the base URL is same-origin `/api` (or VITE_API_URL), and
// picked files are pinned into memory before upload. Import this module
// (not `@zauq/shared/api`) from web code so the configuration is always in
// place before the first request.
import { apiFetch, clearToken, configureApi, onAuthExpired } from '@zauq/shared/api'

export {
  ApiError,
  apiFetch,
  apiFetchBlob,
  apiUpload,
  clearToken,
  getToken,
  onAuthExpired,
  resolveImageUrl,
  setToken,
} from '@zauq/shared/api'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'
// The access-token key predates refresh tokens; keeping it means a session
// signed in before this build carries on until its token expires.
const TOKEN_KEY = 'ai-fashion-token'
const REFRESH_KEY = 'ai-fashion-refresh'

/** Sent with every sign-in so the server issues a web session with a refresh token. */
export function clientFields() {
  return { client: 'web' as const }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode with storage blocked: the session lasts this page load */
  }
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY)
}

export function setRefreshToken(next: string | null): void {
  write(REFRESH_KEY, next)
}

/** Store a freshly issued pair. A pair without a refresh token keeps the one on file. */
export function adoptTokens(pair: { token: string; refreshToken?: string | null }): void {
  write(TOKEN_KEY, pair.token)
  if (pair.refreshToken !== undefined) setRefreshToken(pair.refreshToken)
}

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

interface RefreshResponse {
  token: string
  refreshToken: string
}

/**
 * Renew the session with the stored refresh token. Runs outside the shared
 * client so a 401 here never recurses; a failed renewal ends the session.
 *
 * A refresh token is spent by the exchange, and every open tab shares the
 * same localStorage, so two tabs hitting 401 together must not both present
 * it: the exchange runs under a cross-tab lock where the browser has one,
 * and a tab that finds the token already rotated by the time it holds the
 * lock (or by the time its own exchange is refused) treats that as success.
 */
export async function refreshSession(): Promise<boolean> {
  const seen = getRefreshToken()
  if (!seen) return false
  const exchange = async (): Promise<boolean> => {
    const current = getRefreshToken()
    if (!current) return false
    if (current !== seen) return true // another tab renewed while we waited
    let res: Response
    try {
      res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current }),
      })
    } catch {
      return false
    }
    if (!res.ok) {
      const now = getRefreshToken()
      return now !== null && now !== current
    }
    const data = (await res.json().catch(() => null)) as RefreshResponse | null
    if (!data?.token) return false
    adoptTokens({ token: data.token, refreshToken: data.refreshToken ?? current })
    return true
  }
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks?.request) return locks.request('zauq-session-refresh', exchange)
  return exchange()
}

/**
 * End this session on the server (only this browser's refresh token is
 * revoked; other devices stay signed in), then drop it locally whatever the
 * server said. Signing out is never blocked on the network.
 */
export async function signOut(): Promise<void> {
  const refreshToken = getRefreshToken()
  try {
    await apiFetch('/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : undefined })
    // The access token was renewed on the way: the pair we hold now is a
    // different session row, so revoke that one too.
    const rotated = getRefreshToken()
    if (rotated && rotated !== refreshToken) {
      await apiFetch('/auth/logout', { method: 'POST', body: { refreshToken: rotated } })
    }
  } catch {
    /* an unrevoked row expires on its own */
  } finally {
    clearToken()
    // A refusal on the way out is not "your session expired".
    clearSessionExpired()
  }
}

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

configureApi({
  baseUrl: BASE_URL,
  tokens: {
    get: () => read(TOKEN_KEY),
    set: (token) => write(TOKEN_KEY, token),
    clear: () => {
      write(TOKEN_KEY, null)
      write(REFRESH_KEY, null)
    },
  },
  prepareForm: pinForm,
  refresh: refreshSession,
  // Image URLs from the API are same-origin relative paths on the web.
})

onAuthExpired(markSessionExpired)
