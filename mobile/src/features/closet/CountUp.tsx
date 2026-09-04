// A figure that counts up to its value on the UI thread: the Store's verdict.
// A TextInput driven by animated props, so nothing ticks on the JS thread.
// Set in the display role: Bodoni 500 at 44 / 54, tabular, in brass.
import { useEffect } from 'react'
import { TextInput } from 'react-native'
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { EASE_OUT } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { fontScale, type as typeScale } from '@/src/design/type'

const AnimatedInput = Animated.createAnimatedComponent(TextInput)
Animated.addWhitelistedNativeProps({ text: true })

export function CountUp({ to, duration = 900 }: { to: number; duration?: number }) {
  const { t } = useTheme()
  const v = useSharedValue(0)
  useEffect(() => {
    v.set(0)
    v.set(withTiming(to, { duration, easing: EASE_OUT, reduceMotion: ReduceMotion.System }))
  }, [to, duration, v])
  const props = useAnimatedProps(() => ({ text: String(Math.round(v.get())), defaultValue: String(Math.round(v.get())) }))
  return (
    <AnimatedInput
      editable={false}
      underlineColorAndroid="transparent"
      animatedProps={props}
      accessible
      accessibilityLabel={String(to)}
      maxFontSizeMultiplier={fontScale.displayMax}
      style={[typeScale.display, { color: t.brass, padding: 0, fontVariant: ['tabular-nums'], minWidth: 28 }]}
    />
  )
}
