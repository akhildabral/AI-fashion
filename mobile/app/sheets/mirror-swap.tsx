// Instead of this piece: clean pieces of the same kind, from the closet.
// A board: two across, 12 apart.
import { useQuery } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { getBriefAlternatives } from '@zauq/shared/brief'
import { LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SheetShell } from '@/src/components/Sheet'
import { ArchSkeleton, GRID_GAP } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { gutter } from '@/src/design/tokens'
import { pieceLabel } from '@/src/features/mirror/data'
import { mk } from '@/src/features/mirror/keys'
import { mirror } from '@/src/features/mirror/store'

export default function SwapSheet() {
  const p = useLocalSearchParams<{ itemId: string; slot: string; label?: string; exclude?: string }>()
  const itemId = String(p.itemId ?? '')
  const slot = String(p.slot ?? '')
  const label = typeof p.label === 'string' && p.label ? p.label : slot
  const exclude = typeof p.exclude === 'string' ? p.exclude.split(',').filter(Boolean) : []
  const { width: sw } = useWindowDimensions()
  const contentW = sw - gutter * 2
  const tileW = Math.floor((contentW - GRID_GAP) / 2)

  const q = useQuery({
    queryKey: mk.alternatives(slot, exclude),
    queryFn: () => getBriefAlternatives(slot, exclude).then((r) => r.alternatives),
    enabled: !!slot,
  })

  return (
    <SheetShell
      title={`Instead of the ${label}`}
      footer={
        <Button
          label="Take it off the rail"
          variant="quiet"
          onPress={() => {
            haptics.tap()
            mirror.remove(itemId)
            router.back()
          }}
        />
      }
    >
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      {q.isPending ? <ArchSkeleton width={contentW} count={2} /> : null}
      {q.isError ? <LoadError onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.length === 0 ? (
        <T role="lede" tone="muted">
          Nothing else of that kind is clean right now.
        </T>
      ) : null}
      {q.data && q.data.length > 0 ? (
        <View style={styles.grid}>
          {q.data.map((a) => (
            <GarmentTile
              key={a.id}
              width={tileW}
              imageUrl={a.imageUrl}
              label={pieceLabel(a)}
              accessibilityLabel={`${pieceLabel(a)}. Put it on instead.`}
              onPress={() => {
                haptics.tap()
                mirror.swap(itemId, a.id)
                router.back()
              }}
            />
          ))}
        </View>
      ) : null}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
})
