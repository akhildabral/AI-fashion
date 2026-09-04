// "Goes with": the pairing rail under every piece. A count you can act on,
// the pieces themselves, and the door to composing around it.
import { router } from 'expo-router'
import { ScrollView, StyleSheet, View } from 'react-native'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { nameOf, title, usePairs } from './data'

/** The web's w-16 thumbs at 5/6. */
const THUMB_W = 64
const THUMB_H = Math.round(THUMB_W / (5 / 6))

export function GoesWith({ itemId }: { itemId: string }) {
  const { t } = useTheme()
  const pairs = usePairs(itemId)
  const rule = { borderTopColor: alpha(t.ink, 0.1) }
  if (pairs.isError && !pairs.data) return <LoadError message="Couldn’t read the closet for pairings." onRetry={() => void pairs.refetch()} />
  const data = pairs.data
  if (!data)
    return (
      <View style={[styles.wrap, rule]} accessibilityLabel="Reading the closet" accessibilityState={{ busy: true }}>
        <SkeletonBlock width={72} height={12} />
        <SkeletonBlock width="70%" height={26} />
        <View style={styles.rail}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} width={THUMB_W} height={THUMB_H} />
          ))}
        </View>
      </View>
    )
  return (
    <View style={[styles.wrap, rule]}>
      <View style={styles.head}>
        <T role="label" tone="faint">
          Goes with
        </T>
        <Button label="Compose around it" variant="quiet" size="sm" onPress={() => router.push(`/closet/compose?pin=${itemId}`)} />
      </View>
      <T role="h3" italic>
        {data.pairs.length === 0 ? 'Nothing in the closet pairs with it yet.' : `${data.pairs.length} piece${data.pairs.length === 1 ? '' : 's'} · ${data.outfitCount} outfit${data.outfitCount === 1 ? '' : 's'} ready.`}
      </T>
      {data.pairs.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {data.pairs.map(({ item, score }) => (
            <GarmentTile
              key={item.id}
              imageUrl={item.imageUrl}
              width={THUMB_W}
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
  // A hairline, then 16; the label 8 over its line, the rail 8 beneath.
  wrap: { marginTop: space.lg, paddingTop: space.lg, borderTopWidth: hairline, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  rail: { flexDirection: 'row', gap: space.sm, paddingBottom: space.xs },
})
