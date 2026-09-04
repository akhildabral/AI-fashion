// The room while the brief composes: the greeting, the strip, the headline
// and the board drawn in their own shapes, so the look resolves in place.
// The skeleton occupies the real dimensions: the head, the strip, the
// section head, the board, the two-column brief, and the word beneath.
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
    v.set(withRepeat(withTiming(0.7, { duration: 1000, reduceMotion: ReduceMotion.System }), -1, true))
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
          <View style={styles.head}>
            <SkeletonBlock width={150} height={12} />
            <SkeletonBlock width={210} height={40} />
          </View>
          <View style={styles.strip}>
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonBlock key={i} width={28} height={48} />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.title}>
        <SkeletonBlock width={96} height={12} />
        <SkeletonBlock width="80%" height={30} />
        <SkeletonBlock width="60%" height={16} style={styles.lead} />
      </View>
      <View style={styles.board}>
        <PulsingBoard width={W} />
        <ArchSkeleton count={4} width={W} />
      </View>
      <T role="micro" tone="faint">
        composing your look…
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  // Blocks 32 apart.
  wrap: { gap: space.xxl },
  head: { gap: space.sm, paddingTop: space.sm },
  strip: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.xs, paddingBottom: space.md },
  title: { gap: space.sm },
  lead: { marginTop: space.sm },
  board: { gap: space.md },
})
