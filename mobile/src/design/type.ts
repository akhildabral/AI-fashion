// Typography: Bodoni Moda for headings and figures, Archivo for everything
// else, Playfair for the wordmark only. The scale mirrors the web's Tailwind
// usage so the two apps read as one product.
import type { TextStyle } from 'react-native'

export const fonts = {
  serif: 'BodoniModa_400Regular',
  serifMedium: 'BodoniModa_500Medium',
  serifSemi: 'BodoniModa_600SemiBold',
  serifBold: 'BodoniModa_700Bold',
  serifItalic: 'BodoniModa_400Regular_Italic',
  serifSemiItalic: 'BodoniModa_600SemiBold_Italic',
  sans: 'Archivo_400Regular',
  sansMedium: 'Archivo_500Medium',
  sansSemi: 'Archivo_600SemiBold',
  sansBold: 'Archivo_700Bold',
  brand: 'PlayfairDisplay_400Regular',
  urdu: 'NotoNastaliqUrdu_400Regular',
  urduSemi: 'NotoNastaliqUrdu_600SemiBold',
} as const

/** Tracking as React Native letterSpacing (px), from the web's em values. */
function track(size: number, em: number): number {
  return Math.round(size * em * 100) / 100
}

export type TypeRole =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'lede'
  | 'body'
  | 'bodySm'
  | 'caption'
  | 'label'
  | 'micro'
  | 'stat'
  | 'statSm'
  | 'wordmark'

// Bodoni's ascenders and figures stand tall: native Text clips anything
// above the line box, so the serif roles keep at least 1.2x leading.
export const type: Record<TypeRole, TextStyle> = {
  display: { fontFamily: fonts.serif, fontSize: 44, lineHeight: 54, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 40 },
  h2: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 30 },
  h3: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26 },
  lede: { fontFamily: fonts.serifItalic, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fonts.sansSemi, fontSize: 11, lineHeight: 14, letterSpacing: track(11, 0.18), textTransform: 'uppercase' },
  micro: { fontFamily: fonts.sansSemi, fontSize: 10, lineHeight: 12, letterSpacing: track(10, 0.16), textTransform: 'uppercase' },
  stat: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 38, fontVariant: ['tabular-nums'] },
  statSm: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] },
  wordmark: { fontFamily: fonts.brand, fontSize: 22, lineHeight: 28, textTransform: 'uppercase' },
}

/** Every face the app loads at boot, keyed by the family name used above. */
export const fontAssets = {
  BodoniModa_400Regular: require('@expo-google-fonts/bodoni-moda/400Regular/BodoniModa_400Regular.ttf'),
  BodoniModa_500Medium: require('@expo-google-fonts/bodoni-moda/500Medium/BodoniModa_500Medium.ttf'),
  BodoniModa_600SemiBold: require('@expo-google-fonts/bodoni-moda/600SemiBold/BodoniModa_600SemiBold.ttf'),
  BodoniModa_700Bold: require('@expo-google-fonts/bodoni-moda/700Bold/BodoniModa_700Bold.ttf'),
  BodoniModa_400Regular_Italic: require('@expo-google-fonts/bodoni-moda/400Regular_Italic/BodoniModa_400Regular_Italic.ttf'),
  BodoniModa_600SemiBold_Italic: require('@expo-google-fonts/bodoni-moda/600SemiBold_Italic/BodoniModa_600SemiBold_Italic.ttf'),
  Archivo_400Regular: require('@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf'),
  Archivo_500Medium: require('@expo-google-fonts/archivo/500Medium/Archivo_500Medium.ttf'),
  Archivo_600SemiBold: require('@expo-google-fonts/archivo/600SemiBold/Archivo_600SemiBold.ttf'),
  Archivo_700Bold: require('@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf'),
  PlayfairDisplay_400Regular: require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
  NotoNastaliqUrdu_400Regular: require('@expo-google-fonts/noto-nastaliq-urdu/400Regular/NotoNastaliqUrdu_400Regular.ttf'),
  NotoNastaliqUrdu_600SemiBold: require('@expo-google-fonts/noto-nastaliq-urdu/600SemiBold/NotoNastaliqUrdu_600SemiBold.ttf'),
}
