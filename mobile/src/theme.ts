import { Platform } from 'react-native'

/**
 * Shared design tokens, echoing the web app's aesthetic: soft bone background,
 * dark "ink" text, a warm clay accent, and a sage secondary.
 */
export const colors = {
  ink: '#1a1a1a',
  inkSoft: 'rgba(26,26,26,0.60)',
  inkFaint: 'rgba(26,26,26,0.40)',
  inkLine: 'rgba(26,26,26,0.10)',
  inkLine2: 'rgba(26,26,26,0.15)',
  bone: '#f7f5f0',
  boneSoft: '#efece4',
  clay: '#b98d6f',
  sage: '#8a9a86',
  white: '#ffffff',
  danger: '#b91c1c',
  dangerBg: '#fef2f2',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const

/**
 * A serif face for headings if the platform has one readily available, else the
 * system font. (We avoid bundling a custom font to keep the managed app light.)
 */
export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
} as const

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
} as const
