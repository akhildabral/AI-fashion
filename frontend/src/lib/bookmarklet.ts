// The "Ask the closet" bookmarklet: the same door as the browser extension,
// as a link a member drags to the bookmarks bar. It sends the current page's
// address to the store page and nothing else. `origin` is the app's own
// origin so a dev build points at itself.

export const BOOKMARKLET_DOOR = 'bookmarklet'
export const STORE_PATH = '/closet/store'

/** The javascript: URL for the bookmarklet, against the given app origin. */
export function bookmarkletHref(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `javascript:location.href='${base}${STORE_PATH}?url='+encodeURIComponent(location.href)+'&door=${BOOKMARKLET_DOOR}'`
}

/** The store page address the bookmarklet would open from a given page. */
export function bookmarkletTarget(origin: string, pageUrl: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}${STORE_PATH}?url=${encodeURIComponent(pageUrl)}&door=${BOOKMARKLET_DOOR}`
}
