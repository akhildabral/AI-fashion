// Starter mode: the closet holds fewer than four pieces. The first brief's
// four niches are already drawn; the ones you own hang in theirs, the empty
// ones ask for what is missing. TodayPage.tsx: the headline, the lede 16
// beneath, the niches (two across, 16 apart, 3:4) 40 beneath with a centred
// tracked label 8 under each, the starter line 16 beneath.
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import type { WardrobeItem } from '@zauq/shared/types'
import { archPath } from '@/src/components/Arch'
import { GarmentTile } from '@/src/components/GarmentTile'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { gutter, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { go, paths } from './nav'

const ASPECT = 3 / 4
const GAP = space.lg

const STARTER_SLOTS: { key: string; label: string; take: (i: WardrobeItem) => boolean }[] = [
  { key: 'top', label: 'A top', take: (i) => i.category === 'top' || i.category === 'dress' },
  { key: 'bottom', label: 'A bottom', take: (i) => i.category === 'bottom' || i.category === 'dress' },
  { key: 'shoes', label: 'Shoes', take: (i) => i.category === 'footwear' },
  { key: 'more', label: 'One more thing', take: () => true },
]

function starterSlots(closet: WardrobeItem[]): { key: string; label: string; item: WardrobeItem | null }[] {
  const used = new Set<string>()
  return STARTER_SLOTS.map((slot) => {
    const item = closet.find((i) => !used.has(i.id) && slot.take(i)) ?? null
    if (item) used.add(item.id)
    return { key: slot.key, label: slot.label, item }
  })
}

export function starterLine(closet: WardrobeItem[]): string {
  const missing = starterSlots(closet)
    .filter((s) => !s.item)
    .map((s) => s.label.toLowerCase())
  if (missing.length === 0) return 'The niches are full. Tonight at eight, tomorrow’s outfit hangs here.'
  if (missing.length === 4) return 'Your first brief hangs here once these four are in the closet.'
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return `Add ${list}, and tomorrow’s outfit hangs here.`
}

/** An empty niche: the arch drawn in a dashed brass line, waiting. */
function EmptyNiche({ width, label }: { width: number; label: string }) {
  const { t } = useTheme()
  const h = Math.round(width / ASPECT)
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Add ${label.toLowerCase()}`} pressRetentionOffset={12} onPress={() => go(paths.closet)} style={[styles.slot, { width }]}>
      <View style={[styles.niche, { width, height: h }]}>
        <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
          <Path d={archPath(width, h, 'niche', 1)} fill={t.surface} stroke={t.brass} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="4 4" />
        </Svg>
        <T role="h1" tone="brass" accessible={false}>
          +
        </T>
        <T role="micro" tone="faint" style={styles.tracked2}>
          {label}
        </T>
      </View>
      <T role="micro" tone="brass" align="center" numberOfLines={1}>
        Add {label.toLowerCase()}
      </T>
    </Pressable>
  )
}

export function Starter({ closet }: { closet: WardrobeItem[] }) {
  const W = useWindowDimensions().width - gutter * 2
  const tile = (W - GAP) / 2
  const ready = closet.filter((i) => i.status === 'ready' && i.owned !== false)
  return (
    <View style={styles.wrap}>
      <Animated.View entering={rise(1)} style={styles.head}>
        <T role="display" accessibilityRole="header">
          Let’s fill{' '}
          <T role="display" tone="brass" italic>
            your closet.
          </T>
        </T>
        <T role="lede" tone="muted">
          every morning starts with an outfit, composed from what you own and ready to wear
        </T>
      </Animated.View>
      <Animated.View entering={rise(2)} style={styles.niches}>
        <View style={styles.grid}>
          {starterSlots(ready).map((slot) =>
            slot.item ? (
              <View key={slot.key} style={[styles.slot, { width: tile }]}>
                <GarmentTile width={tile} aspect={ASPECT} imageUrl={slot.item.imageUrl} accessibilityLabel={`${slot.label}, yours`} />
                <T role="micro" tone="muted" align="center" numberOfLines={1}>
                  {slot.label} · yours
                </T>
              </View>
            ) : (
              <EmptyNiche key={slot.key} width={tile} label={slot.label} />
            ),
          )}
        </View>
        <T tone="faint" align="center" style={styles.line}>
          {starterLine(ready)}
        </T>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  // `mt-4` lede, `mt-12` niches: the header cluster and the niches 40 apart.
  wrap: { gap: 40 },
  head: { gap: space.lg },
  niches: { gap: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  slot: { gap: space.sm },
  niche: { alignItems: 'center', justifyContent: 'center', gap: space.sm },
  tracked2: { letterSpacing: 2 },
  // The web's `font-display text-sm italic text-ink/45`.
  line: { fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 18 },
})
