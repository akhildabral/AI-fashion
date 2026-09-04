import { Text as RNText, type TextProps, type TextStyle } from 'react-native'
import { useTheme } from '@/src/design/theme'
import { alpha } from '@/src/design/tokens'
import { DISPLAY_ROLES, fonts, maxFontScaleFor, type as typeScale, type TypeRole } from '@/src/design/type'

type Tone = 'ink' | 'muted' | 'faint' | 'brass' | 'onBrass' | 'danger' | 'success' | 'inherit'

export interface TProps extends Omit<TextProps, 'role'> {
  role?: TypeRole
  tone?: Tone
  align?: TextStyle['textAlign']
  /** Bodoni italic for the emphasised word in a headline. */
  italic?: boolean
}

/**
 * The one text component. `role` picks a slot on the type scale, `tone` an
 * ink wash; nothing else about type is decided at the call site. Dynamic
 * Type: body and UI roles scale to 200%, display roles cap at 1.3x.
 */
export function T({ role = 'body', tone = 'ink', align, italic, style, ...rest }: TProps) {
  const { t } = useTheme()
  const color =
    tone === 'ink'
      ? t.ink
      : tone === 'muted'
        ? alpha(t.ink, 0.6)
        : tone === 'faint'
          ? alpha(t.ink, 0.45)
          : tone === 'brass'
            ? t.brass
            : tone === 'onBrass'
              ? t.onBrass
              : tone === 'danger'
                ? t.danger
                : tone === 'success'
                  ? t.success
                  : undefined
  const base = typeScale[role]
  return (
    <RNText
      maxFontSizeMultiplier={maxFontScaleFor(role)}
      {...rest}
      style={[
        base,
        color ? { color } : null,
        align ? { textAlign: align } : null,
        italic ? { fontFamily: DISPLAY_ROLES.has(role) && role !== 'wordmark' ? fonts.serifItalic : fonts.sans } : null,
        style,
      ]}
    />
  )
}
