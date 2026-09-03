// Haptics: one per user action, in the same frame as the visual, never the
// only feedback. Every call is fire-and-forget and safe on hardware without a
// motor.
import * as Haptics from 'expo-haptics'

function fire(p: Promise<void>) {
  p.catch(() => undefined)
}

/** A value ticked past a step: a picker detent, a taste choice, a day change. */
export function select() {
  fire(Haptics.selectionAsync())
}

/** Something caught: a reaction, a piece put back or taken off, a sheet detent. */
export function tap() {
  fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
}

/** Something landed with weight: a destructive action fired. */
export function thud() {
  fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
}

/** An operation finished well: a wear logged, a reflection ready. */
export function success() {
  fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
}

/** An operation failed: a render or an upload. */
export function failure() {
  fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))
}
