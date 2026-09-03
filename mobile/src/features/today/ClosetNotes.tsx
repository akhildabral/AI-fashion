// The closet, in the morning: one line when the basket is worth a load, one
// when a wishlist piece is still on your mind. Quiet when there's nothing.
// ClosetNotes.tsx on the web: plaques 14 / 20 inside, 8 apart, a brass arrow.
import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { getBasket, getWishlist } from '@zauq/shared/wardrobe'
import { Plaque } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { qk } from '@/src/lib/query'
import { go, paths } from './nav'

interface Note {
  to: string
  eyebrow: string
  line: string
}

export function ClosetNotes({ index = 2 }: { index?: number }) {
  const basket = useQuery({ queryKey: qk.basket, queryFn: getBasket, staleTime: 5 * 60_000 })
  const wishlist = useQuery({ queryKey: qk.wishlist, queryFn: getWishlist, staleTime: 5 * 60_000 })

  const notes: Note[] = []
  if (basket.data?.worthALoad) {
    notes.push({ to: paths.basket, eyebrow: 'The basket', line: `${basket.data.counts.inWash} pieces in the wash. Worth a load; the stylist is working around them.` })
  }
  const best = (wishlist.data?.items ?? [])
    .map((i) => ({ i, v: (i as { verdict?: { outfits?: number } | null }).verdict }))
    .filter((x) => (x.v?.outfits ?? 0) >= 3)
    .sort((a, b) => (b.v?.outfits ?? 0) - (a.v?.outfits ?? 0))[0]
  if (best) {
    const label = [best.i.primaryColor, best.i.subtype ?? best.i.category].filter(Boolean).join(' ')
    notes.push({ to: paths.wishlist, eyebrow: 'Still in mind', line: `The ${label} would make ${best.v?.outfits} outfits with what you own.` })
  }

  if (notes.length === 0) return null
  return (
    <Animated.View entering={rise(index)} style={styles.list}>
      {notes.map((n) => (
        <Pressable key={n.to} accessibilityRole="button" accessibilityLabel={`${n.eyebrow}. ${n.line}`} pressRetentionOffset={12} onPress={() => go(n.to)}>
          <Plaque style={styles.plaque}>
            <View style={styles.text}>
              <T role="micro" tone="faint" style={styles.eyebrow}>
                {n.eyebrow}
              </T>
              <T role="lede">{n.line}</T>
            </View>
            <T role="body" tone="brass" accessible={false}>
              →
            </T>
          </Plaque>
        </Pressable>
      ))}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  // `p-3.5 pl-5`, `flex items-center justify-between gap-4`.
  plaque: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, paddingVertical: 14, paddingRight: 14, paddingLeft: 20 },
  text: { flex: 1, gap: 2 },
  eyebrow: { letterSpacing: 2 },
})
