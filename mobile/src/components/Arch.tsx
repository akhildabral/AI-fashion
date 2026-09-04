import MaskedView from '@react-native-masked-view/masked-view'
import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, ReduceMotion } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { EASE_OUT, duration } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, arch as archRatios, archFoot, bezel as bezelWidths, hairline, radius, rgbaParts } from '@/src/design/tokens'

export type ArchVariant = 'niche' | 'photo' | 'mirror' | 'plain'

export interface ArchProps {
  width: number
  /** Height, or derived from `aspect` (width / height). */
  height?: number
  aspect?: number
  variant?: ArchVariant
  children?: ReactNode
  selected?: boolean
  /** The brass bezel. On by default; off for skeletons. */
  bezel?: boolean
  /** Run the brass sheen across once, on first render. */
  sweep?: boolean
  style?: object
}

/**
 * The arch outline for a (w, h) box. The crown is a TRUE SEMICIRCLE of
 * radius w/2, the brand mark's own curve, whichever the aspect; the feet are
 * 3px, the house radius. There is one formula only: the Mirror is the same
 * semicircle at 2/3 with a heavier bezel. `inset` pulls every edge in so a
 * stroke of that width sits inside the box.
 *
 * An arch is portrait-only (1/1 is the limit); a wider box is clamped so the
 * path stays sane, but `Arch` never draws it, it draws a rectangle instead.
 */
export function archPath(w: number, h: number, _variant: ArchVariant = 'niche', inset = 0): string {
  const b = archFoot - inset / 2
  const r = Math.min(w / 2, h - b) - inset
  const x0 = inset
  const y0 = inset
  const x1 = w - inset
  const y1 = h - inset
  return [
    `M ${x0} ${y0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    `L ${x1 - r} ${y0}`,
    `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `L ${x1} ${y1 - b}`,
    `A ${b} ${b} 0 0 1 ${x1 - b} ${y1}`,
    `L ${x0 + b} ${y1}`,
    `A ${b} ${b} 0 0 1 ${x0} ${y1 - b}`,
    'Z',
  ].join(' ')
}

/** A 3px rectangle: what a landscape picture gets instead of an arch. */
function rectPath(w: number, h: number, inset = 0): string {
  const r = radius - inset / 2
  const x0 = inset
  const y0 = inset
  const x1 = w - inset
  const y1 = h - inset
  return [
    `M ${x0} ${y0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    `L ${x1 - r} ${y0}`,
    `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `L ${x1} ${y1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `L ${x0 + r} ${y1}`,
    `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    'Z',
  ].join(' ')
}

/** The brass sheen that crosses a tile once: the web's `arch-sweep`. */
function Sweep({ width, height: h }: { width: number; height: number }) {
  const { t } = useTheme()
  const x = useSharedValue(-1.3)
  const opacity = useSharedValue(0.9)
  useEffect(() => {
    x.set(withDelay(120, withTiming(1.3, { duration: duration.sweep, easing: EASE_OUT, reduceMotion: ReduceMotion.System })))
    opacity.set(withDelay(120 + duration.sweep * 0.6, withTiming(0, { duration: duration.sweep * 0.4, reduceMotion: ReduceMotion.System })))
  }, [x, opacity])
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() * width }, { rotate: '18deg' }],
    opacity: opacity.get(),
  }))
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={h}>
        <Defs>
          <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={t.brassHi} stopOpacity={0} />
            <Stop offset="0.5" stopColor={t.brassHi} stopOpacity={0.45} />
            <Stop offset="1" stopColor={t.brassHi} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={width * 0.3} y={-h} width={width * 0.4} height={h * 3} fill="url(#sweep)" />
      </Svg>
    </Animated.View>
  )
}

/**
 * The Mirror's hero: a 3px brass bezel around the dark reflective surface,
 * always at 2/3, a standing figure. Pass `height` only to override the ratio
 * for a fixed box.
 */
export function MirrorFrame({ width, height, children, style }: { width: number; height?: number; children?: ReactNode; style?: object }) {
  return (
    <Arch width={width} height={height ?? Math.round(width / archRatios.mirror.ratio)} variant="mirror" style={style}>
      {children}
    </Arch>
  )
}

/**
 * The signature form: a brass-bezelled aperture over a lit niche. Everything
 * the app shows a garment in is one of these. Portrait only: a box wider
 * than it is tall is not an arch, it is a 3px rectangle with a hairline, no
 * bezel and no crown, on the same lit fill.
 */
export function Arch({ width, height, aspect = 5 / 6, variant = 'niche', children, selected, bezel = true, sweep, style }: ArchProps) {
  const { t } = useTheme()
  const h = height ?? Math.round(width / aspect)
  const landscape = width > h
  const d = landscape ? rectPath(width, h) : archPath(width, h, variant)
  const bezelWidth = landscape ? hairline : variant === 'mirror' ? bezelWidths.mirror : bezelWidths.standard
  const inner = landscape ? rectPath(width, h, bezelWidth / 2) : archPath(width, h, variant, bezelWidth / 2)
  const small = width < 120
  const uid = `${variant}-${landscape ? 'r' : 'a'}-${Math.round(width)}-${Math.round(h)}`
  const edge = rgbaParts(t.nicheEdge)
  const sheen = rgbaParts(t.sheen)
  // Under 120px the vitrine flattens (the web's container query): a loosely
  // matted cut-out must not show its halo against a darkened edge.
  const tiny = width < 120
  const nicheStops: [string, string][] =
    variant === 'mirror'
      ? [
          ['0', t.mirror[0]],
          ['0.84', t.mirror[1]],
          ['1', t.mirror[1]],
        ]
      : tiny
        ? [
            ['0', t.niche[0]],
            ['1', t.niche[1]],
          ]
        : [
            ['0', t.niche[0]],
            ['0.86', t.niche[1]],
            ['1', t.niche[2]],
          ]
  const mirror = variant === 'mirror'
  // The web's bezels: 160deg brass-hi to brass-lo at 62%; the mirror's runs hi, brass at 45%, lo at 82%.
  const bezelStops: [string, string][] = mirror
    ? [
        ['0', t.brassHi],
        ['0.45', t.brassMid],
        ['0.82', t.brassLo],
        ['1', t.brassLo],
      ]
    : [
        ['0', t.brassHi],
        ['0.62', t.brassLo],
        ['1', t.brassLo],
      ]
  // A rectangle takes a hairline of ink (brass when selected), never a bezel.
  const stroke = landscape ? (selected ? t.brass : alpha(t.ink, 0.12)) : selected ? t.brass : `url(#bezel-${uid})`
  const strokeWidth = landscape ? bezelWidth : selected ? bezelWidth + 1 : bezelWidth

  return (
    <View style={[{ width, height: h }, style]}>
      <MaskedView
        style={{ width, height: h }}
        maskElement={
          <Svg width={width} height={h}>
            <Path d={d} fill="#000" />
          </Svg>
        }
      >
        {/* the niche: a lit vitrine (or the mirror's dark glass) */}
        <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`niche-${uid}`} cx="50%" cy="30%" rx={mirror ? '76%' : '78%'} ry={mirror ? '66%' : '74%'}>
              {nicheStops.map(([offset, color]) => (
                <Stop key={offset} offset={offset} stopColor={color} />
              ))}
            </RadialGradient>
          </Defs>
          <Rect width={width} height={h} fill={variant === 'plain' ? t.surface : `url(#niche-${uid})`} />
        </Svg>
        <View style={StyleSheet.absoluteFill}>{children}</View>
        {/* the vignette ring and the vitrine's inset shadow; photos skip both */}
        {mirror && (
          /* a whisper of shine on the glass, the web's 123 degree band */
          <Svg pointerEvents="none" width={width} height={h} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={`glass-${uid}`} x1="0" y1="0" x2="1" y2="0.65">
                <Stop offset="0.48" stopColor="#ECE5D8" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#ECE5D8" stopOpacity={0.05} />
                <Stop offset="0.52" stopColor="#ECE5D8" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width={width} height={h} fill={`url(#glass-${uid})`} />
          </Svg>
        )}
        {variant === 'niche' && !tiny && (
          <Svg pointerEvents="none" width={width} height={h} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id={`vig-${uid}`} cx="50%" cy="50%" rx="62%" ry="58%">
                <Stop offset="0" stopColor={edge.color} stopOpacity={0} />
                <Stop offset={small ? '0.9' : '0.72'} stopColor={edge.color} stopOpacity={0} />
                <Stop offset="1" stopColor={edge.color} stopOpacity={edge.opacity * (small ? 0.5 : 1)} />
              </RadialGradient>
              <LinearGradient id={`lip-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#281908" stopOpacity={0.14} />
                <Stop offset="1" stopColor="#281908" stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="1" y2="0.6">
                <Stop offset="0.35" stopColor={sheen.color} stopOpacity={0} />
                <Stop offset="0.5" stopColor={sheen.color} stopOpacity={sheen.opacity} />
                <Stop offset="0.65" stopColor={sheen.color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width={width} height={h} fill={`url(#vig-${uid})`} />
            <Rect width={width} height={small ? 6 : 14} fill={`url(#lip-${uid})`} />
            <Rect width={width} height={h} fill={`url(#sheen-${uid})`} />
          </Svg>
        )}
        {sweep && <Sweep width={width} height={h} />}
      </MaskedView>
      {/* the bezel (or the rectangle's hairline), drawn over the mask so the stroke is never clipped */}
      {bezel && (
        <Svg pointerEvents="none" width={width} height={h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`bezel-${uid}`} x1="0" y1="0" x2="0.64" y2="1">
              {bezelStops.map(([offset, color]) => (
                <Stop key={offset} offset={offset} stopColor={color} />
              ))}
            </LinearGradient>
          </Defs>
          <Path d={inner} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
        </Svg>
      )}
    </View>
  )
}
