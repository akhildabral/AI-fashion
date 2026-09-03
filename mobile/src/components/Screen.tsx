import { type ReactNode } from 'react'
import { Image, StyleSheet, View, type ViewStyle } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg'
import { useTheme } from '@/src/design/theme'
import { gutter } from '@/src/design/tokens'

const grain = require('../../assets/grain.png')

/** The two ambient washes behind every screen (App.tsx on the web). */
function Wash() {
  const { t } = useTheme()
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id="washA" cx="82%" cy="-8%" rx="60%" ry="45%">
          <Stop offset="0" stopColor={t.washA} />
          <Stop offset="1" stopColor={t.washA} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="washB" cx="-8%" cy="10%" rx="55%" ry="45%">
          <Stop offset="0" stopColor={t.washB} />
          <Stop offset="1" stopColor={t.washB} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx="82%" cy="-8%" rx="60%" ry="45%" fill="url(#washA)" />
      <Ellipse cx="-8%" cy="10%" rx="55%" ry="45%" fill="url(#washB)" />
    </Svg>
  )
}

/** Film grain over the whole screen, like the web's fixed noise layer. */
export function Grain() {
  const { t } = useTheme()
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: t.grainOpacity, mixBlendMode: t.grainBlend }]}>
      <Image source={grain} resizeMode="repeat" style={StyleSheet.absoluteFill} accessible={false} />
    </View>
  )
}

interface ScreenProps {
  children: ReactNode
  /** Safe-area edges this screen manages itself (headers and tabs manage the rest). */
  edges?: Edge[]
  /** Apply the horizontal gutter. Off for full-bleed lists. */
  padded?: boolean
  style?: ViewStyle
  /** Skip the washes (a full-screen photo or the Mirror reveal). */
  plain?: boolean
}

/** The page container: ground, ambient wash, safe areas, film grain on top. */
export function Screen({ children, edges = [], padded = false, style, plain = false }: ScreenProps) {
  const { t } = useTheme()
  return (
    <View style={[styles.root, { backgroundColor: t.bone }]}>
      {!plain && <Wash />}
      <SafeAreaView edges={edges} style={[styles.root, padded && { paddingHorizontal: gutter }, style]}>
        {children}
      </SafeAreaView>
      {!plain && <Grain />}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
