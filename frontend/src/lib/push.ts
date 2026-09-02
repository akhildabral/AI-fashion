import { apiFetch } from './api'

// The morning ritual on the web: a service-worker push subscription tied
// to this browser, with the person's own hour and zone.

export interface PushStatus {
  enabled: boolean
  devices: number
  hour: number
  timezone: string | null
  endpoints: string[]
}

export function getPushKey() {
  return apiFetch<{ enabled: boolean; publicKey: string | null }>('/push/key', { auth: false })
}
export function getPushStatus() {
  return apiFetch<PushStatus>('/push/status')
}
export function updatePushHour(hour: number) {
  return apiFetch<{ hour: number }>('/push/settings', { method: 'PATCH', body: { hour } })
}
export function sendTestPush(endpoint: string) {
  return apiFetch<{ sent: boolean }>('/push/test', { method: 'POST', body: { endpoint } })
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer as ArrayBuffer
}

/** This browser's current subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Ask permission, subscribe this browser, and register it for the ritual. */
export async function enableRitual(hour: number): Promise<PushSubscription> {
  if (!pushSupported()) throw new Error('This browser cannot receive notifications.')
  const { enabled, publicKey } = await getPushKey()
  if (!enabled || !publicKey) throw new Error('Notifications are not set up on the server yet.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  await apiFetch('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), timezone, hour } })
  return sub
}

export async function disableRitual(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await apiFetch('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}
