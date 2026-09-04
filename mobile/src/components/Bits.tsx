// Small furniture used on every screen: section heads, stats, plaques,
// hairlines, the failed-fetch state.
import { useState, type ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { Button } from './Button'
import { T } from './Text'

export function SectionHead({ title, action, style }: { title: string; action?: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.head, style]}>
      <T role="h2" accessibilityRole="header">
        {title}
      </T>
      {action}
    </View>
  )
}

/** A Bodoni tabular figure over a tracked micro-label. */
export function Stat({ value, label, tone = 'ink' as 'ink' | 'brass', small }: { value: string | number; label: string; tone?: 'ink' | 'brass'; small?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <T role={small ? 'statSm' : 'stat'} tone={tone}>
        {String(value)}
      </T>
      <T role="micro" tone="faint">
        {label}
      </T>
    </View>
  )
}

export function Hairline({ style }: { style?: ViewStyle }) {
  const { t } = useTheme()
  return <View style={[{ height: hairline, backgroundColor: alpha(t.ink, 0.12) }, style]} />
}

/** A gradient panel with a 2px engraved brass left edge: the ROI figure, the estate value. */
export function Plaque({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { t } = useTheme()
  // Percent sizes are unreliable on an absolutely placed Svg; measure instead.
  const [size, setSize] = useState({ w: 0, h: 0 })
  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[styles.plaque, { borderRadius: radius, backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1) }, style]}
    >
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={size.w} height={size.h}>
        <Defs>
          <LinearGradient id="plaque" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.brassSoft} stopOpacity={0.9} />
            <Stop offset="1" stopColor={t.surface} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="plaqueEdge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.brassHi} />
            <Stop offset="1" stopColor={t.brassLo} />
          </LinearGradient>
        </Defs>
        <Rect width={size.w} height={size.h} fill="url(#plaque)" />
        <Rect width={2} height={size.h} fill="url(#plaqueEdge)" />
      </Svg>
      {children}
    </View>
  )
}

/** The standard failed-fetch state with a retry. */
export function LoadError({ message = 'The stylist is out for a moment.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.error}>
      <T role="body" tone="muted" align="center">
        {message}
      </T>
      {onRetry ? <Button label="Try again" variant="ghost" size="sm" onPress={onRetry} /> : null}
    </View>
  )
}

/** A composed empty state: what this room is for, and the one thing to do. */
export function EmptyState({ title, line, action }: { title: string; line?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <T role="h2" align="center">
        {title}
      </T>
      {line ? (
        <T role="body" tone="muted" align="center" style={{ maxWidth: 300 }}>
          {line}
        </T>
      ) : null}
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  stat: { gap: 4 },
  // The design system's Plaque: 16 all round, 20 on the engraved side.
  plaque: { padding: space.lg, paddingLeft: space.ml, borderWidth: hairline, overflow: 'hidden' },
  error: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxl },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
})
