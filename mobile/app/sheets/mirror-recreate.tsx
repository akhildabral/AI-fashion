// From my closet: how an inspiration look maps onto what you own, and the
// door to your version of it on the rail.
import { useQuery } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { recreateLook } from '@zauq/shared/looks'
import { Arch } from '@/src/components/Arch'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SheetShell } from '@/src/components/Sheet'
import { ArchSkeleton, GRID_GAP } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { gutter, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { pieceLabel } from '@/src/features/mirror/data'
import { mk } from '@/src/features/mirror/keys'
import { mirror } from '@/src/features/mirror/store'

export default function RecreateSheet() {
  const p = useLocalSearchParams<{ lookId: string; title?: string }>()
  const lookId = String(p.lookId ?? '')
  const title = typeof p.title === 'string' ? p.title : ''
  const { t } = useTheme()
  const { width: sw } = useWindowDimensions()
  const contentW = sw - gutter * 2
  const tileW = Math.floor((contentW - GRID_GAP) / 2)

  const q = useQuery({ queryKey: mk.recreate(lookId), queryFn: () => recreateLook(lookId), enabled: !!lookId, staleTime: 5 * 60 * 1000 })
  const closet = q.data
  const total = closet ? closet.pairs.length + closet.missing.length : 0

  return (
    <SheetShell
      title="From my closet"
      lead={title || undefined}
      footer={
        closet ? (
          <>
            {closet.itemIds.length > 0 ? (
              <Button
                label="Your version, on the rail"
                block
                style={styles.grow}
                onPress={() => {
                  haptics.tap()
                  mirror.setRail(closet.itemIds)
                  mirror.setLens('closet')
                  router.back()
                }}
              />
            ) : null}
            <Button label="Close" variant="quiet" onPress={() => router.back()} />
          </>
        ) : undefined
      }
    >
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      {q.isPending ? (
        <View style={styles.group}>
          <T role="micro" tone="faint">
            Looking through your closet…
          </T>
          <ArchSkeleton width={contentW} count={2} />
        </View>
      ) : null}
      {q.isError ? <LoadError message="Could not look through the closet." onRetry={() => void q.refetch()} /> : null}

      {closet ? (
        <View style={styles.group}>
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
                  {/* inside the niche, the in-niche inks: the niche is light in both themes */}
                  <View style={[StyleSheet.absoluteFill, styles.missing]}>
                    <T role="lede" align="center" style={{ color: t.inNicheMuted }}>
                      {m.color} {m.subtype}
                    </T>
                  </View>
                </Arch>
                <View style={styles.caption}>
                  <T role="label" numberOfLines={1} align="center" style={styles.captionLabel}>
                    {m.subtype}
                  </T>
                  <T role="caption" tone="danger" align="center">
                    missing
                  </T>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  // The line, then the board 16 beneath.
  group: { gap: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  missing: { alignItems: 'center', justifyContent: 'center', padding: space.sm },
  // The tile's own caption: 8 under the arch, the label at .12em.
  caption: { marginTop: space.sm, paddingHorizontal: space.xs, gap: 2 },
  captionLabel: { fontFamily: fonts.sansSemi, letterSpacing: 1.32 },
})
