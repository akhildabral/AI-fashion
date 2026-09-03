// The motion vocabulary, ported from index.css and tuned for Reanimated.
// Everything here runs on the UI thread; nothing animates layout.
import { Easing, FadeIn, FadeInDown, FadeOut, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated'

/** Entrances and UI: strong ease-out. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
/** On-screen movement. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1)
/** Sheets and drawers (the iOS sheet curve). */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1)
/** The web's `rise` curve. */
export const EASE_RISE = Easing.bezier(0.2, 0.7, 0.2, 1)

export const duration = {
  press: 120,
  toggle: 180,
  rise: 600,
  reveal: 850,
  sweep: 700,
} as const

export const timing = {
  press: { duration: duration.press, easing: EASE_OUT } satisfies WithTimingConfig,
  toggle: { duration: duration.toggle, easing: EASE_OUT } satisfies WithTimingConfig,
  move: { duration: 240, easing: EASE_IN_OUT } satisfies WithTimingConfig,
}

export const spring = {
  /** Default settle, no overshoot. */
  settle: { duration: 400, dampingRatio: 1, reduceMotion: ReduceMotion.System } satisfies WithSpringConfig,
  /** Reposition or snap back after a drag; pass `velocity` from the gesture. */
  snap: { duration: 400, dampingRatio: 0.8, reduceMotion: ReduceMotion.System } satisfies WithSpringConfig,
  /** Sheets and drawers. */
  sheet: { duration: 300, dampingRatio: 0.8, reduceMotion: ReduceMotion.System } satisfies WithSpringConfig,
}

/** How far a staggered list goes before every row shares the last delay. */
export const RISE_STAGGER_MS = 55
export const RISE_STAGGER_CAP = 8

/**
 * The web's `rise`: 12px up and a fade, 600ms, staggered by index. Use on
 * containers and small groups, never on virtualized list rows.
 */
export function rise(index = 0) {
  const step = Math.min(index, RISE_STAGGER_CAP)
  return FadeInDown.duration(duration.rise)
    .delay(step * RISE_STAGGER_MS)
    .easing(EASE_RISE)
    .withInitialValues({ transform: [{ translateY: 12 }] })
    .reduceMotion(ReduceMotion.System)
}

/** A plain fade for state swaps inside the same container. */
export const fadeIn = FadeIn.duration(220).easing(EASE_OUT).reduceMotion(ReduceMotion.System)
export const fadeOut = FadeOut.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.System)

/** Press feedback for anything tappable: the whole element, label and all. */
export const PRESS_SCALE = 0.97
