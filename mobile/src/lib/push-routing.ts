// Where a push takes you. The backend sends `data.route` as a web-style
// path; each one maps to a room. The tap that launched the app is read on
// cold start, every later tap through the listener. A tap that arrives
// while the rooms are closed waits as a pending link.
import * as Notifications from 'expo-notifications'
import { useRouter, type Href } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { dark } from '@/src/design/tokens'
import { setPendingLink } from './pendingLink'

/** `/today`, `/mirror/render/:id`, `/circle/post/:type/:id`, `/circle/notifications`. */
export function hrefForPushRoute(route: unknown): Href | null {
  if (typeof route !== 'string') return null
  const [a, b, c, d] = route.replace(/^\/+|\/+$/g, '').split('/')
  if (a === 'today') return '/(tabs)/today'
  if (a === 'mirror' && b === 'render' && c) return `/reveal/${c}` as Href
  if (a === 'circle' && b === 'post' && c && d) return `/(tabs)/circle/post/${c}/${d}` as Href
  if (a === 'circle' && b === 'notifications') return '/(tabs)/circle/notifications'
  return null
}

/**
 * Foreground behaviour and the Android channels. Called once at import of
 * the root layout so a push that lands before the shell mounts is handled.
 */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
  if (Platform.OS !== 'android') return
  // Two channels so a member can quiet the circle without losing the ritual.
  void Notifications.setNotificationChannelAsync('ritual', {
    name: 'The morning ritual',
    description: 'Your look for the day, at the hour you chose.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: dark.brass,
  }).catch(() => undefined)
  void Notifications.setNotificationChannelAsync('events', {
    name: 'Your circle and the Mirror',
    description: 'Picks, notes, verdicts, and renders when they are ready.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: dark.brass,
  }).catch(() => undefined)
}

function routeOf(response: Notifications.NotificationResponse | null): Href | null {
  const data = response?.notification.request.content.data as { route?: unknown } | undefined
  return hrefForPushRoute(data?.route)
}

/** Route on every push tap. `ready` is "signed in and fitted". */
export function usePushRouting(ready: boolean): void {
  const router = useRouter()
  const readyRef = useRef(ready)
  readyRef.current = ready

  useEffect(() => {
    let cancelled = false
    const open = (response: Notifications.NotificationResponse | null) => {
      const href = routeOf(response)
      if (!href) return
      if (readyRef.current) router.push(href)
      else setPendingLink(href)
    }
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (cancelled || !response) return
        open(response)
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined)
      })
      .catch(() => undefined)
    const sub = Notifications.addNotificationResponseReceivedListener(open)
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [router])
}
