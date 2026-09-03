// A piece's story: when it was worn, what it's worn with, what each wear
// has cost. The numbers already existed in the API; the piece tells them.
import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { money } from '@zauq/shared/money'
import { LoadError } from '@/src/components/Bits'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { fonts } from '@/src/design/type'
import { formatDay, nameOf, title, useStory } from './data'
import { OCCASIONS } from './facts'

export function PieceStory({ itemId }: { itemId: string }) {
  const story = useStory(itemId)
  if (story.isError && !story.data) return <LoadError message="Couldn’t read the record for this piece." onRetry={() => void story.refetch()} />
  const s = story.data
  if (!s)
    return (
      <View style={styles.wrap}>
        <SkeletonBlock width="85%" height={22} />
        <SkeletonBlock width="50%" height={14} />
      </View>
    )
  return (
    <View style={styles.wrap}>
      <T role="lede">
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
        <View style={styles.section}>
          <T role="label" tone="brass">
            Worn with
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {s.wornWith.map(({ item, times }) => (
              <GarmentTile
                key={item.id}
                imageUrl={item.imageUrl}
                width={64}
                aspect={4 / 5}
                label={`${times}×`}
                accessibilityLabel={`${title(nameOf(item))}, worn together ${times} times`}
                onPress={() => router.push(`/closet/piece/${item.id}`)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {s.wearCount > 0 ? (
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push(`/you/journal?item=${itemId}`)} style={{ alignSelf: 'flex-start' }}>
          <T role="caption" tone="brass" style={{ fontFamily: fonts.sansSemi }}>
            The days it was worn, in the record →
          </T>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  section: { gap: 8, marginTop: 8 },
  rail: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
})
