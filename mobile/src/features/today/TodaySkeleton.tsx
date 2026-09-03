// The room while the brief composes: the greeting, the strip, the headline
// and the board drawn in their own shapes, so the look resolves in place.
import { useEffect } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Arch } from '@/src/components/Arch'
import { ArchSkeleton, SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { gutter, space } from '@/src/design/tokens'

function PulsingBoard({ width }: { width: number }) {
  const v = useSharedValue(0.35)
  useEffect(() => {
    v.set(withRepeat(withTiming(0.7, { duration: 900, reduceMotion: ReduceMotion.System }), -1, true))
  }, [v])
  const style = useAnimatedStyle(() => ({ opacity: v.get() }))
  return (
    <Animated.View style={style}>
      <Arch width={width} aspect={5 / 4} bezel={false} variant="plain" />
    </Animated.View>
  )
}

export function TodaySkeleton({ header = true }: { header?: boolean }) {
  const W = useWindowDimensions().width - gutter * 2
  return (
    <View style={styles.wrap} accessibilityLabel="Composing your look" accessibilityState={{ busy: true }}>
      {header ? (
        <>
          <View style={styles.row}>
            <View style={{ gap: 8 }}>
              <SkeletonBlock width={150} height={11} />
              <SkeletonBlock width={210} height={24} />
            </View>
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <SkeletonBlock width={36} height={30} />
              <SkeletonBlock width={36} height={30} />
            </View>
          </View>
          <View style={styles.strip}>
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonBlock key={i} width={28} height={44} />
            ))}
          </View>
        </>
      ) : null}
      <View style={{ gap: 10 }}>
        <SkeletonBlock width="80%" height={34} />
        <SkeletonBlock width="55%" height={34} />
        <SkeletonBlock width="70%" height={14} style={{ marginTop: 6 }} />
      </View>
      <PulsingBoard width={W} />
      <ArchSkeleton count={3} columns={3} width={W} />
      <T role="lede" tone="faint">
        composing your look…
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl, paddingTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  strip: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm },
})
