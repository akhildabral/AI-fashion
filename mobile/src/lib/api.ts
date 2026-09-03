// The phone's configuration of the shared API client. Import this module (not
// `@zauq/shared/api`) from app code so the configuration is always in place.
import { configureApi } from '@zauq/shared/api'
import { API_URL, resolveImageUrl } from './config'
import { getRefreshToken, setRefreshToken, tokens } from './session'

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

interface RefreshResponse {
  token: string
  refreshToken: string
}

/**
 * Renew the session with the device's refresh token. Runs outside the shared
 * client so a 401 here never recurses; a failed renewal ends the session.
 */
async function refresh(): Promise<boolean> {
  const current = getRefreshToken()
  if (!current) return false
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current }),
  })
  if (!res.ok) return false
  const data = (await res.json()) as RefreshResponse
  if (!data?.token) return false
  tokens.set(data.token)
  setRefreshToken(data.refreshToken ?? current)
  return true
}

configureApi({
  baseUrl: API_URL,
  tokens,
  resolveImageUrl,
  refresh,
})
