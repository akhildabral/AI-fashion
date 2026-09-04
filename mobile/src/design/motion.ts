// The motion vocabulary, from the design system's native tokens
// (`./native.ts`, vendored verbatim) and tuned for Reanimated. Everything here
// runs on the UI thread; nothing animates layout.
import { Easing, FadeIn, FadeInDown, FadeOut, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated'
import * as native from './native'

const bezier = ([x1, y1, x2, y2]: readonly [number, number, number, number]) => Easing.bezier(x1, y1, x2, y2)

/** Entrances and UI: strong ease-out. */
export const EASE_OUT = bezier(native.EASE.out)
/** On-screen movement. */
export const EASE_IN_OUT = bezier(native.EASE.inOut)
/** Sheets and drawers (the iOS sheet curve). */
export const EASE_SHEET = bezier(native.EASE.sheet)
/** The web's `rise` curve. */
export const EASE_RISE = bezier(native.EASE.rise)

/** press 150 · toggle 180 · rise 600 · reveal 850 · sweep 700, the same as the web. */
export const duration = native.duration

export const timing = {
  press: { duration: duration.press, easing: EASE_OUT } satisfies WithTimingConfig,
  toggle: { duration: duration.toggle, easing: EASE_OUT } satisfies WithTimingConfig,
  move: { duration: 240, easing: EASE_IN_OUT } satisfies WithTimingConfig,
}

export const spring = {
  /** Default settle, no overshoot. */
  settle: { ...native.spring.settle, reduceMotion: ReduceMotion.System } satisfies WithSpringConfig,
  /** Reposition or snap back after a drag; pass `velocity` from the gesture. */
  snap: { ...native.spring.snap, reduceMotion: ReduceMotion.System } satisfies WithSpringConfig,
  /** Sheets and drawers. */
  sheet: { ...native.spring.sheet, reduceMotion: ReduceMotion.System } satisfies WithSpringConfig,
}

/** The rise entrance: 12px up, 55ms per item, capped at 8 so a long grid never crawls in. */
export const RISE = native.RISE
export const RISE_STAGGER_MS = RISE.staggerMs
export const RISE_STAGGER_CAP = RISE.staggerCap

/**
 * The web's `rise`: 12px up and a fade, 600ms, staggered by index. Use on
 * containers and small groups, never on virtualized list rows.
 */
export function rise(index = 0) {
  const step = Math.min(index, RISE_STAGGER_CAP)
  return FadeInDown.duration(duration.rise)
    .delay(step * RISE_STAGGER_MS)
    .easing(EASE_RISE)
    .withInitialValues({ transform: [{ translateY: RISE.translateY }] })
    .reduceMotion(ReduceMotion.System)
}

/** A plain fade for state swaps inside the same container. */
export const fadeIn = FadeIn.duration(220).easing(EASE_OUT).reduceMotion(ReduceMotion.System)
export const fadeOut = FadeOut.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.System)

/** Press feedback for anything tappable: the whole element, label and all, to 0.97 in 150ms. */
export const PRESS_SCALE = native.PRESS_SCALE
