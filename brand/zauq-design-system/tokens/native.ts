// ZAUQ native tokens — the same system as styles.css, in a form React Native
// can consume (RN has no CSS custom properties). Ported from the shipping app
// (mobile/src/design/*) with the corrections this design system prescribes;
// every correction is marked CORRECTED and explained in guidelines/
// mobile-platform.md.
//
// Drop-in: copy this file to mobile/src/design/tokens.ds.ts and import from it,
// or diff it against the app's own tokens.ts.

export const light = {
  ink: '#221B12',
  bone: '#EBE5D7',
  surface: '#F5F0E6',
  brass: '#B98C3B',
  brassDeep: '#A67C30',
  brassDeeper: '#8A6620',
  brassSoft: '#EFE3CC',
  brassHi: '#CBA24E',
  brassMid: '#B98C3B',
  brassLo: '#7A5A22',
  onBrass: '#1A1509',
  danger: '#BE423A',
  success: '#4E7A54',
  warning: '#9A6E2A',
  niche: ['#FDFAF4', '#EFE7D7', '#E8DDC6'],
  nicheEdge: 'rgba(228, 217, 192, 0.85)',
  sheen: 'rgba(255, 255, 255, 0.16)',
  mirror: ['#211D17', '#0C0B09'],
  washA: 'rgba(160, 120, 40, 0.08)',
  washB: 'rgba(124, 45, 42, 0.05)',
  grainOpacity: 0.045,
  grainBlend: 'multiply',
  statusBar: 'dark',
  /** The niche is light in BOTH themes: anything drawn inside one uses these. */
  inNiche: '#1A1509',
  inNicheMuted: 'rgba(26, 21, 9, 0.5)',
}

export const dark = {
  ...light,
  ink: '#ECE5D8',
  bone: '#0E0D0B',
  surface: '#1A1714',
  brass: '#C8A45E',
  brassDeep: '#D9B87A',
  brassDeeper: '#E4CB94',
  brassSoft: '#2A2114',
  brassHi: '#E4CB94',
  brassMid: '#C8A45E',
  brassLo: '#8F6E32',
  danger: '#D86C64',
  success: '#8AB894',
  warning: '#C8A45E',
  niche: ['#FDFBF6', '#EFE7D7', '#E8DDC6'],
  nicheEdge: 'rgba(228, 217, 192, 0.9)',
  sheen: 'rgba(233, 217, 188, 0.07)',
  washA: 'rgba(200, 164, 94, 0.1)',
  washB: 'rgba(124, 45, 42, 0.08)',
  grainOpacity: 0.05,
  grainBlend: 'screen',
  statusBar: 'light',
}

/** Identity constants. Never themed. Terracotta is EDITORIAL ONLY — never UI. */
export const BRAND = {
  gold: '#D8B26A',
  ink: '#0B0A09',
  cream: '#F2EDE3',
  neutral: '#D6CFC0',
  muted: '#B9AE97',
  terracotta: '#A9563A',
} as const

// ---- geometry ----
/** 3px everywhere. The arch is the only curve. */
export const radius = 3
/** The arch's feet. CORRECTED: 3px (was 5px on web, 2-3px in the brand guide). */
export const archFoot = 3

/**
 * Arched frames are PORTRAIT ONLY: the crown is a semicircle of radius w/2,
 * so anything wider than 1:1 stretches. Landscape pictures are 3px rectangles.
 * crownRatio is the crown height as a fraction of the frame HEIGHT = 0.5 * w/h.
 */
export const arch = {
  mirror: { ratio: 2 / 3, crownRatio: 0.333 },
  portrait: { ratio: 4 / 5, crownRatio: 0.4 },
  garment: { ratio: 5 / 6, crownRatio: 0.417 },
  tile: { ratio: 3 / 4, crownRatio: 0.375 },
  square: { ratio: 1, crownRatio: 0.5 },
} as const
/** Stroke of the brand mark: a fixed 1:104 of the arch width, at any size. */
export const ARCH_STROKE_RATIO = 1 / 104
/** The bezel does NOT scale with the frame. */
export const bezel = { standard: 2, mirror: 3 } as const

/**
 * Visual control heights, shared with the web.
 * CORRECTED for Android: the visual may be 44/36/32, but the TOUCH area must
 * never be smaller than 48x48dp — use hitSlop to make up the difference.
 */
export const height = { action: 44, secondary: 36, filter: 32 } as const
export const MIN_TOUCH = { ios: 44, android: 48 } as const

/** CORRECTED: 20 and 40 added, so the native scale matches the web's rhythm. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  ml: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  xxxxl: 48,
} as const

/** Phone gutter. Intentionally 20 (not the web's 16/24) — see mobile-platform.md. */
export const gutter = 20
export const hairline = 1

/** The one floating shadow: menus, sheets, toasts. Nothing rests with a shadow. */
export const shadowFloat = {
  shadowColor: '#000000',
  shadowOpacity: 0.5,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 18 },
  elevation: 12,
} as const

// ---- type ----
/**
 * CORRECTED: display, h1, h2, h3 and the stat roles move to Bodoni **500**.
 * The brand sets headings at weight 500 and never bold; the app was using 400,
 * which reads thin against the web at the same size.
 * Serif roles keep >= 1.2x leading — native Text clips tall ascenders.
 */
export const fonts = {
  serif: 'BodoniModa_400Regular',
  serifMedium: 'BodoniModa_500Medium',
  serifItalic: 'BodoniModa_400Regular_Italic',
  sans: 'Archivo_400Regular',
  sansMedium: 'Archivo_500Medium',
  sansSemi: 'Archivo_600SemiBold',
  sansBold: 'Archivo_700Bold',
  brand: 'PlayfairDisplay_400Regular',
  urduSemi: 'NotoNastaliqUrdu_600SemiBold',
} as const

const track = (size: number, em: number) => Math.round(size * em * 100) / 100

export const type = {
  display: { fontFamily: fonts.serifMedium, fontSize: 44, lineHeight: 54, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.serifMedium, fontSize: 32, lineHeight: 40, letterSpacing: -0.32 },
  h2: { fontFamily: fonts.serifMedium, fontSize: 24, lineHeight: 30, letterSpacing: -0.24 },
  h3: { fontFamily: fonts.serifMedium, fontSize: 20, lineHeight: 26 },
  lede: { fontFamily: fonts.serifItalic, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  label: {
    fontFamily: fonts.sansSemi,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: track(11, 0.18),
    textTransform: 'uppercase',
  },
  micro: {
    fontFamily: fonts.sansSemi,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: track(10, 0.16),
    textTransform: 'uppercase',
  },
  stat: { fontFamily: fonts.serifMedium, fontSize: 30, lineHeight: 38, fontVariant: ['tabular-nums'] },
  statSm: { fontFamily: fonts.serifMedium, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] },
  wordmark: { fontFamily: fonts.brand, fontSize: 22, lineHeight: 28, textTransform: 'uppercase' },
} as const

/**
 * Dynamic Type / font-scale policy. CORRECTED: the app capped nothing.
 * Body and UI roles scale freely to 200%; display roles cap at 1.3x, because a
 * 44pt Bodoni line at 2x pushes a room's header off the screen. Never a fixed
 * height on a text container.
 */
export const fontScale = { uiMax: 2, displayMax: 1.3 } as const

// ---- motion ----
export const EASE = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  sheet: [0.32, 0.72, 0, 1],
  rise: [0.2, 0.7, 0.2, 1],
} as const

/** CORRECTED: press is 150ms, matching the web. 120 was a native-only drift. */
export const duration = { press: 150, toggle: 180, rise: 600, reveal: 850, sweep: 700 } as const
export const spring = {
  settle: { duration: 400, dampingRatio: 1 },
  snap: { duration: 400, dampingRatio: 0.8 },
  sheet: { duration: 300, dampingRatio: 0.8 },
} as const
export const PRESS_SCALE = 0.97
export const RISE = { translateY: 12, staggerMs: 55, staggerCap: 8 } as const

/** `#RRGGBB` at an opacity, for the `ink/45` washes the web uses everywhere. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
