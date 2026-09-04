// The few marks the rooms need that are not letters, drawn by hand on a 16
// grid at a 1.5px stroke with no fill, so they sit on the same optical weight
// as the hairlines around them. No icon set anywhere in the rooms: the tab
// bar is the platform's, and everything else is a word or one of these.
import Svg, { Circle, Path, Polyline } from 'react-native-svg'
import { useTheme } from '@/src/design/theme'
import { alpha } from '@/src/design/tokens'

export interface GlyphProps {
  size?: number
  /** The stroke; ink at 85% when unset (the web's `currentColor`). */
  color?: string
}

const STROKE = 1.5

function useInk(color?: string) {
  const { t } = useTheme()
  return color ?? alpha(t.ink, 0.85)
}

/** The "more" control: three dots, 4px each, on an 18px line. */
export function MoreGlyph({ size = 18, color }: GlyphProps) {
  const c = useInk(color)
  const r = size / 9
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessible={false}>
      <Circle cx={size / 2 - size / 3} cy={size / 2} r={r} fill={c} />
      <Circle cx={size / 2} cy={size / 2} r={r} fill={c} />
      <Circle cx={size / 2 + size / 3} cy={size / 2} r={r} fill={c} />
    </Svg>
  )
}

/** A plus: two strokes crossing at the centre. */
export function PlusGlyph({ size = 16, color }: GlyphProps) {
  const c = useInk(color)
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessible={false}>
      <Path d="M8 2.5v11M2.5 8h11" stroke={c} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
    </Svg>
  )
}

/** A bell: the body and its clapper. */
export function BellGlyph({ size = 16, color }: GlyphProps) {
  const c = useInk(color)
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessible={false}>
      <Path d="M4 11.5V7.5a4 4 0 0 1 8 0v4l1 1.5H3l1-1.5Z" stroke={c} strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
      <Path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke={c} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
    </Svg>
  )
}

/** A chevron pointing right; `direction` turns it. */
export function ChevronGlyph({ size = 16, color, direction = 'right' }: GlyphProps & { direction?: 'right' | 'left' | 'down' | 'up' }) {
  const c = useInk(color)
  const rotate = direction === 'right' ? 0 : direction === 'down' ? 90 : direction === 'left' ? 180 : 270
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessible={false} style={{ transform: [{ rotate: `${rotate}deg` }] }}>
      <Polyline points="6,3.5 10.5,8 6,12.5" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

/** A tick, for a chosen row or a packed piece. (The consent checkbox is `Check`, which draws its own tick inside the box.) */
export function CheckGlyph({ size = 16, color }: GlyphProps) {
  const c = useInk(color)
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessible={false}>
      <Polyline points="3,8.5 6.5,12 13,4.5" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

/** A close cross. */
export function CrossGlyph({ size = 16, color }: GlyphProps) {
  const c = useInk(color)
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessible={false}>
      <Path d="M4 4l8 8M12 4l-8 8" stroke={c} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
    </Svg>
  )
}
