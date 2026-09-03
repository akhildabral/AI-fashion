// A usage meter: label, "used / limit", and a bar that fills to the share.
// The fill is a childless absolute View scaled from its left edge on the UI
// thread, so nothing lays out per frame.
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { T } from '@/src/components/Text'
import { EASE_OUT } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, radius, space } from '@/src/design/tokens'

export interface MeterValue {
  used: number
  limit: number
}

export function Meter({ label, meter, per }: { label: string; meter: MeterValue; per?: string }) {
  const { t } = useTheme()
  const share = meter.limit > 0 ? Math.min(1, meter.used / meter.limit) : 0
  const full = meter.limit > 0 && meter.used >= meter.limit
  const near = !full && share >= 0.8
  const colour = full ? t.danger : near ? t.warning : t.brass
  const scale = useSharedValue(0)
  useEffect(() => {
    scale.set(withTiming(share, { duration: 600, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
  }, [share, scale])
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.get() }] }))

  return (
    <View style={styles.wrap} accessible accessibilityRole="progressbar" accessibilityLabel={`${label}: ${meter.used} of ${meter.limit}${per ? ` ${per}` : ''}`} accessibilityValue={{ min: 0, max: meter.limit, now: Math.min(meter.used, meter.limit) }}>
      <View style={styles.head}>
        <T role="bodySm">{label}</T>
        <T role="caption" tone={full ? 'danger' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>
          {meter.used} / {meter.limit}
          {per ? ` ${per}` : ''}
        </T>
      </View>
      <View style={[styles.track, { backgroundColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colour, borderRadius: radius, transformOrigin: 'left' }, fill]} />
      </View>
      {near ? (
        <T role="caption" style={{ color: t.warning }}>
          Almost out for this cycle.
        </T>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
  track: { height: 8, overflow: 'hidden' },
})
