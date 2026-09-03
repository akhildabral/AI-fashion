// The Closet's rooms: one row that says where you are and what's waiting in
// the others. Pieces, the outfits they make, the basket, and the wishlist.
// Drawn the way the web does: the mantel closes on a hairline, the tabs sit
// mt-6 beneath it.
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { Tabs } from '@/src/components/Tabs'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { useBasket, useWishlist } from './data'

export type Room = 'pieces' | 'outfits' | 'basket' | 'wishlist'

export function RoomTabs({ current }: { current: Room }) {
  const { t } = useTheme()
  const basket = useBasket()
  const wishlist = useWishlist()
  const b = basket.data ? basket.data.counts.inWash + basket.data.counts.packed + basket.data.counts.lentOut : 0
  const w = wishlist.data?.length ?? 0
  return (
    <View style={[styles.rail, { borderTopColor: alpha(t.ink, 0.12) }]}>
      <Tabs<Room>
        value={current}
        items={[
          { key: 'pieces', label: 'Pieces' },
          { key: 'outfits', label: 'Outfits' },
          { key: 'basket', label: 'The basket', count: b > 0 && current !== 'basket' ? b : undefined },
          { key: 'wishlist', label: 'Wishlist', count: w > 0 && current !== 'wishlist' ? w : undefined },
        ]}
        onChange={(k) => {
          if (k === 'pieces') router.navigate('/closet')
          else if (k === 'outfits') router.navigate('/closet/outfits')
          else if (k === 'basket') router.navigate('/closet/basket')
          else router.navigate('/closet/wishlist')
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  rail: { borderTopWidth: hairline, paddingTop: space.xl },
})
