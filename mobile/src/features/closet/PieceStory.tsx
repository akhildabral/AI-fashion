// A piece's story: when it was worn, what it's worn with, what each wear
// has cost. The numbers already existed in the API; the piece tells them.
import { router } from 'expo-router'
import { ScrollView, StyleSheet, View } from 'react-native'
import { money } from '@zauq/shared/money'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { space } from '@/src/design/tokens'
import { formatDay, nameOf, title, useStory } from './data'
import { OCCASIONS } from './facts'

/** The web's w-16 thumbs at 4/5. */
const THUMB_W = 64

export function PieceStory({ itemId }: { itemId: string }) {
  const story = useStory(itemId)
  if (story.isError && !story.data) return <LoadError message="Couldn’t read the record for this piece." onRetry={() => void story.refetch()} />
  const s = story.data
  if (!s)
    return (
      <View style={styles.wrap} accessibilityLabel="Reading the record" accessibilityState={{ busy: true }}>
        <SkeletonBlock width="85%" height={26} />
        <SkeletonBlock width="50%" height={20} />
      </View>
    )
  return (
    <View style={styles.wrap}>
      <T role="h3" italic>
        {s.wearCount === 0
          ? 'Never worn yet.'
          : `Worn ${s.wearCount}×${s.firstWorn ? `, first on ${formatDay(s.firstWorn)}` : ''}${s.lastWorn ? `, last on ${formatDay(s.lastWorn)}` : ''}${s.costPerWear != null ? ` · ${money(s.costPerWear)} a wear` : ''}.`}
      </T>
      {s.idleDays != null && s.idleDays >= 90 ? (
        <T role="bodySm" tone="muted">
          Sitting idle for {s.idleDays} days.
        </T>
      ) : null}
      {s.days.length > 0 ? (
        <T role="bodySm" tone="muted">
          Mostly {s.days.map((d) => OCCASIONS.find(([k]) => k === d)?.[1].toLowerCase() ?? d).join(', ')}.
        </T>
      ) : null}
      {s.wornWith.length > 0 ? (
        <View style={styles.wornWith}>
          <T role="label" tone="brass">
            Worn with
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {s.wornWith.map(({ item, times }) => (
              <View key={item.id} style={styles.thumb}>
                <GarmentTile imageUrl={item.imageUrl} width={THUMB_W} aspect={4 / 5} accessibilityLabel={`${title(nameOf(item))}, worn together ${times} times`} onPress={() => router.push(`/closet/piece/${item.id}`)} />
                <T role="micro" tone="faint" align="center">
                  {`${times}×`}
                </T>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {s.wearCount > 0 ? <Button label="The days it was worn, in the record" variant="quiet" size="sm" onPress={() => router.push(`/you/journal?item=${itemId}`)} style={styles.link} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // Lines 8 apart; the rail a block beneath.
  wrap: { gap: space.sm },
  wornWith: { marginTop: space.sm, gap: space.sm },
  rail: { flexDirection: 'row', gap: space.md, paddingBottom: space.xs },
  thumb: { width: THUMB_W, gap: space.xs },
  link: { alignSelf: 'flex-start', marginTop: space.sm },
})
