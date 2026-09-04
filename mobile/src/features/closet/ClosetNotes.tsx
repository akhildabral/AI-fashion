// The closet, in the morning: one line when the basket is worth a load, one
// when a wishlist piece is still on your mind. Quiet when there's nothing.
// Each note is a plaque that is wholly a link: the label, the Bodoni line,
// a brass arrow.
import { router, type Href } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Plaque } from '@/src/components/Bits'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import { rise } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
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
          <Press accessibilityRole="link" accessibilityLabel={`${n.eyebrow}. ${n.line}`} haptic="tap" onPress={() => router.navigate(n.to)}>
            <Plaque label={n.eyebrow} style={styles.plaque}>
              <View style={styles.row}>
                <T role="lede" style={styles.line}>
                  {n.line}
                </T>
                <T role="body" tone="brass" accessible={false}>
                  →
                </T>
              </View>
            </Plaque>
          </Press>
        </Animated.View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // The notes 16 under the ledger, 8 apart.
  list: { marginTop: space.lg, gap: space.sm },
  plaque: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  line: { flex: 1 },
})
