// From my closet: how an inspiration look maps onto what you own, and the
// door to your version of it on the rail.
import { useQuery } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { recreateLook } from '@zauq/shared/looks'
import { Arch } from '@/src/components/Arch'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { gutter } from '@/src/design/tokens'
import { pieceLabel } from '@/src/features/mirror/data'
import { mk } from '@/src/features/mirror/keys'
import { mirror } from '@/src/features/mirror/store'

/** The niche is bone in both themes; its ink is fixed. */
const NICHE_INK = '#6b5f4a'

export default function RecreateSheet() {
  const p = useLocalSearchParams<{ lookId: string; title?: string }>()
  const lookId = String(p.lookId ?? '')
  const title = typeof p.title === 'string' ? p.title : ''
  const { width: sw } = useWindowDimensions()
  const tileW = Math.floor((sw - gutter * 2 - 24) / 3)

  const q = useQuery({ queryKey: mk.recreate(lookId), queryFn: () => recreateLook(lookId), enabled: !!lookId, staleTime: 5 * 60 * 1000 })
  const closet = q.data
  const total = closet ? closet.pairs.length + closet.missing.length : 0

  return (
    <Screen padded edges={['bottom']}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <ScrollView contentContainerStyle={styles.content}>
        <T role="h2" accessibilityRole="header">
          From my closet
        </T>
        {title ? (
          <T role="lede" tone="muted">
            {title}
          </T>
        ) : null}

        {q.isPending ? (
          <>
            <T role="bodySm" tone="muted">
              Looking through your closet…
            </T>
            <ArchSkeleton width={sw - gutter * 2} count={3} columns={3} />
          </>
        ) : null}
        {q.isError ? <LoadError message="Could not look through the closet." onRetry={() => void q.refetch()} /> : null}

        {closet ? (
          <>
            <T role="bodySm" tone="muted">
              {closet.pairs.length === 0
                ? 'None of it is in your closet yet.'
                : `${closet.pairs.length} of ${total} pieces ${closet.pairs.length === 1 ? 'is' : 'are'} yours${closet.missing.length ? '; the rest is what you’d need' : ''}.`}
            </T>
            <View style={styles.grid}>
              {closet.pairs.map((pair) => (
                <GarmentTile
                  key={pair.item.id}
                  width={tileW}
                  imageUrl={pair.item.imageUrl}
                  label={pieceLabel(pair.item)}
                  sublabel={pair.band === 'sure' ? 'yours' : `close · for the ${pair.piece.subtype}`}
                />
              ))}
              {closet.missing.map((m, i) => (
                <View key={i} style={{ width: tileW }}>
                  <Arch width={tileW}>
                    <View style={[StyleSheet.absoluteFill, styles.missing]}>
                      <T role="caption" align="center" style={{ color: NICHE_INK, fontStyle: 'italic' }}>
                        {m.color} {m.subtype}
                      </T>
                    </View>
                  </Arch>
                  <View style={styles.caption}>
                    <T role="caption" numberOfLines={1}>
                      {m.subtype}
                    </T>
                    <T role="micro" tone="danger">
                      missing
                    </T>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.actions}>
              {closet.itemIds.length > 0 ? (
                <Button
                  label="Your version, on the rail"
                  block
                  onPress={() => {
                    haptics.tap()
                    mirror.setRail(closet.itemIds)
                    mirror.setLens('closet')
                    router.back()
                  }}
                />
              ) : null}
              <Button label="Close" variant="quiet" onPress={() => router.back()} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 24, paddingBottom: 24, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  missing: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  caption: { marginTop: 8, gap: 2 },
  actions: { gap: 8, alignItems: 'center', marginTop: 6 },
})
