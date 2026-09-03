// The "developing" filament: a hair of brass light down the middle of the
// glass that breathes while a render is a job (the web's `animate-filament`).
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { EASE_IN_OUT } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'

export function Filament({ height }: { height: number }) {
  const { t } = useTheme()
  const glow = useSharedValue(0.25)
  useEffect(() => {
    glow.set(withRepeat(withTiming(0.95, { duration: 1100, easing: EASE_IN_OUT, reduceMotion: ReduceMotion.System }), -1, true))
  }, [glow])
  const style = useAnimatedStyle(() => ({ opacity: glow.get() }))
  return (
    <Animated.View pointerEvents="none" style={[styles.host, style]}>
      <Svg width={2} height={height}>
        <Defs>
          <LinearGradient id="filament" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.brass} stopOpacity={0} />
            <Stop offset="0.5" stopColor={t.brass} stopOpacity={0.7} />
            <Stop offset="1" stopColor={t.brass} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={2} height={height} fill="url(#filament)" />
      </Svg>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  host: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
})
