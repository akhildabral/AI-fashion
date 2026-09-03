// "Goes with": the pairing rail under every piece. A count you can act on,
// the pieces themselves, and the door to composing around it.
import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { LoadError } from '@/src/components/Bits'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { fonts } from '@/src/design/type'
import { nameOf, title, usePairs } from './data'

export function GoesWith({ itemId }: { itemId: string }) {
  const pairs = usePairs(itemId)
  if (pairs.isError && !pairs.data) return <LoadError message="Couldn’t read the closet for pairings." onRetry={() => void pairs.refetch()} />
  const data = pairs.data
  if (!data)
    return (
      <View style={styles.loading}>
        <SkeletonBlock width="70%" height={22} />
        <View style={styles.rail}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} width={64} height={80} />
          ))}
        </View>
      </View>
    )
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <T role="label" tone="faint">
          Goes with
        </T>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push(`/closet/compose?pin=${itemId}`)}>
          <T role="caption" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
            Compose around it →
          </T>
        </Pressable>
      </View>
      <T role="lede">
        {data.pairs.length === 0 ? 'Nothing in the closet pairs with it yet.' : `${data.pairs.length} piece${data.pairs.length === 1 ? '' : 's'} · ${data.outfitCount} outfit${data.outfitCount === 1 ? '' : 's'} ready.`}
      </T>
      {data.pairs.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {data.pairs.map(({ item, score }) => (
            <GarmentTile
              key={item.id}
              imageUrl={item.imageUrl}
              width={64}
              accessibilityLabel={`${title(nameOf(item))}, pairs ${score.toFixed(1)}`}
              onPress={() => router.push(`/closet/piece/${item.id}`)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  loading: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  rail: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
})
