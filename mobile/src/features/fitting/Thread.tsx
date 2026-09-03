import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { T } from '@/src/components/Text'
import { EASE_OUT } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, space } from '@/src/design/tokens'
import { PROGRESS, progressBefore, WORDS, type StepKey } from './steps'

/**
 * The thread across the top of steps 1 to 5: a hairline with a brass fill
 * whose width is weighted by effort, a diamond at its head, and the
 * stylist's word for where things stand. The fill is a childless view, so
 * animating its width costs nothing.
 */
export function Thread({ step }: { step: StepKey }) {
  const { t } = useTheme()
  const track = useSharedValue(0)
  const p = useSharedValue(progressBefore(step) / 100)

  useEffect(() => {
    p.set(withDelay(320, withTiming(PROGRESS[step] / 100, { duration: 700, easing: EASE_OUT, reduceMotion: ReduceMotion.System })))
  }, [step, p])

  const fill = useAnimatedStyle(() => ({ width: track.get() * p.get() }))
  const head = useAnimatedStyle(() => ({ transform: [{ translateX: track.get() * p.get() - 5 }, { rotate: '45deg' }] }))

  return (
    <View style={styles.row}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: PROGRESS[step] }}
        onLayout={(e) => track.set(e.nativeEvent.layout.width)}
        style={[styles.track, { backgroundColor: alpha(t.ink, 0.1) }]}
      >
        <Animated.View style={[styles.fill, { backgroundColor: t.brass }, fill]} />
        <Animated.View pointerEvents="none" style={[styles.head, { backgroundColor: t.brassHi }, head]} />
      </View>
      <T role="lede" tone="brass" numberOfLines={1} accessibilityLiveRegion="polite" style={styles.word}>
        {WORDS[step]}
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.md },
  track: { flex: 1, height: 2 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  head: { position: 'absolute', left: 0, top: -4, width: 10, height: 10 },
  word: { flexShrink: 0 },
})
