// A bottom panel with two detents (a peek, and everything), dragged by a
// finger and settled with a spring that takes the drag's velocity. Used by
// the reveal for the decisions under the glass.
import { useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as haptics from '@/src/design/haptics'
import { spring } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, shadowFloat } from '@/src/design/tokens'

export function Sheetlet({ peek, children }: { peek: number; children: ReactNode }) {
  const { t } = useTheme()
  const insets = useSafeAreaInsets()
  const [height, setHeight] = useState(0)
  const y = useSharedValue(0)
  const start = useSharedValue(0)
  const open = useRef(false)
  const closed = Math.max(0, height - peek)

  const settle = (to: number, velocity: number) => {
    y.set(withSpring(to, { ...spring.sheet, velocity }))
  }

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .runOnJS(true)
    .onStart(() => {
      start.set(y.get())
    })
    .onUpdate((e) => {
      const next = start.get() + e.translationY
      // Past the top: a little resistance. Past the bottom: it just stops.
      y.set(next < 0 ? next / 4 : Math.min(next, closed + 24))
    })
    .onEnd((e) => {
      const goingDown = e.velocityY > 300 || (Math.abs(e.velocityY) <= 300 && y.get() > closed / 2)
      if (open.current === goingDown) {
        open.current = !goingDown
        haptics.tap()
      }
      settle(goingDown ? closed : 0, e.velocityY)
    })

  const tapHandle = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      open.current = !open.current
      haptics.tap()
      settle(open.current ? 0 : closed, 0)
    })

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }))

  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height)
    if (h === height) return
    setHeight(h)
    if (!open.current) y.set(Math.max(0, h - peek))
  }

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={onLayout}
        style={[
          styles.panel,
          shadowFloat,
          { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.12), borderTopLeftRadius: radius, borderTopRightRadius: radius, paddingBottom: Math.max(insets.bottom, 12) },
          style,
        ]}
      >
        <GestureDetector gesture={tapHandle}>
          <View accessibilityRole="button" accessibilityLabel="More choices" style={styles.handleHit}>
            <View style={[styles.handle, { backgroundColor: alpha(t.ink, 0.25) }]} />
          </View>
        </GestureDetector>
        {children}
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: gutter,
    borderTopWidth: hairline,
    gap: 10,
  },
  handleHit: { alignItems: 'center', justifyContent: 'center', height: 28, marginTop: 2 },
  handle: { width: 36, height: 4, borderRadius: 2 },
})
