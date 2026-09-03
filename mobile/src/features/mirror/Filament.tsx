// The "developing" filament: a hair of brass light down the middle of the
// glass that breathes while a render is a job. The web's `animate-filament`:
// 1px, transparent through brass 60% to transparent, opacity 0.25 to 0.5
// and back over 5.5s, ease in and out.
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useTheme } from '@/src/design/theme'

export function Filament({ height }: { height: number }) {
  const { t } = useTheme()
  const glow = useSharedValue(0.25)
  useEffect(() => {
    glow.set(withRepeat(withTiming(0.5, { duration: 2750, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }), -1, true))
  }, [glow])
  const style = useAnimatedStyle(() => ({ opacity: glow.get() }))
  return (
    <Animated.View pointerEvents="none" style={[styles.host, style]}>
      <Svg width={1} height={height}>
        <Defs>
          <LinearGradient id="filament" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.brass} stopOpacity={0} />
            <Stop offset="0.5" stopColor={t.brass} stopOpacity={0.6} />
            <Stop offset="1" stopColor={t.brass} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={1} height={height} fill="url(#filament)" />
      </Svg>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  host: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
})
