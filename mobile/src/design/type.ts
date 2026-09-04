// Typography: Bodoni Moda at 500 for headings and figures (never bold),
// Archivo for everything else, Playfair for the wordmark only. The ladder is
// the design system's native one (`./native.ts`, vendored verbatim), retyped
// here as React Native TextStyle so the roles can be spread into styles.
import type { TextStyle } from 'react-native'
import * as native from './native'

export const fonts = native.fonts

/** Tracking as React Native letterSpacing (px), from the web's em values. */
export function track(size: number, em: number): number {
  return Math.round(size * em * 100) / 100
}

/** The tracked-label em values the web uses; pair with `track(size, em)`. */
export const tracking = {
  labelXs: 0.12,
  labelSm: 0.14,
  label: 0.16,
  labelLg: 0.18,
  labelXl: 0.2,
  eyebrow: 0.28,
  eyebrowWide: 0.32,
} as const

export type TypeRole = keyof typeof native.type

const n = native.type

// Bodoni's ascenders and figures stand tall: native Text clips anything
// above the line box, so the serif roles keep at least 1.2x leading.
export const type: Record<TypeRole, TextStyle> = {
  display: { ...n.display },
  h1: { ...n.h1 },
  h2: { ...n.h2 },
  h3: { ...n.h3 },
  lede: { ...n.lede },
  body: { ...n.body },
  bodySm: { ...n.bodySm },
  caption: { ...n.caption },
  label: { ...n.label },
  micro: { ...n.micro },
  stat: { ...n.stat, fontVariant: [...n.stat.fontVariant] },
  statSm: { ...n.statSm, fontVariant: [...n.statSm.fontVariant] },
  wordmark: { ...n.wordmark },
}

/**
 * The control text sizes (the web's --text-ui 14 and --text-ui-sm 13): 14 on
 * a 44 control, 13 on every 36 and 32 control. Not roles; spread over one.
 */
export const control = {
  md: { fontSize: 14, lineHeight: 20 },
  sm: { fontSize: 13, lineHeight: 18 },
} as const

/**
 * Dynamic Type policy: body and UI roles scale to 200%; display roles cap at
 * 1.3x, because a 44pt Bodoni line at 2x pushes a room's header off screen.
 */
export const fontScale = native.fontScale

/** The roles that take the display cap: every Bodoni role and the wordmark. */
export const DISPLAY_ROLES: ReadonlySet<TypeRole> = new Set<TypeRole>(['display', 'h1', 'h2', 'h3', 'lede', 'stat', 'statSm', 'wordmark'])

export function maxFontScaleFor(role: TypeRole): number {
  return DISPLAY_ROLES.has(role) ? fontScale.displayMax : fontScale.uiMax
}

/** Every face the app loads at boot, keyed by the family name used above. */
export const fontAssets = {
  BodoniModa_400Regular: require('@expo-google-fonts/bodoni-moda/400Regular/BodoniModa_400Regular.ttf'),
  BodoniModa_500Medium: require('@expo-google-fonts/bodoni-moda/500Medium/BodoniModa_500Medium.ttf'),
  BodoniModa_400Regular_Italic: require('@expo-google-fonts/bodoni-moda/400Regular_Italic/BodoniModa_400Regular_Italic.ttf'),
  Archivo_400Regular: require('@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf'),
  Archivo_500Medium: require('@expo-google-fonts/archivo/500Medium/Archivo_500Medium.ttf'),
  Archivo_600SemiBold: require('@expo-google-fonts/archivo/600SemiBold/Archivo_600SemiBold.ttf'),
  Archivo_700Bold: require('@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf'),
  PlayfairDisplay_400Regular: require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
  NotoNastaliqUrdu_600SemiBold: require('@expo-google-fonts/noto-nastaliq-urdu/600SemiBold/NotoNastaliqUrdu_600SemiBold.ttf'),
}
