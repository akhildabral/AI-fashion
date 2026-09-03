// The taste quiz as a deck: one pair per card, both images side by side.
// The card follows the finger with a slight tilt; releasing past a distance
// or a velocity flings it off on a spring that keeps the gesture's speed,
// otherwise it springs back. The two choices are buttons too.
import { Image } from 'expo-image'
import { useCallback, useRef } from 'react'
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated'
import type { QuizPair } from '@zauq/shared/types'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { EASE_OUT, spring } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { resolveImageUrl } from '@/src/lib/api'
import type { Answer } from './draft'

/** Past this fraction of the card's width the choice is made. */
const COMMIT_FRACTION = 0.35
/** Or past this speed, in points per second. */
const COMMIT_VELOCITY = 800
const CARD_PAD = 14
const OR_WIDTH = 24
const SIDE_GAP = 10

interface DeckProps {
  pair: QuizPair
  /** The pair waiting behind this one, drawn smaller. */
  next: QuizPair | null
  onPick: (answer: Answer) => void
}

export function TasteDeck({ pair, next, onPick }: DeckProps) {
  const { width: screenW } = useWindowDimensions()
  const w = screenW - gutter * 2
  // Keyed by the pair so every card mounts fresh at rest.
  return <Card key={pair.id} pair={pair} next={next} width={w} onPick={onPick} />
}

function Card({ pair, next, width: w, onPick }: DeckProps & { width: number }) {
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const fade = useSharedValue(1)
  const settled = useRef(false)

  const commit = useCallback(
    (answer: Answer) => {
      if (settled.current) return
      settled.current = true
      haptics.select()
      onPick(answer)
    },
    [onPick],
  )

  const fling = useCallback(
    (dir: -1 | 1, velocity: number) => {
      'worklet'
      x.set(
        withSpring(dir * w * 1.5, { ...spring.snap, velocity }, (finished) => {
          if (finished) runOnJS(commit)(dir < 0 ? 'left' : 'right')
        }),
      )
    },
    [x, w, commit],
  )

  const skip = useCallback(() => {
    fade.set(
      withTiming(0, { duration: 150, easing: EASE_OUT, reduceMotion: ReduceMotion.System }, (finished) => {
        if (finished) runOnJS(commit)('skip')
      }),
    )
  }, [fade, commit])

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      x.set(e.translationX)
      y.set(e.translationY * 0.25)
    })
    .onEnd((e) => {
      const fast = Math.abs(e.velocityX) > COMMIT_VELOCITY
      const far = Math.abs(x.get()) > w * COMMIT_FRACTION
      if (fast || far) {
        fling((fast ? e.velocityX : x.get()) < 0 ? -1 : 1, e.velocityX)
      } else {
        x.set(withSpring(0, { ...spring.snap, velocity: e.velocityX }))
        y.set(withSpring(0, { ...spring.snap, velocity: e.velocityY }))
      }
    })

  const front = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${(x.get() / w) * 10}deg` }],
  }))
  const behind = useAnimatedStyle(() => {
    const k = Math.min(1, Math.abs(x.get()) / (w * COMMIT_FRACTION))
    return { opacity: 0.55 + 0.45 * k, transform: [{ scale: 0.96 + 0.04 * k }] }
  })
  // The side the card leans toward comes forward; the other recedes.
  const leftSide = useAnimatedStyle(() => {
    const toward = Math.min(1, Math.max(0, -x.get() / (w * COMMIT_FRACTION)))
    const away = Math.min(1, Math.max(0, x.get() / (w * COMMIT_FRACTION)))
    return { opacity: 1 - 0.4 * away, transform: [{ scale: 1 + 0.04 * toward }] }
  })
  const rightSide = useAnimatedStyle(() => {
    const toward = Math.min(1, Math.max(0, x.get() / (w * COMMIT_FRACTION)))
    const away = Math.min(1, Math.max(0, -x.get() / (w * COMMIT_FRACTION)))
    return { opacity: 1 - 0.4 * away, transform: [{ scale: 1 + 0.04 * toward }] }
  })

  return (
    <View style={styles.deck}>
      <View style={styles.stack}>
        {next ? (
          <Animated.View pointerEvents="none" style={[styles.behind, behind]}>
            <Face pair={next} width={w} />
          </Animated.View>
        ) : null}
        <GestureDetector gesture={pan}>
          <Animated.View
            accessible
            accessibilityLabel={`${pair.question} ${pair.left.label}, or ${pair.right.label}. Swipe left or right, or use the buttons below.`}
            style={front}
          >
            <Face pair={pair} width={w} leftStyle={leftSide} rightStyle={rightSide} />
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.choices}>
        <View style={styles.choice}>
          <Button label={pair.left.label} variant="ghost" block accessibilityLabel={`Choose ${pair.left.label}`} onPress={() => fling(-1, -1400)} />
        </View>
        <View style={styles.choice}>
          <Button label={pair.right.label} variant="ghost" block accessibilityLabel={`Choose ${pair.right.label}`} onPress={() => fling(1, 1400)} />
        </View>
      </View>
      <Button label="Neither, honestly" variant="quiet" size="sm" style={styles.center} onPress={skip} />
    </View>
  )
}

/** One card's face: the question, the two photographs in arches, their labels. */
function Face({
  pair,
  width: w,
  leftStyle,
  rightStyle,
}: {
  pair: QuizPair
  width: number
  leftStyle?: AnimatedStyle<ViewStyle>
  rightStyle?: AnimatedStyle<ViewStyle>
}) {
  const { t } = useTheme()
  const archW = Math.floor((w - CARD_PAD * 2 - OR_WIDTH - SIDE_GAP * 2) / 2)
  return (
    <View style={[styles.card, { width: w, backgroundColor: t.surface, borderColor: alpha(t.ink, 0.12), borderRadius: radius }]}>
      <T role="caption" tone="faint" align="center">
        {pair.question}
      </T>
      <View style={styles.sides}>
        <Animated.View style={[styles.side, leftStyle]}>
          <SidePhoto side={pair.left} width={archW} />
        </Animated.View>
        <T role="h3" italic tone="faint" style={{ width: OR_WIDTH, textAlign: 'center' }}>
          or
        </T>
        <Animated.View style={[styles.side, rightStyle]}>
          <SidePhoto side={pair.right} width={archW} />
        </Animated.View>
      </View>
    </View>
  )
}

function SidePhoto({ side, width }: { side: QuizPair['left']; width: number }) {
  return (
    <>
      <Arch width={width} aspect={3 / 4} variant="photo">
        <Image source={{ uri: resolveImageUrl(side.imageUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={200} accessible={false} />
      </Arch>
      <T role="label" tone="muted" align="center" numberOfLines={2} style={{ width }}>
        {side.label}
      </T>
    </>
  )
}

const styles = StyleSheet.create({
  deck: { gap: space.lg },
  stack: { alignItems: 'center' },
  behind: { position: 'absolute', top: 0, left: 0 },
  card: { padding: CARD_PAD, gap: space.md, borderWidth: hairline },
  sides: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIDE_GAP },
  side: { alignItems: 'center', gap: space.sm },
  choices: { flexDirection: 'row', gap: space.sm },
  choice: { flex: 1 },
  center: { alignSelf: 'center' },
})
