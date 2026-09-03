// The Circle's small parts: a person as two letters, a plate, a garment in
// a small arch, a photo in an arch, the reaction chip, the card itself.
import { MaterialIcons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import type { PostItem } from '@zauq/shared/circle'
import { Arch } from '@/src/components/Arch'
import { T } from '@/src/components/Text'
import { PRESS_SCALE, timing } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { resolveImageUrl } from '@/src/lib/api'

/** Two letters from a name ("Sam K." → SK), or from the handle when that's all there is. */
export function initialsOf(name?: string | null, handle?: string | null): string {
  const n = (name ?? '').trim()
  if (n) {
    const parts = n.replace(/\./g, '').split(/\s+/).filter(Boolean)
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
  }
  return (handle ?? '?').slice(0, 2).toUpperCase()
}

/** A person as a brass square with their initials. */
export function Initials({ handle, name, size = 36, dim }: { handle: string | null; name?: string | null; size?: number; dim?: boolean }) {
  const { t } = useTheme()
  const fontSize = Math.max(10, Math.round(size * 0.32))
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.brass, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.6 : 1 }}
    >
      <T style={{ fontFamily: fonts.sansBold, fontSize, lineHeight: fontSize + 2, color: t.onBrass, letterSpacing: 0.5 }} maxFontSizeMultiplier={1.2}>
        {initialsOf(name, handle)}
      </T>
    </View>
  )
}

/** The tracked brass micro-label: "Look", "Verdict", "For you". */
export function Plate({ children }: { children: string }) {
  return (
    <T role="micro" tone="brass">
      {children}
    </T>
  )
}

/** A garment in a small arch. */
export function GarmentThumb({ item, width, selected, sweep }: { item: Pick<PostItem, 'id' | 'imageUrl' | 'subtype' | 'category'>; width: number; selected?: boolean; sweep?: boolean }) {
  return (
    <Arch width={width} aspect={4 / 5} selected={selected} sweep={sweep}>
      <Image source={{ uri: resolveImageUrl(item.imageUrl) }} contentFit="contain" cachePolicy="disk" transition={200} accessible={false} style={styles.garment} />
    </Arch>
  )
}

/** A photo of a person in an arch: a worn look, a render, an option. */
export function PhotoArch({ uri, width, aspect = 3 / 4, selected, cover = true }: { uri: string; width: number; aspect?: number; selected?: boolean; cover?: boolean }) {
  return (
    <Arch width={width} aspect={aspect} variant="photo" selected={selected}>
      <Image source={{ uri: resolveImageUrl(uri) }} contentFit={cover ? 'cover' : 'contain'} cachePolicy="disk" transition={200} accessible={false} style={cover ? StyleSheet.absoluteFill : styles.garment} />
    </Arch>
  )
}

/** A tabular figure beside a verb. */
export function Count({ n }: { n: number }) {
  return (
    <T role="caption" tone="faint" style={{ fontVariant: ['tabular-nums'] }}>
      {String(n)}
    </T>
  )
}

/** Press feedback for anything that isn't a Button: the whole thing scales in 120ms. */
export function Press({ children, style, onPressIn, onPressOut, ...rest }: PressableProps & { children: ReactNode; style?: ViewStyle }) {
  const scale = useSharedValue(1)
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  return (
    <Animated.View style={[pressed, style]}>
      <Pressable
        pressRetentionOffset={12}
        onPressIn={(e) => {
          scale.set(withTiming(PRESS_SCALE, timing.press))
          onPressIn?.(e)
        }}
        onPressOut={(e) => {
          scale.set(withTiming(1, timing.press))
          onPressOut?.(e)
        }}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}

export type IconName = React.ComponentProps<typeof MaterialIcons>['name']

/** A reaction or a verb on a card's foot: an icon, a word, a count. Brass when on. */
export function ActionChip({ icon, iconOn, label, count, on = false, onPress, accessibilityLabel }: { icon: IconName; iconOn?: IconName; label?: string; count?: number; on?: boolean; onPress: () => void; accessibilityLabel: string }) {
  const { t } = useTheme()
  const color = on ? t.brass : alpha(t.ink, 0.6)
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={6}>
      <View style={styles.chip}>
        <MaterialIcons name={on && iconOn ? iconOn : icon} size={16} color={color} />
        {label ? (
          <T role="caption" style={{ color, fontFamily: fonts.sansSemi }}>
            {label}
          </T>
        ) : null}
        {typeof count === 'number' && count > 0 ? <Count n={count} /> : null}
      </View>
    </Press>
  )
}

/** A bordered 36px icon control with an optional count badge: the bell, the plus. */
export function IconButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  const { t } = useTheme()
  return (
    <Press accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} unread` : label} onPress={onPress} hitSlop={4}>
      <View style={[styles.iconButton, { borderColor: alpha(t.ink, 0.18), borderRadius: radius }]}>
        <MaterialIcons name={icon} size={20} color={alpha(t.ink, 0.8)} />
        {badge ? (
          <View style={[styles.badge, { backgroundColor: t.brass, borderRadius: radius }]} accessible={false}>
            <T style={{ fontFamily: fonts.sansBold, fontSize: 9, lineHeight: 11, color: t.onBrass }} maxFontSizeMultiplier={1}>
              {badge > 9 ? '9+' : String(badge)}
            </T>
          </View>
        ) : null}
      </View>
    </Press>
  )
}

/** A card: surface on bone, a hairline, square corners. Brass edge for the featured and the picks for you. */
export function Card({ children, tone = 'plain', style }: { children: ReactNode; tone?: 'plain' | 'brass' | 'soft'; style?: ViewStyle }) {
  const { t } = useTheme()
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tone === 'soft' ? alpha(t.brassSoft, 0.55) : t.surface,
          borderColor: tone === 'plain' ? alpha(t.ink, 0.1) : alpha(t.brass, tone === 'brass' ? 0.45 : 0.35),
          borderRadius: radius,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** The dashed empty panel a room shows when a list has nothing in it. */
export function Dashed({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { t } = useTheme()
  return <View style={[styles.dashed, { borderColor: alpha(t.ink, 0.2), borderRadius: radius }, style]}>{children}</View>
}

/** A one-line inline error with what to do next. */
export function InlineError({ message }: { message: string }) {
  const { t } = useTheme()
  return (
    <View style={[styles.error, { borderColor: alpha(t.danger, 0.4), backgroundColor: alpha(t.danger, 0.08), borderRadius: radius }]} accessibilityLiveRegion="polite">
      <T role="bodySm" tone="danger">
        {message}
      </T>
    </View>
  )
}

export const CARD_PAD = 14

const styles = StyleSheet.create({
  garment: { position: 'absolute', left: '10%', right: '10%', top: '10%', bottom: '10%' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 6 },
  iconButton: { width: 36, height: 36, borderWidth: hairline, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: hairline, overflow: 'hidden' },
  dashed: { borderWidth: hairline, borderStyle: 'dashed', paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 8 },
  error: { borderWidth: hairline, paddingHorizontal: 12, paddingVertical: 10 },
})
