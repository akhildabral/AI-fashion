// Starter mode: the closet holds fewer than four pieces. The first brief's
// four niches are already drawn; the ones you own hang in theirs, the empty
// ones ask for what is missing.
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
import { go, paths } from './nav'

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
  const h = Math.round(width / (3 / 4))
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${label.toLowerCase()}`}
      pressRetentionOffset={12}
      onPress={() => go(paths.closet)}
      style={{ width, gap: 8 }}
    >
      <View style={{ width, height: h, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
          <Path d={archPath(width, h, 'niche', 1)} fill={t.surface} stroke={t.brass} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 4" />
        </Svg>
        <T role="h1" tone="brass">
          +
        </T>
        <T role="micro" tone="faint">
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
  const tile = (W - 12) / 2
  const ready = closet.filter((i) => i.status === 'ready' && i.owned !== false)
  return (
    <View style={styles.wrap}>
      <Animated.View entering={rise(1)} style={{ gap: space.md }}>
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
      <Animated.View entering={rise(2)} style={styles.grid}>
        {starterSlots(ready).map((slot) =>
          slot.item ? (
            <GarmentTile key={slot.key} width={tile} aspect={3 / 4} imageUrl={slot.item.imageUrl} label={`${slot.label} · yours`} />
          ) : (
            <EmptyNiche key={slot.key} width={tile} label={slot.label} />
          ),
        )}
      </Animated.View>
      <Animated.View entering={rise(3)}>
        <T role="lede" tone="faint" align="center" style={{ fontSize: 15, lineHeight: 22 }}>
          {starterLine(ready)}
        </T>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
})
