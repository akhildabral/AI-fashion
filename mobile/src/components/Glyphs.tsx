// The few glyphs the rooms need that are not letters: drawn, so they sit on
// the same optical weight as the hairlines around them.
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '@/src/design/theme'
import { alpha } from '@/src/design/tokens'

/** The "more" control: three dots, 4px each, on an 18px line. */
export function MoreGlyph({ size = 18, color }: { size?: number; color?: string }) {
  const { t } = useTheme()
  const c = color ?? alpha(t.ink, 0.85)
  const r = size / 9
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessible={false}>
      <Circle cx={size / 2 - size / 3} cy={size / 2} r={r} fill={c} />
      <Circle cx={size / 2} cy={size / 2} r={r} fill={c} />
      <Circle cx={size / 2 + size / 3} cy={size / 2} r={r} fill={c} />
    </Svg>
  )
}
