// The closet, in the morning: one line when the basket is worth a load, one
// when a wishlist piece is still on your mind. Quiet when there's nothing.
import { router, type Href } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Plaque } from '@/src/components/Bits'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { labelOf, useBasket, useWishlist } from './data'

interface Note {
  to: Href
  eyebrow: string
  line: string
}

export function ClosetNotes({ riseFrom = 2 }: { riseFrom?: number }) {
  const basket = useBasket()
  const wishlist = useWishlist()
  const notes: Note[] = []
  const b = basket.data
  if (b?.worthALoad) notes.push({ to: '/closet/basket', eyebrow: 'The basket', line: `${b.counts.inWash} pieces in the wash. Worth a load; the stylist is working around them.` })
  const best = (wishlist.data ?? []).filter((i) => (i.verdict?.outfits ?? 0) >= 3)[0]
  if (best) notes.push({ to: '/closet/wishlist', eyebrow: 'Still in mind', line: `The ${labelOf(best)} would make ${best.verdict?.outfits} outfits with what you own.` })
  if (notes.length === 0) return null
  return (
    <View style={styles.list}>
      {notes.map((n, i) => (
        <Animated.View key={n.eyebrow} entering={rise(riseFrom + i)}>
          <Pressable accessibilityRole="link" pressRetentionOffset={12} onPress={() => router.navigate(n.to)}>
            <Plaque style={styles.plaque}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T role="label" tone="faint">
                    {n.eyebrow}
                  </T>
                  <T role="lede">{n.line}</T>
                </View>
                <T role="body" tone="brass">
                  →
                </T>
              </View>
            </Plaque>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  plaque: { padding: 14, paddingLeft: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
