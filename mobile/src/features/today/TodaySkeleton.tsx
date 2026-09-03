// The room while the brief composes: the greeting, the strip, the headline
// and the board drawn in their own shapes, so the look resolves in place.
// TodayPage.tsx: a 44-tall title bar at 80%, a 16-tall line at 60% 12
// beneath, the arches 32 beneath, "composing your look…" 24 beneath.
import { useEffect } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Arch } from '@/src/components/Arch'
import { ArchSkeleton, SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { gutter, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'

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
            <View style={{ gap: space.sm }}>
              <SkeletonBlock width={150} height={14} />
              <SkeletonBlock width={210} height={26} />
            </View>
            <View style={{ flexDirection: 'row', gap: space.xxl }}>
              <SkeletonBlock width={36} height={38} />
              <SkeletonBlock width={36} height={38} />
            </View>
          </View>
          <View style={styles.strip}>
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonBlock key={i} width={28} height={48} />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.title}>
        <SkeletonBlock width="80%" height={44} />
        <SkeletonBlock width="55%" height={44} />
        <SkeletonBlock width="60%" height={16} style={{ marginTop: space.xs }} />
      </View>
      <View style={styles.board}>
        <PulsingBoard width={W} />
        <ArchSkeleton count={3} columns={3} width={W} />
      </View>
      <T tone="faint" style={styles.composing}>
        composing your look…
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.lg },
  strip: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.xs, paddingBottom: space.md },
  title: { gap: space.sm },
  board: { gap: space.md },
  // The web's `font-display text-sm italic text-ink/40`.
  composing: { fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 18 },
})
