// The web links the app claims (LINK_PATHS in app.config.ts) and the screen
// each one opens. Used by the redirect routes under app/ and by the shell's
// pending-link capture, so the two never disagree.
import type { Href } from 'expo-router'

/** Door links work signed out; room links need a signed-in, fitted member. */
export type LinkKind = 'door' | 'room'

export interface AppLink {
  kind: LinkKind
  href: Href
}

export type LinkParams = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

function query(params: LinkParams, keys: string[]): string {
  const q = keys
    .map((k) => [k, first(params[k])] as const)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&')
  return q ? `?${q}` : ''
}

// Typed routes cannot see through a template string, so the two builders
// cast once here.
const door = (href: string): AppLink => ({ kind: 'door', href: href as Href })
const room = (href: string): AppLink => ({ kind: 'room', href: href as Href })

/**
 * Map a web path (`/look/abc`, `/invite`) and its query to the app screen.
 * Null when the app has no room for that link.
 */
export function appLinkFor(path: string, params: LinkParams = {}): AppLink | null {
  const segs = path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  const [head, a, b] = segs
  const id = a ? decodeURIComponent(a) : ''
  switch (head) {
    case 'look':
      return id ? room(`/(tabs)/circle/post/look/${id}`) : null
    case 'vote':
      return id ? room(`/(tabs)/circle/post/verdict/${id}`) : null
    case 'join':
      return door(id ? `/(door)/join/${id}` : '/(door)/join')
    case 'invite':
      return door(`/(door)/invite${query(params, ['token'])}`)
    case 'reset':
      return door(`/(door)/reset${query(params, ['token'])}`)
    case 'verify-email':
      return door(`/(door)/verify-email${query(params, ['token'])}`)
    case 'u':
      return id ? room(`/u/${id}`) : null
    case 'trips':
      return id ? room(`/(tabs)/you/trips/${id}`) : null
    case 'closet':
      return a === 'piece' && b ? room(`/(tabs)/closet/piece/${decodeURIComponent(b)}`) : null
    case 'mirror':
      return room(`/(tabs)/mirror${query(params, ['items', 'lens'])}`)
    default:
      return null
  }
}
