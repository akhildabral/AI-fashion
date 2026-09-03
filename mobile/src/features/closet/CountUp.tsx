// A figure that counts up to its value on the UI thread: the Store's verdict.
// A TextInput driven by animated props, so nothing ticks on the JS thread.
import { useEffect } from 'react'
import { TextInput } from 'react-native'
import Animated, { ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { EASE_OUT } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { fonts } from '@/src/design/type'

const AnimatedInput = Animated.createAnimatedComponent(TextInput)
Animated.addWhitelistedNativeProps({ text: true })

export function CountUp({ to, size = 72, duration = 900 }: { to: number; size?: number; duration?: number }) {
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
      // Bodoni's figures stand tall: anything under 1.25x clips the top on device.
      style={{ fontFamily: fonts.serif, fontSize: size, lineHeight: Math.round(size * 1.25), color: t.brass, padding: 0, fontVariant: ['tabular-nums'], minWidth: size * 0.6 }}
    />
  )
}
