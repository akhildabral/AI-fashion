// The ZAUQ identity, as live type and geometry, matching the brand guide and
// frontend/src/components/Brand.tsx: the wordmark is Playfair Display in
// caps, kerned ZA .24em, AU .20em, UQ .16em, alone by default (ceremonial
// adds a gold rule beneath). The mark is the arch, 3:4, a semicircular crown
// (corner radius = half the width), a 1px optical hairline, with the script
// ذوق and a short rule, or empty (the mirror), or bare. Below 32px the
// outline becomes the solid fill.
import { StyleSheet, Text as RNText, View, type TextStyle } from 'react-native'
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg'
import { useTheme } from '@/src/design/theme'
import { BRAND } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'

/** The arch outline in the guide's 300 x 400 space. */
const ARCH_D = 'M4 392V150A146 146 0 0 1 296 150V392A4 4 0 0 1 292 396H8A4 4 0 0 1 4 392Z'
/** The solid form for small sizes (favicon, badge). */
const ARCH_SOLID_D = 'M0 150A150 150 0 0 1 300 150V396A4 4 0 0 1 296 400H4A4 4 0 0 1 0 396Z'

export interface WordmarkProps {
  /** Cap height in points. */
  size?: number
  color?: string
  ceremonial?: boolean
}

/** The wordmark: Playfair, kerned letter by letter, never tracked evenly. */
export function Wordmark({ size = 22, color, ceremonial = false }: WordmarkProps) {
  const { t } = useTheme()
  const ink = color ?? t.ink
  const style = { fontFamily: fonts.brand, fontSize: size, lineHeight: Math.round(size * 1.2), color: ink }
  const word = (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="ZAUQ">
      <Letter style={style} letter="Z" spacing={size * 0.24} />
      <Letter style={style} letter="A" spacing={size * 0.2} />
      <Letter style={style} letter="U" spacing={size * 0.16} />
      <Letter style={style} letter="Q" spacing={0} />
    </View>
  )
  if (!ceremonial) return word
  return (
    <View style={[styles.column, { gap: size * 0.42 }]}>
      {word}
      <View style={{ width: size * 1.55, height: 2, backgroundColor: BRAND.gold }} />
    </View>
  )
}

function Letter({ style, letter, spacing }: { style: TextStyle; letter: string; spacing: number }) {
  return (
    <RNText accessible={false} allowFontScaling={false} style={[style, { marginRight: spacing }]}>
      {letter}
    </RNText>
  )
}

export interface ArchMarkProps {
  /** Width in points; the mark is 3:4. */
  size?: number
  /** `script` carries ذوق and its rule; `mirror` is the empty arch; `bare` the arch alone. */
  variant?: 'script' | 'mirror' | 'bare'
  /** Stroke (gold by default). */
  color?: string
  /** The script's ink (the theme ink by default). */
  ink?: string
}

export function ArchMark({ size = 40, variant = 'script', color = BRAND.gold, ink }: ArchMarkProps) {
  const { t } = useTheme()
  const h = Math.round((size * 4) / 3)
  // Keep the hairline optically 1px at any size (4 units of 300 at 40pt, the guide's weight).
  const stroke = Math.max(2.4, (4 * 300) / (size * 3))
  if (size < 32) {
    return (
      <Svg width={size} height={h} viewBox="0 0 300 400" accessible={false}>
        <Path d={ARCH_SOLID_D} fill={color} />
      </Svg>
    )
  }
  return (
    <Svg width={size} height={h} viewBox="0 0 300 400" accessible={false}>
      <Path d={ARCH_D} fill="none" stroke={color} strokeWidth={variant === 'bare' ? stroke * 1.5 : stroke} />
      {variant === 'script' ? (
        <>
          <SvgText x="150" y="316" textAnchor="middle" fontFamily={fonts.urduSemi} fontSize={50} fill={ink ?? t.ink}>
            ذوق
          </SvgText>
          <Rect x="119" y="333" width="62" height="3" fill={color} />
        </>
      ) : null}
    </Svg>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { alignItems: 'center' },
})
