import { useEffect } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { useTheme } from '@/src/design/theme'
import { alpha, radius } from '@/src/design/tokens'
import { Arch } from './Arch'

function usePulse() {
  const v = useSharedValue(0.35)
  useEffect(() => {
    v.set(withRepeat(withTiming(0.7, { duration: 900, reduceMotion: ReduceMotion.System }), -1, true))
  }, [v])
  return useAnimatedStyle(() => ({ opacity: v.get() }))
}

/** A placeholder block the shape of the text or control it stands in for. */
export function SkeletonBlock({ width = '100%', height = 16, style }: { width?: number | `${number}%`; height?: number; style?: ViewStyle }) {
  const { t } = useTheme()
  const pulse = usePulse()
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: alpha(t.ink, 0.12) }, pulse, style]} />
}

/** A grid of empty arches while garments load. */
export function ArchSkeleton({ count = 4, width, columns = 2 }: { count?: number; width: number; columns?: number }) {
  const pulse = usePulse()
  return (
    <View style={[styles.grid, { gap: 12 }]}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={[pulse, { width: (width - 12 * (columns - 1)) / columns }]}>
          <Arch width={(width - 12 * (columns - 1)) / columns} bezel={false} variant="plain" />
        </Animated.View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
})
