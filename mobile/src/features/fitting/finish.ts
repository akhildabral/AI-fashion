// The end of the fitting: the one profile write, the quiz submitted just
// before it, the name if it changed, and the morning ritual.
import Constants from 'expo-constants'
import { getLocales } from 'expo-localization'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { saveFitting, updateName, type FittingPatch } from '@zauq/shared/fitting'
import { submitQuiz } from '@zauq/shared/quiz'
import type { StyleProfile, User } from '@zauq/shared/types'
import { apiFetch } from '@/src/lib/api'
import { quizChoices, type FittingDraft } from './draft'

/** The web's last step index; sent so the web's fitting reads as complete too. */
const WEB_LAST_STEP = 13

/** Exactly what PUT /profile receives at the end of the fitting. */
export function fittingPayload(draft: FittingDraft): FittingPatch {
  const measurement = getLocales()[0]?.measurementSystem
  const city = draft.city.trim()
  return {
    ...(draft.intent ? { intents: [draft.intent] } : {}),
    ...(draft.tone ? { skinTone: draft.tone } : {}),
    ...(city ? { city } : {}),
    units: measurement === 'us' ? 'imperial' : 'metric',
    fittingStep: WEB_LAST_STEP,
    fittingDone: true,
  }
}

/**
 * Write everything collected. The quiz goes first (its own endpoint), the
 * name if it changed, then the profile; only the profile write is allowed
 * to fail the finish, because it is the one the room gate reads.
 */
export async function finishFitting(draft: FittingDraft, user: User | null): Promise<{ profile: StyleProfile; user: User | null }> {
  const choices = quizChoices(draft.answers)
  if (Object.keys(choices).length > 0) {
    await submitQuiz(choices).catch(() => undefined)
  }
  let updated: User | null = null
  const firstName = draft.firstName.trim()
  if (user && firstName && firstName !== (user.firstName ?? '')) {
    updated = await updateName(firstName, user.lastName ?? null)
      .then((r) => ({ ...user, ...r.user }))
      .catch(() => null)
  }
  const { profile } = await saveFitting(fittingPayload(draft))
  return { profile, user: updated }
}

export type RitualOutcome = 'set' | 'denied' | 'unavailable'

/**
 * Ask the OS, then register this phone for the morning brief at `hour`.
 * Without an EAS project id (a local dev build) there is no push token to
 * register, so the ritual is quietly left for the You room.
 */
export async function setRitual(hour: number): Promise<RitualOutcome> {
  const perm = await Notifications.requestPermissionsAsync()
  if (!perm.granted) return 'denied'
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
  const platform = Platform.OS
  if (!projectId || (platform !== 'ios' && platform !== 'android')) return 'unavailable'
  const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId })
  await apiFetch('/push/subscribe', {
    method: 'POST',
    body: { expoToken, platform, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, hour },
  })
  return 'set'
}
