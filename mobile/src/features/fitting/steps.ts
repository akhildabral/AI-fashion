// The fitting's six steps, their weights on the thread, and the pure helper
// the You room uses to say how much of the fitting is still open.
import type { Href } from 'expo-router'

export type StepKey = 'index' | 'taste' | 'city' | 'pieces' | 'reveal' | 'push'

export const STEPS: readonly StepKey[] = ['index', 'taste', 'city', 'pieces', 'reveal', 'push'] as const

/**
 * Where the thread has reached once a step is done. Weighted by effort, not
 * by count (plan §4: ~20s, ~60s, ~20s, ~90s, the reveal): the pieces are
 * the real stretch, and the reveal closes the line.
 */
export const PROGRESS: Record<StepKey, number> = {
  index: 12,
  taste: 46,
  city: 56,
  pieces: 90,
  reveal: 100,
  push: 100,
}

/** What the thread already shows when a step opens: the endowed start. */
export function progressBefore(step: StepKey): number {
  const i = STEPS.indexOf(step)
  return i <= 0 ? 4 : PROGRESS[STEPS[i - 1]]
}

/** The thread speaks in the stylist's voice, never in minutes (FittingPage.tsx). */
export const WORDS: Record<StepKey, string> = {
  index: 'A good start',
  taste: 'Getting to know you',
  city: 'A clear picture',
  pieces: 'Nearly there',
  reveal: 'Composed',
  push: 'Composed',
}

// Typed routes are generated from the files present when the dev server last
// ran, so the fitting's screens are named here once and cast once.
const HREFS: Record<StepKey, string> = {
  index: '/(fitting)',
  taste: '/(fitting)/taste',
  city: '/(fitting)/city',
  pieces: '/(fitting)/pieces',
  reveal: '/(fitting)/reveal',
  push: '/(fitting)/push',
}

export function hrefOf(step: StepKey): Href {
  return HREFS[step] as Href
}

/** The web's intents, and the only three the profile accepts. */
export const INTENTS = [
  ['decided', 'Decided for me', 'The outfit is waiting when I wake. I just put it on.'],
  ['own', 'Wearing what I own, better', 'Fewer new things, more of my closet actually worn.'],
  ['friends', 'Dressed by my friends', 'Verdicts, picks, and looks from people whose taste I trust.'],
] as const
export type Intent = (typeof INTENTS)[number][0]

/** The web's skin-tone swatches. */
export const TONES: readonly [string, string][] = [
  ['fair', '#F3DCC8'],
  ['light', '#E6BE9A'],
  ['medium', '#C9946A'],
  ['tan', '#A06A45'],
  ['deep', '#5E3B2A'],
]

/** The morning hours on offer for the ritual. */
export const HOURS = [6, 7, 8] as const

/** How many pieces the first look needs (the brief's MIN_ITEMS). */
export const PIECES_WANTED = 4
/** The fewest the member may leave with. */
export const PIECES_MIN = 3

/** The taste deck stops here even when the quiz has more to ask. */
export const DECK_MAX = 8

// ---- fittingProgress: what the fitting deferred, for the You room ----

/**
 * The shape `fittingProgress` reads. A `StyleProfile` fits it as is; the two
 * fields the profile does not carry (the handle from the member, the
 * reflection from the Mirror) are passed alongside when known.
 */
export interface FittingProgressInput {
  sizes?: { top?: string; bottom?: string; shoe?: string } | null
  skinTone?: string | null
  budgetBand?: string | null
  avoidColors?: string[] | null
  city?: string | null
  /** `user.handle`. */
  handle?: string | null
  /** Whether a reflection hangs in the Mirror (`photoUrl`, or a boolean). */
  reflection?: string | boolean | null
}

export interface FittingProgress {
  done: number
  total: number
  /** What is still open, in the order the Profile asks for it. */
  missing: string[]
}

/**
 * "3 of 7": how much of the fitting the member has filled in across the
 * seven things the phone's fitting deferred. Pure and dependency-free so
 * any room can import it.
 */
export function fittingProgress(profile: FittingProgressInput | null | undefined): FittingProgress {
  const p = profile ?? {}
  const sizes = p.sizes ?? {}
  const checks: [string, boolean][] = [
    ['Sizes', !!(sizes.top || sizes.bottom || sizes.shoe)],
    ['Skin tone', !!p.skinTone],
    ['Budget', !!p.budgetBand],
    ['Colours to avoid', (p.avoidColors?.length ?? 0) > 0],
    ['City', !!(p.city && p.city.trim())],
    ['Handle', !!p.handle],
    ['Reflection', !!p.reflection],
  ]
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label)
  return { done: checks.length - missing.length, total: checks.length, missing }
}
