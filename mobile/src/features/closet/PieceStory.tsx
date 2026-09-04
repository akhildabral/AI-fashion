// A piece's story: when it was worn, what it's worn with, what each wear
// has cost. The numbers already existed in the API; the piece tells them.
import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { money } from '@zauq/shared/money'
import { LoadError } from '@/src/components/Bits'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { hitSlopFor, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
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
      <View accessibilityLabel="Reading the record" aria-busy>
        <SkeletonBlock width="85%" height={26} />
        <SkeletonBlock width="50%" height={20} style={styles.line} />
      </View>
    )
  return (
    <View>
      <T role="h3" italic>
        {s.wearCount === 0
          ? 'Never worn yet.'
          : `Worn ${s.wearCount}×${s.firstWorn ? `, first on ${formatDay(s.firstWorn)}` : ''}${s.lastWorn ? `, last on ${formatDay(s.lastWorn)}` : ''}${s.costPerWear != null ? ` · ${money(s.costPerWear)} a wear` : ''}.`}
      </T>
      {s.idleDays != null && s.idleDays >= 90 ? (
        <T role="bodySm" tone="muted" style={styles.line}>
          Sitting idle for {s.idleDays} days.
        </T>
      ) : null}
      {s.days.length > 0 ? (
        <T role="bodySm" tone="muted" style={styles.line}>
          Mostly {s.days.map((d) => OCCASIONS.find(([k]) => k === d)?.[1].toLowerCase() ?? d).join(', ')}.
        </T>
      ) : null}
      {s.wornWith.length > 0 ? (
        <>
          <T role="micro" tone="brass" style={styles.wornWith}>
            Worn with
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {s.wornWith.map(({ item, times }) => (
              <View key={item.id} style={styles.thumb}>
                <GarmentTile imageUrl={item.imageUrl} width={THUMB_W} aspect={4 / 5} accessibilityLabel={`${title(nameOf(item))}, worn together ${times} times`} onPress={() => router.push(`/closet/piece/${item.id}`)} />
                <T role="micro" tone="faint" align="center" style={styles.times}>
                  {`${times}×`}
                </T>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}
      {s.wearCount > 0 ? (
        <Pressable accessibilityRole="link" hitSlop={hitSlopFor(16)} onPress={() => router.push(`/you/journal?item=${itemId}`)} style={styles.link}>
          <T role="caption" tone="brass" style={styles.semi}>
            The days it was worn, in the record →
          </T>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  line: { marginTop: space.xs },
  // mt-5 text-[10px] tracking-[0.2em]
  wornWith: { marginTop: 20, letterSpacing: 2 },
  // mt-2 gap-3 pb-1
  rail: { flexDirection: 'row', gap: space.md, marginTop: space.sm, paddingBottom: space.xs },
  thumb: { width: THUMB_W },
  // mt-1 text-[10px] tracking-[0.12em]
  times: { marginTop: space.xs, letterSpacing: 1.2 },
  link: { alignSelf: 'flex-start', marginTop: space.lg },
  semi: { fontFamily: fonts.sansSemi },
})
