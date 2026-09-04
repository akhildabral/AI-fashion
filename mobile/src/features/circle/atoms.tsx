// The Circle's small parts: a person as two letters, a plate, a garment in
// a small arch, a photo in an arch, the reaction chip, the card's tones. No
// icon set: a chip is a word, a header control is a hand-drawn glyph. The
// press, the card, the empty state and the inline error are the shared
// primitives (`@/src/components/Press`, `Bits`); this only adds the Circle's
// shapes on top.
import { Image } from 'expo-image'
import { type ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import type { PostItem } from '@zauq/shared/circle'
import { Arch } from '@/src/components/Arch'
import { Card as Surface } from '@/src/components/Bits'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, radius } from '@/src/design/tokens'
import { fonts, track, tracking } from '@/src/design/type'
import { resolveImageUrl } from '@/src/lib/api'

export { LONG_PRESS_MS } from '@/src/components/Press'

/** Two letters from a name ("Sam K." → SK), or from the handle when that's all there is. */
export function initialsOf(name?: string | null, handle?: string | null): string {
  const n = (name ?? '').trim()
  if (n) {
    const parts = n.replace(/\./g, '').split(/\s+/).filter(Boolean)
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
  }
  return (handle ?? '?').slice(0, 2).toUpperCase()
}

/** The avatar comes in three sizes only: 40 (a rail, a profile), 32 (a feed row), 24 (a comment). */
export type AvatarSize = 40 | 32 | 24

/** The letters inside each avatar size: 12 / 11 / 9, semibold, tracked .14em. */
const INITIALS_SIZE: Record<AvatarSize, number> = { 40: 12, 32: 11, 24: 9 }

/**
 * A person as a 3px brass square with their initials: never a circle, never
 * an image. 40 / 32 / 24 only.
 */
export function Initials({ handle, name, size = 32, dim }: { handle: string | null; name?: string | null; size?: AvatarSize; dim?: boolean }) {
  const { t } = useTheme()
  const fontSize = INITIALS_SIZE[size]
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.brass, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.6 : 1 }}
    >
      <T style={{ fontFamily: fonts.sansSemi, fontSize, lineHeight: Math.round(fontSize * 1.3), color: t.onBrass, letterSpacing: track(fontSize, tracking.labelSm) }} maxFontSizeMultiplier={1.2}>
        {initialsOf(name, handle)}
      </T>
    </View>
  )
}

/** The kicker: the web's `text-[10px] tracking-[0.2em] text-brass` ("Look", "Verdict", "For you"). */
export function Plate({ children }: { children: string }) {
  return (
    <T role="micro" tone="brass" style={styles.plate}>
      {children}
    </T>
  )
}

/** A garment in a small arch: the standard garment tile at 5/6 (4/5 where it sits beside a person). */
export function GarmentThumb({ item, width, aspect = 5 / 6, selected, sweep }: { item: Pick<PostItem, 'id' | 'imageUrl' | 'subtype' | 'category'>; width: number; aspect?: number; selected?: boolean; sweep?: boolean }) {
  return (
    <Arch width={width} aspect={aspect} selected={selected} sweep={sweep}>
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

/**
 * A reaction or a verb on a card's foot: the web's `ActionButton` as a word
 * in `text-xs font-semibold` and a count; `px-2 gap-1.5`, brass when on.
 * A word, not an icon: ZAUQ labels things.
 */
export function ActionChip({ label, count, on = false, onPress, accessibilityLabel }: { label: string; count?: number; on?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const { t } = useTheme()
  const color = on ? t.brass : alpha(t.ink, 0.55)
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: on }} onPress={onPress} visual={height.secondary}>
      <View style={styles.chip}>
        <T role="caption" style={{ color, fontFamily: fonts.sansSemi }}>
          {label}
        </T>
        {typeof count === 'number' && count > 0 ? <Count n={count} /> : null}
      </View>
    </Press>
  )
}

/** The web's `btn-icon`: a bordered 36 square around a hand-drawn glyph, with the bell's count badge when there is one. */
export function IconButton({ glyph, label, onPress, badge }: { glyph: ReactNode; label: string; onPress: () => void; badge?: number }) {
  const { t } = useTheme()
  return (
    <Press accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} unread` : label} onPress={onPress} visual={height.secondary}>
      <View style={[styles.iconButton, { borderColor: alpha(t.ink, 0.2), borderRadius: radius }]}>
        {glyph}
        {badge ? (
          <View style={[styles.badge, { backgroundColor: t.brass, borderRadius: radius }]} accessible={false}>
            <T role="micro" style={{ color: t.onBrass, letterSpacing: 0 }} maxFontSizeMultiplier={1}>
              {badge > 9 ? '9+' : String(badge)}
            </T>
          </View>
        ) : null}
      </View>
    </Press>
  )
}

/**
 * The shared `Card` with the Circle's tones: a brass edge for the featured
 * and the week; a brass wash for a pick for you. Unpadded, so a card's rows
 * can run edge to edge (`CARD_PAD` inside). `onLongPress` is the shared
 * card's 320ms hold, which opens the menu (see `PostHeader` for how a
 * screen reader reaches it).
 */
export function Card({ children, tone = 'plain', style, onLongPress }: { children: ReactNode; tone?: 'plain' | 'brass' | 'soft'; style?: ViewStyle; onLongPress?: () => void }) {
  const { t } = useTheme()
  return (
    <Surface
      padding={0}
      onLongPress={onLongPress}
      style={[
        styles.card,
        tone === 'soft' && { backgroundColor: alpha(t.brassSoft, 0.4) },
        tone !== 'plain' && { borderColor: alpha(t.brass, tone === 'brass' ? 0.45 : 0.35) },
        style,
      ]}
    >
      {children}
    </Surface>
  )
}

/** The web's card padding on a phone: `p-4`. */
export const CARD_PAD = 16
/** Between cards: `space-y-3`. */
export const CARD_GAP = 12

const styles = StyleSheet.create({
  garment: { position: 'absolute', left: '10%', right: '10%', top: '10%', bottom: '10%' },
  plate: { letterSpacing: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: height.secondary, paddingHorizontal: 8 },
  iconButton: { width: height.secondary, height: height.secondary, borderWidth: hairline, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  card: { overflow: 'hidden' },
})
