import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// Morning-ritual reminder: a locally scheduled daily notification (remote
// push isn't available in Expo Go), so it works with the plain QR workflow.
// Tapping it opens the app; the Wardrobe screen's "what to wear today" does
// the rest. Preferences live on-device.

const PREFS_KEY = 'morning-reminder'
const REMINDER_ID_KEY = 'morning-reminder-id'

export interface ReminderPrefs {
  enabled: boolean
  hour: number
  minute: number
}

export const DEFAULT_REMINDER: ReminderPrefs = { enabled: false, hour: 7, minute: 30 }

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(PREFS_KEY)
    if (!raw) return DEFAULT_REMINDER
    return { ...DEFAULT_REMINDER, ...(JSON.parse(raw) as Partial<ReminderPrefs>) }
  } catch {
    return DEFAULT_REMINDER
  }
}

async function cancelExisting(): Promise<void> {
  try {
    const id = await SecureStore.getItemAsync(REMINDER_ID_KEY)
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id)
      await SecureStore.deleteItemAsync(REMINDER_ID_KEY)
    }
  } catch {
    // Nothing scheduled — fine.
  }
}

/**
 * Enable (or reschedule) the daily reminder. Returns false when the user
 * declined notification permission.
 */
export async function enableReminder(hour: number, minute: number): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return false

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('morning', {
      name: 'Morning look',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  await cancelExisting()
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your look for today ☀️',
      body: 'Open AI Fashion to see what to wear — weather checked, closet ready.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(Platform.OS === 'android' ? { channelId: 'morning' } : {}),
    },
  })
  await SecureStore.setItemAsync(REMINDER_ID_KEY, id)
  await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify({ enabled: true, hour, minute }))
  return true
}

export async function disableReminder(): Promise<void> {
  await cancelExisting()
  const prefs = await getReminderPrefs()
  await SecureStore.setItemAsync(
    PREFS_KEY,
    JSON.stringify({ ...prefs, enabled: false }),
  )
}
