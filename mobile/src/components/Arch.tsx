import MaskedView from '@react-native-masked-view/masked-view'
import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, ReduceMotion } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { EASE_OUT, duration } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { rgbaParts } from '@/src/design/tokens'

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
 * The arch outline for a (w, h) box: the crown is 46% of the width across and
 * 0.373 x width tall whichever the aspect (the web's `46% 46% 5px 5px /
 * var(--arch-h)`), bottom corners 5px. The Mirror's frame is squarer at the
 * crown (48% / 26% of height).
 */
export function archPath(w: number, h: number, variant: ArchVariant = 'niche', inset = 0): string {
  const mirror = variant === 'mirror'
  const rx = (mirror ? 0.48 : 0.46) * w - inset
  const ry = (mirror ? 0.26 * h : 0.373 * w) - inset
  const b = (mirror ? 6 : 5) - inset / 2
  const x0 = inset
  const y0 = inset
  const x1 = w - inset
  const y1 = h - inset
  return [
    `M ${x0} ${y0 + ry}`,
    `A ${rx} ${ry} 0 0 1 ${x0 + rx} ${y0}`,
    `L ${x1 - rx} ${y0}`,
    `A ${rx} ${ry} 0 0 1 ${x1} ${y0 + ry}`,
    `L ${x1} ${y1 - b}`,
    `A ${b} ${b} 0 0 1 ${x1 - b} ${y1}`,
    `L ${x0 + b} ${y1}`,
    `A ${b} ${b} 0 0 1 ${x0} ${y1 - b}`,
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
 * The signature form: a brass-bezelled aperture over a lit niche. Everything
 * the app shows a garment in is one of these.
 */
export function Arch({ width, height, aspect = 5 / 6, variant = 'niche', children, selected, bezel = true, sweep, style }: ArchProps) {
  const { t } = useTheme()
  const h = height ?? Math.round(width / aspect)
  const d = archPath(width, h, variant)
  const bezelWidth = variant === 'mirror' ? 3 : 2
  const inner = archPath(width, h, variant, bezelWidth / 2)
  const small = width < 120
  const uid = `${variant}-${Math.round(width)}-${Math.round(h)}`
  const edge = rgbaParts(t.nicheEdge)
  const sheen = rgbaParts(t.sheen)
  const nicheStops: [string, string][] =
    variant === 'mirror'
      ? [
          ['0', t.mirror[0]],
          ['0.84', t.mirror[1]],
          ['1', t.mirror[1]],
        ]
      : [
          ['0', t.niche[0]],
          ['0.86', t.niche[1]],
          ['1', t.niche[2]],
        ]

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
            <RadialGradient id={`niche-${uid}`} cx="50%" cy="30%" rx="78%" ry="74%">
              {nicheStops.map(([offset, color]) => (
                <Stop key={offset} offset={offset} stopColor={color} />
              ))}
            </RadialGradient>
          </Defs>
          <Rect width={width} height={h} fill={variant === 'plain' ? t.surface : `url(#niche-${uid})`} />
        </Svg>
        <View style={StyleSheet.absoluteFill}>{children}</View>
        {/* the vignette ring and the vitrine's inset shadow; photos skip both */}
        {variant === 'niche' && (
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
      {/* the bezel, drawn over the mask so the stroke is never clipped */}
      {bezel && (
        <Svg pointerEvents="none" width={width} height={h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`bezel-${uid}`} x1="0" y1="0" x2="0.64" y2="1">
              <Stop offset="0" stopColor={t.brassHi} />
              <Stop offset="0.62" stopColor={t.brassLo} />
              <Stop offset="1" stopColor={t.brassLo} />
            </LinearGradient>
          </Defs>
          <Path d={inner} fill="none" stroke={selected ? t.brass : `url(#bezel-${uid})`} strokeWidth={selected ? bezelWidth + 1 : bezelWidth} />
        </Svg>
      )}
    </View>
  )
}
