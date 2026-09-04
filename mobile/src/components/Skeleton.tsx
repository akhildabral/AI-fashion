import { useEffect } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/design/theme'
import { alpha, radius } from '@/src/design/tokens'
import { Arch } from './Arch'

/** The skeleton pulse: opacity 1 → .5 → 1 over 2s, 80ms later per item so a grid breathes rather than throbs. */
const PULSE_MS = 1000
const PULSE_STEP_MS = 80
const PULSE_EASE = Easing.bezier(0.4, 0, 0.6, 1)

function usePulse(index = 0) {
  const v = useSharedValue(1)
  useEffect(() => {
    v.set(withDelay(index * PULSE_STEP_MS, withRepeat(withTiming(0.5, { duration: PULSE_MS, easing: PULSE_EASE, reduceMotion: ReduceMotion.System }), -1, true)))
  }, [v, index])
  return useAnimatedStyle(() => ({ opacity: v.get() }))
}

/** A placeholder block the shape of the text or control it stands in for: 10% ink, 3px. */
export function SkeletonBlock({ width = '100%', height = 16, style }: { width?: number | `${number}%`; height?: number; style?: ViewStyle }) {
  const { t } = useTheme()
  const pulse = usePulse()
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: alpha(t.ink, 0.1) }, pulse, style]} />
}

function ArchCell({ width, index }: { width: number; index: number }) {
  const pulse = usePulse(index)
  return (
    <Animated.View style={[pulse, styles.cell, { width }]}>
      <Arch width={width} bezel={false} variant="plain" />
    </Animated.View>
  )
}

/** A grid of empty arches while garments load, at 60% so it reads as absent rather than empty. */
export function ArchSkeleton({ count = 4, width, columns = 2 }: { count?: number; width: number; columns?: number }) {
  const cell = (width - 12 * (columns - 1)) / columns
  return (
    <View style={[styles.grid, { gap: 12 }]} accessibilityState={{ busy: true }}>
      {Array.from({ length: count }).map((_, i) => (
        <ArchCell key={i} width={cell} index={i} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { opacity: 0.6 },
})
