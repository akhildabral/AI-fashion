// The press every tappable shares: the whole element to 0.97 in 150ms, one
// haptic in the same frame, `pressRetentionOffset={12}`, and the touch lifted
// to the platform floor with hitSlop. Compose cards, plaques, rows and tiles
// from this rather than a bare Pressable.
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import * as haptics from '@/src/design/haptics'
import { PRESS_SCALE, timing } from '@/src/design/motion'
import { hitSlopFor } from '@/src/design/tokens'

export type Haptic = 'tap' | 'select' | 'none'

/** The context menu opens after this long a press: the mobile `···`. */
export const LONG_PRESS_MS = 320

/** The scale shared value and the handlers for a hand-rolled pressable. */
export function usePressScale() {
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  return {
    style,
    onPressIn: () => scale.set(withTiming(PRESS_SCALE, timing.press)),
    onPressOut: () => scale.set(withTiming(1, timing.press)),
  }
}

export interface PressProps extends Omit<PressableProps, 'style'> {
  /** Which haptic fires with the press: `tap` for a reaction or a toggle, `select` for a choice. */
  haptic?: Haptic
  /** The control's smallest visual dimension, so hitSlop lifts it to 48 on Android. */
  visual?: number
  style?: StyleProp<ViewStyle>
  /** The animated wrapper's style (width, flex). */
  wrapStyle?: StyleProp<ViewStyle>
}

export function Press({ haptic = 'none', visual, style, wrapStyle, onPress, onPressIn, onPressOut, hitSlop, ...rest }: PressProps) {
  const press = usePressScale()
  return (
    <Animated.View style={[press.style, wrapStyle]}>
      <Pressable
        pressRetentionOffset={12}
        hitSlop={hitSlop ?? (visual ? hitSlopFor(visual) : undefined)}
        onPressIn={(e) => {
          press.onPressIn()
          onPressIn?.(e)
        }}
        onPressOut={(e) => {
          press.onPressOut()
          onPressOut?.(e)
        }}
        onPress={(e) => {
          if (haptic === 'tap') haptics.tap()
          else if (haptic === 'select') haptics.select()
          onPress?.(e)
        }}
        style={style}
        {...rest}
      />
    </Animated.View>
  )
}
