import Constants from 'expo-constants'

/**
 * Resolve the backend base URL at runtime.
 *
 * A phone or Android emulator cannot reach the dev machine via `localhost`, so
 * we derive the host from the Expo dev server (which the phone is already
 * talking to) and swap in the backend port.
 *
 * Resolution order:
 *  1. `EXPO_PUBLIC_API_URL` env override (e.g. a tunnel or staging URL).
 *  2. The LAN IP behind the Expo dev server (`Constants.expoConfig.hostUri`,
 *     e.g. "192.168.1.5:8081") with the backend port (3000) substituted.
 *  3. `http://localhost:3000` — works on the iOS simulator.
 */
const BACKEND_PORT = 3000

function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '')
  }

  // hostUri looks like "192.168.1.5:8081" (or with a scheme in some SDKs).
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Fallbacks for older/newer manifest shapes.
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      .expoGoConfig?.debuggerHost ??
    (Constants.manifest2 as unknown as { extra?: { expoGo?: { debuggerHost?: string } } })
      ?.extra?.expoGo?.debuggerHost

  if (hostUri) {
    const host = hostUri
      .replace(/^\w+:\/\//, '') // strip any scheme
      .split('/')[0] // strip any path
      .split(':')[0] // strip the port
    if (host) {
      return `http://${host}:${BACKEND_PORT}`
    }
  }

  return `http://localhost:${BACKEND_PORT}`
}

/** The backend origin, e.g. `http://192.168.1.5:3000`. API paths append `/api/...`. */
export const API_BASE_URL = resolveApiBaseUrl()

/**
 * The API returns image URLs that are usually relative (`/api/uploads/x.png`)
 * but occasionally absolute. Turn either into a fully-qualified URL the native
 * `<Image>` component can load.
 */
export function resolveImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`
}
