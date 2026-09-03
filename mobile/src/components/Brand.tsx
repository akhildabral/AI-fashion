import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { useTheme } from '@/src/design/theme'
import { fonts } from '@/src/design/type'
import { archPath } from './Arch'
import { T } from './Text'

/** The wordmark: Playfair, tracked wide, never anything else. */
export function Wordmark({ size = 22, tone = 'ink' as 'ink' | 'onBrass' }) {
  return (
    <T role="wordmark" tone={tone} style={{ fontSize: size, lineHeight: size + 4, letterSpacing: size * 0.28 }} accessibilityRole="header">
      ZAUQ
    </T>
  )
}

/**
 * The arch mark: a small brass-bezelled arch, optionally with the Urdu script
 * (ذوق, taste) beneath a hairline.
 */
export function ArchMark({ size = 48, script = false }: { size?: number; script?: boolean }) {
  const { t } = useTheme()
  const w = size
  const h = Math.round(size * 1.25)
  return (
    <View style={styles.mark}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id="markBezel" x1="0" y1="0" x2="0.64" y2="1">
            <Stop offset="0" stopColor={t.brassHi} />
            <Stop offset="0.62" stopColor={t.brassLo} />
          </LinearGradient>
        </Defs>
        <Path d={archPath(w, h, 'niche', 1)} fill="none" stroke="url(#markBezel)" strokeWidth={2} />
      </Svg>
      {script ? (
        <View style={styles.script}>
          <View style={[styles.rule, { backgroundColor: t.brass }]} />
          <T style={{ fontFamily: fonts.urdu, fontSize: size * 0.34, lineHeight: size * 0.7, color: t.brass }} accessibilityLabel="zauq, taste">
            ذوق
          </T>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', gap: 8 },
  script: { alignItems: 'center', gap: 6 },
  rule: { width: 24, height: 1 },
})
