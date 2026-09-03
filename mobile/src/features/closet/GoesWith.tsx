// "Goes with": the pairing rail under every piece. A count you can act on,
// the pieces themselves, and the door to composing around it.
import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { LoadError } from '@/src/components/Bits'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
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
      <View style={[styles.wrap, rule]} accessibilityLabel="Reading the closet" aria-busy>
        <SkeletonBlock width={72} height={12} />
        <SkeletonBlock width="70%" height={26} style={styles.line} />
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
        <T role="micro" tone="faint" style={styles.eyebrow}>
          Goes with
        </T>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push(`/closet/compose?pin=${itemId}`)}>
          <T role="caption" tone="brass" style={styles.semi}>
            Compose around it →
          </T>
        </Pressable>
      </View>
      <T role="h3" italic style={styles.line}>
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
  // mt-5 border-t pt-4
  wrap: { marginTop: 20, paddingTop: space.lg, borderTopWidth: hairline },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  // text-[10px] tracking-[0.2em]
  eyebrow: { letterSpacing: 2 },
  semi: { fontFamily: fonts.sansSemi },
  line: { marginTop: space.xs },
  // mt-3 gap-2 pb-1
  rail: { flexDirection: 'row', gap: space.sm, marginTop: space.md, paddingBottom: space.xs },
})
