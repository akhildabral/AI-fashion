// Small furniture used on every screen: section heads, stats, plaques, cards,
// hairlines, alerts, badges, the empty state and the failed-fetch state.
import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { fonts, track, tracking } from '@/src/design/type'
import { Button } from './Button'
import { LONG_PRESS_MS } from './Press'
import { T } from './Text'

/**
 * The section head: a tracked label over a Bodoni h2, an optional action on
 * the right. Every section head in the product is that pair; the label is 8
 * above the line it labels.
 */
export function SectionHead({ label, title, emphasis, action, style }: { label?: string; title: string; emphasis?: string; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.head, style]}>
      <View style={styles.headText}>
        {label ? (
          <T role="label" tone="faint">
            {label}
          </T>
        ) : null}
        <T role="h2" accessibilityRole="header">
          {title}
          {emphasis ? (
            <T role="h2" tone="brass" italic>
              {` ${emphasis}`}
            </T>
          ) : null}
        </T>
      </View>
      {action}
    </View>
  )
}

/** A Bodoni tabular figure over a tracked micro-label. `small` is the dense-row size. */
export function Stat({ value, label, tone = 'ink' as 'ink' | 'brass', small }: { value: string | number; label: string; tone?: 'ink' | 'brass'; small?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <T role={small ? 'statSm' : 'stat'} tone={tone}>
        {String(value)}
      </T>
      <T role="micro" tone="faint">
        {label}
      </T>
    </View>
  )
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme()
  return <View style={[{ height: hairline, backgroundColor: alpha(t.ink, 0.12) }, style]} />
}

/**
 * A card rests flat: a hairline on the raised fill, 3px, no shadow. Padding
 * 16, or 20 for a feature card. `onLongPress` is the card's overflow: a
 * 320ms hold opens its menu, in place of a `···` button. The card itself is
 * not an accessible element, so its buttons stay reachable.
 */
export function Card({ children, padding = space.lg, style, onLongPress }: { children: ReactNode; padding?: number; style?: StyleProp<ViewStyle>; onLongPress?: () => void }) {
  const { t } = useTheme()
  const surface = [{ padding, borderRadius: radius, borderWidth: hairline, backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1) }, style]
  if (!onLongPress) return <View style={surface}>{children}</View>
  return (
    <Pressable
      accessible={false}
      delayLongPress={LONG_PRESS_MS}
      onLongPress={() => {
        haptics.select()
        onLongPress()
      }}
      pressRetentionOffset={12}
      style={surface}
    >
      {children}
    </Pressable>
  )
}

export interface PlaqueProps {
  /** The tracked label engraved above the figure. */
  label?: string
  /** The Bodoni figure, in brass, tabular. */
  value?: string
  /** A quiet note on the figure's line. */
  note?: string
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * The engraved fact: a gradient panel with a 2px brass left edge, a label, a
 * Bodoni figure at section-head size, a note. Never a control on its own.
 */
export function Plaque({ label, value, note, children, style }: PlaqueProps) {
  const { t } = useTheme()
  // Percent sizes are unreliable on an absolutely placed Svg; measure instead.
  const [size, setSize] = useState({ w: 0, h: 0 })
  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[styles.plaque, { borderRadius: radius, backgroundColor: t.surface, borderColor: alpha(t.ink, 0.1) }, style]}
    >
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={size.w} height={size.h}>
        <Defs>
          <LinearGradient id="plaque" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.brassSoft} stopOpacity={0.9} />
            <Stop offset="1" stopColor={t.surface} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="plaqueEdge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.brassHi} />
            <Stop offset="1" stopColor={t.brassLo} />
          </LinearGradient>
        </Defs>
        <Rect width={size.w} height={size.h} fill="url(#plaque)" />
        <Rect width={2} height={size.h} fill="url(#plaqueEdge)" />
      </Svg>
      {label ? (
        <T role="micro" tone="faint" style={styles.plaqueLabel}>
          {label}
        </T>
      ) : null}
      {value ? (
        <T role="stat" tone="brass" style={label ? styles.plaqueValue : undefined}>
          {value}
          {note ? (
            <T role="bodySm" tone="muted">
              {` ${note}`}
            </T>
          ) : null}
        </T>
      ) : null}
      {children}
    </View>
  )
}

export type AlertTone = 'error' | 'warning' | 'success'

/** An inline message tied to the thing that produced it: coloured text on a 10-12% wash of itself, 16 x 10, no icon, no border. */
export function Alert({ tone = 'error', children, style }: { tone?: AlertTone; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme()
  const color = tone === 'error' ? t.danger : tone === 'success' ? t.success : t.warning
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.alert, { backgroundColor: alpha(color, tone === 'error' ? 0.1 : 0.12), borderRadius: radius }, style]}>
      <T role="bodySm" style={{ color }}>
        {children}
      </T>
    </View>
  )
}

/** A count or a one-word state on a filled chip: brass, or a quiet ink wash ("In wash", "Packed"). Never a button. */
export function Badge({ tone = 'brass', children, style }: { tone?: 'brass' | 'quiet'; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { t } = useTheme()
  return (
    <View style={[styles.badge, { backgroundColor: tone === 'brass' ? t.brass : alpha(t.ink, 0.08), borderRadius: radius }, style]}>
      <T role="caption" tone={tone === 'brass' ? 'onBrass' : 'ink'} style={styles.badgeText}>
        {children}
      </T>
    </View>
  )
}

/** The standard failed-fetch state: one line saying what to do, and a retry. */
export function LoadError({ message = 'The stylist is out for a moment. Try again in a few seconds.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <T role="body" tone="muted" align="center">
        {message}
      </T>
      {onRetry ? <Button label="Try again" variant="ghost" onPress={onRetry} /> : null}
    </View>
  )
}

/** The empty state: one italic Bodoni line, a way forward, and the single action. */
export function EmptyState({ title, line, action, style }: { title: string; line?: string; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.empty, style]}>
      <T role="lede" tone="muted" align="center">
        {title}
      </T>
      {line ? (
        <T role="bodySm" tone="faint" align="center" style={styles.emptyLine}>
          {line}
        </T>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  headText: { flex: 1, gap: space.sm },
  stat: { gap: space.xs },
  // The design system's Plaque: 16 all round, 20 on the engraved side.
  plaque: { padding: space.lg, paddingLeft: space.ml, borderWidth: hairline, overflow: 'hidden' },
  // The plaque's label: the web's tracking-label-xl (.2em).
  plaqueLabel: { letterSpacing: track(10, tracking.labelXl) },
  plaqueValue: { marginTop: space.xs },
  alert: { paddingHorizontal: space.lg, paddingVertical: 10 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.sansSemi },
  error: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyLine: { maxWidth: 300 },
  emptyAction: { marginTop: space.sm },
})
