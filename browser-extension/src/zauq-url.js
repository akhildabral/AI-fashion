// The one thing the extension computes: where to send the current tab.
// Pure, dependency-free, shared by the service worker, the options page and
// the tests. Nothing here reads the page; it only sees the tab's address.

export const PRODUCTION_ORIGIN = 'https://myzauq.com'
export const STORE_PATH = '/closet/store'

/**
 * Tidy an origin typed into the options field: trims, adds https:// when the
 * scheme is missing, drops any path, and keeps http only for localhost so a
 * dev build can point at Vite. Returns null when it cannot be an origin.
 */
export function normalizeOrigin(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let url
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost')
  if (url.protocol === 'http:' && !local) return null
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url.origin
}

/** A tab address worth sending: a public http(s) page, not a browser page. */
export function isProductUrl(tabUrl) {
  if (!tabUrl) return false
  try {
    const u = new URL(tabUrl)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * The store page address for a tab. With no usable tab URL the store page
 * opens on its own, ready for a paste. `door` names the way in, so the app
 * can count imports by door.
 */
export function buildStoreUrl(origin, tabUrl, door = 'extension') {
  const base = normalizeOrigin(origin) ?? PRODUCTION_ORIGIN
  const params = new URLSearchParams()
  if (isProductUrl(tabUrl)) params.set('url', tabUrl)
  params.set('door', door)
  return `${base}${STORE_PATH}?${params.toString()}`
}
