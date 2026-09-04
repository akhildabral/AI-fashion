// The You room's small furniture, built on the primitives: a surface card,
// a settings row, a switch, a colour swatch, the initials square, a label.
// Values are the web's, translated literally: `.card` is a hairline on the
// surface; a list inside it has no outer padding and 16 inside; a form
// section is `p-5`; a row is 44 tall with a hairline between rows.
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Switch, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, BRAND, hairline, height, hitSlopFor, radius, space } from '@/src/design/tokens'
import { fonts, track, tracking } from '@/src/design/type'

type CardPadding = 'list' | 'form' | 'none' | number

/**
 * A surface panel with a hairline edge: the web's `.card`. `list` (the
 * default) pads 16 on the sides only so rows draw their own hairlines edge
 * to edge; `form` is the web's `p-5`; a number is a literal padding.
 */
export function Card({ children, style, padding = 'list' }: { children: ReactNode; style?: StyleProp<ViewStyle>; padding?: CardPadding }) {
  const { t } = useTheme()
  const pad: ViewStyle = padding === 'list' ? styles.cardList : padding === 'form' ? styles.cardForm : padding === 'none' ? {} : { padding }
  return <View style={[styles.card, pad, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }, style]}>{children}</View>
}

/** The tracked micro heading over a group of controls: the web's RowLabel, `mt-7` between groups. */
export function RowLabel({ children, first, style }: { children: string; first?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <T role="micro" tone="faint" style={[!first && styles.rowLabelGap, style]}>
      {children}
    </T>
  )
}

/** The web's `.label` over a control that is not a Field: 6 beneath, like the Field's own. */
export function FieldLabel({ children }: { children: string }) {
  return (
    <T role="label" tone="faint" style={styles.fieldLabel}>
      {children}
    </T>
  )
}

/**
 * A settings row: label, an optional value, a chevron, the tap. `strong`
 * is the web's account row (a muted label, the value in ink and semibold).
 */
export function NavRow({
  label,
  value,
  onPress,
  tone = 'ink',
  first,
  strong,
  accessibilityLabel,
  right,
}: {
  label: string
  value?: string | null
  onPress?: () => void
  tone?: 'ink' | 'danger' | 'muted'
  first?: boolean
  strong?: boolean
  accessibilityLabel?: string
  right?: ReactNode
}) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      onPress={onPress}
      disabled={!onPress}
      pressRetentionOffset={12}
      style={({ pressed }) => [styles.row, { borderTopColor: alpha(t.ink, 0.1), borderTopWidth: first ? 0 : hairline, opacity: pressed ? 0.7 : 1 }]}
    >
      <T role="bodySm" tone={strong ? 'muted' : tone} style={styles.rowLabel}>
        {label}
      </T>
      {value ? (
        <T role="bodySm" tone={strong ? 'ink' : 'muted'} numberOfLines={1} style={[styles.rowValue, strong && styles.rowStrong]}>
          {value}
        </T>
      ) : (
        <View style={styles.rowValue} />
      )}
      {right}
      {onPress ? (
        <T role="bodySm" tone="faint" accessible={false}>
          ›
        </T>
      ) : null}
    </Pressable>
  )
}

/** A labelled switch on a row. Brass when on: the one accent, meaning "on". */
export function ToggleRow({
  label,
  line,
  value,
  onChange,
  disabled,
  first,
}: {
  label: string
  line?: string
  value: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  first?: boolean
}) {
  const { t } = useTheme()
  return (
    <View style={[styles.row, { borderTopColor: alpha(t.ink, 0.1), borderTopWidth: first ? 0 : hairline, opacity: disabled ? 0.5 : 1 }]}>
      <View style={styles.rowText}>
        <T role="bodySm">{label}</T>
        {line ? (
          <T role="caption" tone="muted">
            {line}
          </T>
        ) : null}
      </View>
      <BrassSwitch value={value} disabled={disabled} onChange={onChange} label={label} />
    </View>
  )
}

/** The native switch in house colours. */
export function BrassSwitch({ value, disabled, onChange, label }: { value: boolean; disabled?: boolean; onChange: (next: boolean) => void; label: string }) {
  const { t } = useTheme()
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        haptics.tap()
        onChange(v)
      }}
      trackColor={{ true: t.brass, false: alpha(t.ink, 0.2) }}
      thumbColor={t.surface}
      ios_backgroundColor={alpha(t.ink, 0.2)}
      accessibilityLabel={label}
    />
  )
}

/** A quiet inline text action, the web's `text-xs font-semibold text-brass`: "Change", "Send a change link". */
export function TextLink({ label, onPress, disabled, tone = 'brass', align }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'brass' | 'muted' | 'danger'; align?: 'left' | 'center' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlopFor(height.filter)}
      pressRetentionOffset={12}
      style={({ pressed }) => [styles.link, align === 'center' && styles.linkCenter, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <T role="caption" tone={tone} style={styles.linkText}>
        {label}
      </T>
    </Pressable>
  )
}

/** A colour square: a skin tone or a colour to avoid (struck through when on). */
export function Swatch({ colour, label, on, struck, onPress }: { colour: string; label: string; on: boolean; struck?: boolean; onPress: () => void }) {
  const { t } = useTheme()
  const chosen = on && !struck
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptics.select()
        onPress()
      }}
      hitSlop={hitSlopFor(height.action)}
      pressRetentionOffset={12}
      style={[styles.swatchRing, { borderRadius: radius, borderColor: chosen ? t.brass : 'transparent' }]}
    >
      <View style={[styles.swatch, { backgroundColor: colour, borderRadius: radius, borderColor: alpha(BRAND.ink, 0.15), opacity: struck ? 0.45 : 1 }]}>
        {struck ? <View style={[styles.strike, { backgroundColor: t.ink, borderColor: t.bone }]} /> : null}
      </View>
    </Pressable>
  )
}

/** The avatar's three sizes; the letters inside are 12 / 11 / 9. */
const AVATAR_TEXT = { 40: 12, 32: 11, 24: 9 } as const

/** The member's mark on the You room: initials in a 3px brass square, 40 / 32 / 24 only. Never an arch, a circle or an image. */
export function Avatar({ name, size = 40 }: { name: string; size?: keyof typeof AVATAR_TEXT }) {
  const { t } = useTheme()
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  const fontSize = AVATAR_TEXT[size]
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: radius, backgroundColor: t.brass }]} accessibilityLabel={name} accessible>
      <T style={{ fontFamily: fonts.sansSemi, fontSize, lineHeight: Math.round(fontSize * 1.3), color: t.onBrass, letterSpacing: track(fontSize, tracking.labelSm) }} maxFontSizeMultiplier={1.2}>
        {initials || '·'}
      </T>
    </View>
  )
}

/** A horizontal row of chips that wraps: the web's `flex flex-wrap gap-2`. */
export function Wrap({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.wrap, style]}>{children}</View>
}

/**
 * The fitting's tape, with steps instead of a thumb: the figure on the left
 * gutter, minus and plus on the right, the brass thread beneath showing
 * where the value sits, and the web's three tick labels under that.
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  ticks,
  accessibilityLabel,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  label: string
  /** The three marks under the tape: low, middle, high. */
  ticks?: [string, string, string]
  accessibilityLabel: string
}) {
  const { t } = useTheme()
  const share = max > min ? (value - min) / (max - min) : 0
  const btn = (glyph: string, delta: number, name: string) => {
    const off = delta < 0 ? value <= min : value >= max
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        hitSlop={hitSlopFor(height.action)}
        pressRetentionOffset={12}
        disabled={off}
        onPress={() => {
          haptics.select()
          onChange(Math.min(max, Math.max(min, value + delta)))
        }}
        style={({ pressed }) => [styles.step, { borderColor: alpha(t.ink, 0.2), borderRadius: radius, opacity: pressed ? 0.6 : off ? 0.35 : 1 }]}
      >
        <T role="h3">{glyph}</T>
      </Pressable>
    )
  }
  return (
    <View>
      <View style={styles.stepper}>
        <T role="stat" style={styles.stepValue} accessibilityLabel={`${accessibilityLabel}, ${label}`}>
          {label}
        </T>
        <View style={styles.stepButtons}>
          {btn('−', -step, `Less ${accessibilityLabel}`)}
          {btn('+', step, `More ${accessibilityLabel}`)}
        </View>
      </View>
      <View style={[styles.tape, { backgroundColor: alpha(t.ink, 0.12) }]}>
        <View style={[styles.tapeFill, { backgroundColor: t.brass, width: `${Math.round(share * 100)}%` }]} />
      </View>
      {ticks ? (
        <View style={styles.ticks}>
          {ticks.map((tick, i) => (
            <T key={i} role="micro" tone="faint" style={styles.tick}>
              {tick}
            </T>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: hairline },
  cardList: { paddingHorizontal: space.lg },
  cardForm: { padding: space.ml },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  rowLabelGap: { marginTop: space.xl + space.xs },
  fieldLabel: { marginBottom: 6, marginLeft: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: height.action, paddingVertical: space.sm },
  rowLabel: { flexShrink: 1 },
  rowValue: { flex: 1, textAlign: 'right' },
  rowStrong: { fontFamily: fonts.sansSemi },
  rowText: { flex: 1, gap: 2 },
  link: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  linkCenter: { alignSelf: 'center' },
  linkText: { fontFamily: fonts.sansSemi },
  // The web's ring-2 ring-offset-2: a 2px brass ring 2px outside the square.
  swatchRing: { padding: 2, borderWidth: 2, margin: -4 },
  swatch: { width: height.action, height: height.action, alignItems: 'center', justifyContent: 'center', borderWidth: hairline },
  strike: { position: 'absolute', left: -6, right: -6, height: 2, transform: [{ rotate: '-45deg' }], borderWidth: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg },
  stepValue: { flexShrink: 1 },
  stepButtons: { flexDirection: 'row', gap: space.sm },
  step: { width: height.action, height: height.action, alignItems: 'center', justifyContent: 'center', borderWidth: hairline },
  tape: { height: 2, marginTop: space.lg, overflow: 'hidden' },
  tapeFill: { height: '100%' },
  ticks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  tick: { letterSpacing: 1.4, textTransform: 'none' },
})
