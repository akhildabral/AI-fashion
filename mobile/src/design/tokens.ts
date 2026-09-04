// The Atelier palette and geometry, re-exported from the vendored design
// system token module (`./native.ts` is a verbatim copy of
// brand/zauq-design-system/tokens/native.ts; re-sync it, never edit it).
// This file only adds the React Native typing the app relies on and the two
// helpers (`rgbaParts`, `hitSlopFor`) the design system does not ship.
import { Platform } from 'react-native'
import * as native from './native'

export interface Palette {
  ink: string
  bone: string
  surface: string
  /** Brass: the one accent. Means "act" or "here", never decoration. */
  brass: string
  brassDeep: string
  brassDeeper: string
  brassSoft: string
  /** The bezel gradient, top-left to bottom-right. */
  brassHi: string
  brassMid: string
  brassLo: string
  /** Ink for text on a brass fill. Same in both themes. */
  onBrass: string
  danger: string
  success: string
  warning: string
  /** The lit vitrine behind every garment. Near-white in both themes. */
  niche: [string, string, string]
  nicheEdge: string
  sheen: string
  /** The Mirror's dark reflective surface. */
  mirror: [string, string]
  /** Ambient washes behind every screen. */
  washA: string
  washB: string
  grainOpacity: number
  grainBlend: 'multiply' | 'screen'
  /** System chrome. */
  statusBar: 'light' | 'dark'
  /** The niche is light in BOTH themes: anything drawn inside one uses these. */
  inNiche: string
  inNicheMuted: string
}

export const light = native.light as Palette
export const dark = native.dark as Palette

/** Identity constants. Never themed. Terracotta is EDITORIAL ONLY, never UI. */
export const BRAND = native.BRAND

/**
 * Split an `rgba()` token into a hex colour and its alpha. SVG gradient
 * stops need the alpha as `stopOpacity`; they ignore it inside `rgba()`.
 */
export function rgbaParts(rgba: string): { color: string; opacity: number } {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (!m) return { color: rgba, opacity: 1 }
  const hex = [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  return { color: `#${hex}`, opacity: m[4] === undefined ? 1 : Number(m[4]) }
}

/** `#RRGGBB` at an opacity, for the `ink/45` style washes. */
export const alpha = native.alpha

// ---- geometry ----
/** 3px everywhere. The arch is the only curve. */
export const radius = native.radius
/** The arch's feet: 3px, the house radius. */
export const archFoot = native.archFoot
/** The closed list of arch ratios (width / height) and their crown heights. Portrait only. */
export const arch = native.arch
export const ARCH_STROKE_RATIO = native.ARCH_STROKE_RATIO
/** Bezel stroke: 2 on every arch, 3 on the Mirror. Does not scale with the frame. */
export const bezel = native.bezel
/** The control height scale: every action, tab, filter and chip sits on it. */
export const height = native.height
/** The touch floor: 44pt on iOS, 48dp on Android. Visuals stay 44/36/32; hitSlop makes up the rest. */
export const MIN_TOUCH = native.MIN_TOUCH
/** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 (label 8, element 16, block 32, group 40). */
export const space = native.space
/** Screen gutter, left and right. */
export const gutter = native.gutter
/** Hairline rules, matching the web's border-ink/10. */
export const hairline = native.hairline
/** The one floating shadow: menus, sheets, toasts, the undo bar. Nothing rests with a shadow. */
export const shadowFloat = native.shadowFloat

/** The touch floor on this platform. */
export const minTouch = Platform.OS === 'android' ? MIN_TOUCH.android : MIN_TOUCH.ios

/**
 * The `hitSlop` that lifts a control's effective touch area to the platform
 * floor without growing the visual: pass the smaller of its width and height.
 * A 36 icon button gets 6 on Android, 4 on iOS; a 32 filter 8 and 6.
 */
export function hitSlopFor(visual: number): number {
  return Math.max(0, Math.ceil((minTouch - visual) / 2))
}
