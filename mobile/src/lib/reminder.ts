import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// The daily ritual's two hooks, as locally scheduled notifications (remote
// push isn't available in Expo Go, so this works with the plain QR workflow):
//   morning — "your look for today" at getting-ready time
//   evening — "what did you wear?" recap that protects the wear log
// Preferences live on-device.

export type ReminderSlot = 'morning' | 'evening'

export interface ReminderPrefs {
  enabled: boolean
  hour: number
  minute: number
}

export const DEFAULT_REMINDERS: Record<ReminderSlot, ReminderPrefs> = {
  morning: { enabled: false, hour: 7, minute: 30 },
  evening: { enabled: false, hour: 20, minute: 30 },
}

const CONTENT: Record<ReminderSlot, { title: string; body: string }> = {
  morning: {
    title: 'Your look for today ☀️',
    body: 'Open ZAUQ to see what to wear — weather checked, closet ready.',
  },
  evening: {
    title: 'What did you wear today?',
    body: 'One tap in the Journal keeps your stylist learning.',
  },
}

function prefsKey(slot: ReminderSlot) {
  return slot === 'morning' ? 'morning-reminder' : 'evening-reminder'
}
function idKey(slot: ReminderSlot) {
  return `${prefsKey(slot)}-id`
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export async function getReminderPrefs(slot: ReminderSlot): Promise<ReminderPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(prefsKey(slot))
    if (!raw) return DEFAULT_REMINDERS[slot]
    return { ...DEFAULT_REMINDERS[slot], ...(JSON.parse(raw) as Partial<ReminderPrefs>) }
  } catch {
    return DEFAULT_REMINDERS[slot]
  }
}

async function cancelExisting(slot: ReminderSlot): Promise<void> {
  try {
    const id = await SecureStore.getItemAsync(idKey(slot))
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id)
      await SecureStore.deleteItemAsync(idKey(slot))
    }
  } catch {
    // Nothing scheduled — fine.
  }
}

/**
 * Enable (or reschedule) a daily reminder. Returns false when the user
 * declined notification permission.
 */
export async function enableReminder(
  slot: ReminderSlot,
  hour: number,
  minute: number,
): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return false

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rituals', {
      name: 'Daily reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  await cancelExisting(slot)
  const id = await Notifications.scheduleNotificationAsync({
    content: CONTENT[slot],
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(Platform.OS === 'android' ? { channelId: 'rituals' } : {}),
    },
  })
  await SecureStore.setItemAsync(idKey(slot), id)
  await SecureStore.setItemAsync(prefsKey(slot), JSON.stringify({ enabled: true, hour, minute }))
  return true
}

export async function disableReminder(slot: ReminderSlot): Promise<void> {
  await cancelExisting(slot)
  const prefs = await getReminderPrefs(slot)
  await SecureStore.setItemAsync(prefsKey(slot), JSON.stringify({ ...prefs, enabled: false }))
}
