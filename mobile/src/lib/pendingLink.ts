// A link that arrived before the rooms were open: signed out, or still in
// the fitting. Held in memory, then opened once the member is through the
// door. The redirect routes and the push listener put links here; the shell
// takes them.
import * as Linking from 'expo-linking'
import { useRouter, type Href } from 'expo-router'
import { useEffect, useRef } from 'react'
import { appLinkFor } from './links'

let pending: Href | null = null

export function setPendingLink(href: Href): void {
  pending = href
}

export function takePendingLink(): Href | null {
  const href = pending
  pending = null
  return href
}

export function hasPendingLink(): boolean {
  return pending !== null
}

/**
 * Catch a room link that opened the app while the rooms were closed, and
 * open whatever is waiting the moment they are. `ready` is "signed in and
 * fitted".
 */
export function usePendingLink(ready: boolean): void {
  const url = Linking.useURL()
  const router = useRouter()
  const seen = useRef<string | null>(null)

  // The URL is also matched by the redirect routes under app/, but a route
  // hidden behind a guard swallows it; reading it here catches that case.
  useEffect(() => {
    if (!url || ready || seen.current === url) return
    seen.current = url
    const { path, queryParams } = Linking.parse(url)
    const link = appLinkFor(path ?? '', queryParams ?? {})
    if (link?.kind === 'room') setPendingLink(link.href)
  }, [url, ready])

  useEffect(() => {
    if (!ready) return
    const href = takePendingLink()
    if (!href) return
    // Let the guarded stack mount before navigating into it.
    const id = setTimeout(() => router.replace(href), 0)
    return () => clearTimeout(id)
  }, [ready, router])
}
