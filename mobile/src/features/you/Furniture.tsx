// The You room's small furniture, built on the primitives: a surface card,
// a settings row, a switch, a colour swatch, the initials arch, a label.
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Switch, View, type TextStyle, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { archPath } from '@/src/components/Arch'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'

/** A surface panel with a hairline edge: the web's `.card`. */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const { t } = useTheme()
  return <View style={[styles.card, padded && styles.cardPad, { backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1), borderRadius: radius }, style]}>{children}</View>
}

/** The tracked micro heading over a group of controls. */
export function RowLabel({ children, first, style }: { children: string; first?: boolean; style?: TextStyle }) {
  return (
    <T role="micro" tone="faint" style={[!first && { marginTop: space.xl }, style]}>
      {children}
    </T>
  )
}

/** A settings row: label, an optional value, a chevron, the tap. */
export function NavRow({
  label,
  value,
  onPress,
  tone = 'ink',
  first,
  accessibilityLabel,
  right,
}: {
  label: string
  value?: string | null
  onPress?: () => void
  tone?: 'ink' | 'danger' | 'muted'
  first?: boolean
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
      <T role="body" tone={tone} style={styles.rowLabel}>
        {label}
      </T>
      {value ? (
        <T role="bodySm" tone="muted" numberOfLines={1} style={styles.rowValue}>
          {value}
        </T>
      ) : null}
      {right}
      {onPress ? (
        <T role="body" tone="faint" accessible={false}>
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
        <T role="body">{label}</T>
        {line ? (
          <T role="caption" tone="muted">
            {line}
          </T>
        ) : null}
      </View>
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
    </View>
  )
}

/** A quiet inline text action in brass: "Change", "Send a change link". */
export function TextLink({ label, onPress, disabled, tone = 'brass' }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'brass' | 'muted' | 'danger' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={8} pressRetentionOffset={12} style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.6 : 1, minHeight: 32, justifyContent: 'center' })}>
      <T role="caption" tone={tone} style={{ fontFamily: fonts.sansSemi }}>
        {label}
      </T>
    </Pressable>
  )
}

/** A colour square: a skin tone or a colour to avoid (struck through when on). */
export function Swatch({ colour, label, on, struck, onPress }: { colour: string; label: string; on: boolean; struck?: boolean; onPress: () => void }) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptics.select()
        onPress()
      }}
      pressRetentionOffset={12}
      style={[styles.swatch, { backgroundColor: colour, borderRadius: radius, borderColor: on && !struck ? t.brass : alpha('#000000', 0.15), borderWidth: on && !struck ? 2 : hairline, opacity: struck ? 0.45 : 1 }]}
    >
      {struck ? <View style={[styles.strike, { backgroundColor: t.ink, borderColor: t.bone }]} /> : null}
    </Pressable>
  )
}

/** Initials inside a small arch: the member's mark on the You room. */
export function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const { t } = useTheme()
  const h = Math.round(size * 1.2)
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <View style={{ width: size, height: h, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={name} accessible>
      <Svg width={size} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="avatarBezel" x1="0" y1="0" x2="0.64" y2="1">
            <Stop offset="0" stopColor={t.brassHi} />
            <Stop offset="0.62" stopColor={t.brassLo} />
          </LinearGradient>
        </Defs>
        <Path d={archPath(size, h, 'niche', 1)} fill={t.surface} stroke="url(#avatarBezel)" strokeWidth={2} />
      </Svg>
      <T role="h3" tone="brass" style={{ marginTop: size * 0.12 }}>
        {initials || '·'}
      </T>
    </View>
  )
}

/** A horizontal row of chips or filters that wraps. */
export function Wrap({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.wrap, style]}>{children}</View>
}

/** A stepper on the 36px scale: minus, the value, plus. */
export function Stepper({ value, onChange, min, max, step = 1, label, accessibilityLabel }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; accessibilityLabel: string }) {
  const { t } = useTheme()
  const btn = (glyph: string, delta: number, name: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      hitSlop={6}
      pressRetentionOffset={12}
      disabled={delta < 0 ? value <= min : value >= max}
      onPress={() => {
        haptics.select()
        onChange(Math.min(max, Math.max(min, value + delta)))
      }}
      style={({ pressed }) => [styles.step, { borderColor: alpha(t.ink, 0.2), borderRadius: radius, opacity: pressed ? 0.6 : (delta < 0 ? value <= min : value >= max) ? 0.35 : 1 }]}
    >
      <T role="h3">{glyph}</T>
    </Pressable>
  )
  return (
    <View style={styles.stepper} accessible accessibilityLabel={`${accessibilityLabel}, ${label}`}>
      {btn('−', -step, `Less ${accessibilityLabel}`)}
      <T role="stat" style={styles.stepValue}>
        {label}
      </T>
      {btn('+', step, `More ${accessibilityLabel}`)}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: hairline },
  cardPad: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingVertical: space.md },
  rowLabel: { flexShrink: 1 },
  rowValue: { flex: 1, textAlign: 'right' },
  rowText: { flex: 1, gap: 2 },
  swatch: { width: height.action, height: height.action, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  strike: { position: 'absolute', left: -6, right: -6, height: 2, transform: [{ rotate: '-45deg' }], borderWidth: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  step: { width: height.action, height: height.action, alignItems: 'center', justifyContent: 'center', borderWidth: hairline },
  stepValue: { minWidth: 120, textAlign: 'center' },
})
