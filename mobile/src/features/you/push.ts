// Native push: the morning ritual and the event nudges, registered with the
// server as an Expo push token. The fitting reuses this once the first brief
// has been revealed; the You room's Notifications screen owns the settings.
//
// A token only exists on a build that carries an EAS project id (the store
// build). Local dev builds have none: `pushAvailable()` is false and the
// settings render read-only with a quiet line.
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { apiFetch } from '@/src/lib/api'

export interface PushStatus {
  /** Web-push flag; the phone ignores it. */
  enabled?: boolean
  native?: boolean
  devices: number
  hour: number
  timezone: string | null
  eveningPush?: boolean
  events?: { circle: boolean; renders: boolean }
  subscriptions?: { platform: string; endpoint?: string | null; expoToken?: string | null }[]
}

export interface PushSubscribeResponse {
  id: string
  platform: string
  hour: number
  timezone: string
  events: { circle: boolean; renders: boolean }
}

export interface PushSettingsPatch {
  hour?: number
  eveningPush?: boolean
  events?: { circle?: boolean; renders?: boolean }
}

export const RITUAL_HOURS = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const

export function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'am' : 'pm'}`
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  return extra?.eas?.projectId ?? undefined
}

/** Whether this build can receive push at all (a store build with a project id). */
export function pushAvailable(): boolean {
  return Platform.OS !== 'web' && !!projectId()
}

let cachedToken: string | null = null

/** This device's Expo push token, once the OS permission is granted. */
export async function getExpoToken(): Promise<string> {
  if (cachedToken) return cachedToken
  const id = projectId()
  if (!id) throw new Error('Push arrives with the store build.')
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id })
  cachedToken = data
  return data
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function getPushStatus(): Promise<PushStatus> {
  return apiFetch<PushStatus>('/push/status')
}

/** Is this device among the server's subscriptions? */
export async function subscribedHere(status: PushStatus): Promise<boolean> {
  if (!pushAvailable() || !status.subscriptions?.length) return false
  try {
    const token = await getExpoToken()
    return status.subscriptions.some((s) => s.expoToken === token)
  } catch {
    return false
  }
}

/**
 * Ask the OS (the caller shows the pre-permission copy first), take the
 * token, and register it for the ritual at `hour`.
 */
export async function enableRitual(hour: number): Promise<PushSubscribeResponse> {
  if (!pushAvailable()) throw new Error('Push arrives with the store build.')
  const current = await Notifications.getPermissionsAsync()
  let granted = current.granted
  if (!granted) {
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    })
    granted = asked.granted
  }
  if (!granted) throw new Error('Notifications are off for ZAUQ. Allow them in Settings to get the ritual.')
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('ritual', {
      name: 'The morning ritual',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined)
  }
  const expoToken = await getExpoToken()
  return apiFetch<PushSubscribeResponse>('/push/subscribe', {
    method: 'POST',
    body: { expoToken, platform: Platform.OS === 'ios' ? 'ios' : 'android', timezone: deviceTimezone(), hour },
  })
}

/** Take this device off the ritual. Other devices keep theirs. */
export async function disableRitual(): Promise<void> {
  const expoToken = await getExpoToken()
  await apiFetch('/push/unsubscribe', { method: 'POST', body: { expoToken } })
}

export function updatePushSettings(patch: PushSettingsPatch): Promise<PushStatus | void> {
  return apiFetch<PushStatus | void>('/push/settings', { method: 'PATCH', body: patch })
}

/** A test notification to this device. */
export async function sendTestPush(): Promise<{ sent: boolean }> {
  const expoToken = await getExpoToken()
  return apiFetch<{ sent: boolean }>('/push/test', { method: 'POST', body: { expoToken } })
}
