// The Atelier palette, ported from frontend/src/index.css. Two themes: the
// gallery by day and the atelier by night (the default). Colours are hex so
// they drop straight into React Native styles; `alpha()` gives the `ink/45`
// style washes the web uses everywhere.

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
  spark: string
  sparkDeep: string
  sparkSoft: string
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
}

export const light: Palette = {
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
  spark: '#8A6620',
  sparkDeep: '#7A5A22',
  sparkSoft: '#E7DEC9',
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
}

export const dark: Palette = {
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
  onBrass: '#1A1509',
  spark: '#D9B87A',
  sparkDeep: '#E4CB94',
  sparkSoft: '#2A2114',
  danger: '#D86C64',
  success: '#8AB894',
  warning: '#C8A45E',
  niche: ['#FDFBF6', '#EFE7D7', '#E8DDC6'],
  nicheEdge: 'rgba(228, 217, 192, 0.9)',
  sheen: 'rgba(233, 217, 188, 0.07)',
  mirror: ['#211D17', '#0C0B09'],
  washA: 'rgba(200, 164, 94, 0.10)',
  washB: 'rgba(124, 45, 42, 0.08)',
  grainOpacity: 0.05,
  grainBlend: 'screen',
  statusBar: 'light',
}

/** The brand constants (components/Brand.tsx on the web). */
export const BRAND = {
  gold: '#D8B26A',
  ink: '#0B0A09',
  cream: '#F2EDE3',
  neutral: '#D6CFC0',
} as const

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
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// ---- geometry ----
// Square-cornered: 3px everywhere, the arch is the only curve.
export const radius = 3
/** The control height scale: every action, tab, filter and chip sits on it. */
export const height = { action: 44, secondary: 36, filter: 32 } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const
/** Screen gutter, left and right. */
export const gutter = 20
/** The one floating shadow: menus, sheets, toasts only. Nothing rests with a shadow. */
export const shadowFloat = {
  shadowColor: '#000000',
  shadowOpacity: 0.5,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 18 },
  elevation: 12,
} as const
/** Hairline rules, matching the web's border-ink/10. */
export const hairline = 1
