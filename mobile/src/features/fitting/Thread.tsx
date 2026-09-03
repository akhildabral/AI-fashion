import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { T } from '@/src/components/Text'
import { EASE_OUT } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { PROGRESS, progressBefore, WORDS, type StepKey } from './steps'

const HEAD = 12

/**
 * The thread across the top of steps 1 to 5 (FittingPage.tsx): a 2px
 * hairline with a brass-lo to brass-hi fill whose width is weighted by
 * effort, a 12px diamond sitting on its head, and the stylist's word for
 * where things stand in Bodoni italic. The fill is a full-width gradient
 * scaled from its left edge, so the head of the thread is always the
 * brightest brass and the animation is transform-only.
 */
export function Thread({ step }: { step: StepKey }) {
  const { t } = useTheme()
  const [width, setWidth] = useState(0)
  const track = useSharedValue(0)
  const p = useSharedValue(progressBefore(step) / 100)

  useEffect(() => {
    p.set(withDelay(320, withTiming(PROGRESS[step] / 100, { duration: 700, easing: EASE_OUT, reduceMotion: ReduceMotion.System })))
  }, [step, p])

  const fill = useAnimatedStyle(() => ({
    transform: [{ translateX: -track.get() / 2 }, { scaleX: Math.max(p.get(), 0.0001) }, { translateX: track.get() / 2 }],
  }))
  const head = useAnimatedStyle(() => ({ transform: [{ translateX: track.get() * p.get() - HEAD / 2 }, { rotate: '45deg' }] }))

  return (
    <View style={styles.row}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: PROGRESS[step] }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width
          track.set(w)
          setWidth(w)
        }}
        style={[styles.track, { backgroundColor: alpha(t.ink, 0.1) }]}
      >
        <Animated.View style={[styles.fill, fill]}>
          {width > 0 ? (
            <Svg width={width} height={2}>
              <Defs>
                <LinearGradient id="thread" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={t.brassLo} />
                  <Stop offset="1" stopColor={t.brassHi} />
                </LinearGradient>
              </Defs>
              <Rect width={width} height={2} fill="url(#thread)" />
            </Svg>
          ) : null}
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.head, { backgroundColor: t.brassHi }, head]} />
      </View>
      <T tone="brass" numberOfLines={1} accessibilityLiveRegion="polite" style={styles.word}>
        {WORDS[step]}
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  // `gap-4 py-3`.
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.md },
  track: { flex: 1, height: 2 },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  head: { position: 'absolute', left: 0, top: -5, width: HEAD, height: HEAD },
  // `min-w-[12ch] text-right font-display text-sm italic`.
  word: { flexShrink: 0, minWidth: 84, textAlign: 'right', fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 18 },
})
