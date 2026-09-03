import Constants from 'expo-constants'

/**
 * The backend origin at runtime.
 *
 * A phone or Android emulator cannot reach the dev machine as `localhost`, so
 * in development the host is taken from the Expo dev server the phone is
 * already talking to, with the backend port swapped in.
 *
 * Resolution order:
 *  1. `EXPO_PUBLIC_API_URL` (a tunnel, staging, or production).
 *  2. The LAN host behind the Expo dev server (`hostUri`, e.g. "192.168.1.5:8081") on port 3000.
 *  3. `http://localhost:3000` (the iOS simulator).
 */
const BACKEND_PORT = 3000
const PRODUCTION_ORIGIN = 'https://myzauq.com'

function resolveOrigin(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/$/, '')

  if (!__DEV__) return PRODUCTION_ORIGIN

  const hostUri = Constants.expoConfig?.hostUri
  if (hostUri) {
    const host = hostUri.replace(/^\w+:\/\//, '').split('/')[0].split(':')[0]
    if (host) return `http://${host}:${BACKEND_PORT}`
  }
  return `http://localhost:${BACKEND_PORT}`
}

/** The backend origin, e.g. `https://myzauq.com`. */
export const API_ORIGIN = resolveOrigin()
/** Where the API lives: `${API_ORIGIN}/api`. */
export const API_URL = `${API_ORIGIN}/api`
/** The web app's origin, for share links and legal pages. */
export const WEB_ORIGIN = PRODUCTION_ORIGIN

/**
 * Image URLs from the API are relative (`/api/uploads/x.png`) with the local
 * storage driver and absolute with S3. Either becomes a URL `expo-image` can load.
 */
export function resolveImageUrl(url: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0'
