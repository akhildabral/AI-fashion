// Instead of this piece: clean pieces of the same kind, from the closet.
import { useQuery } from '@tanstack/react-query'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { getBriefAlternatives } from '@zauq/shared/brief'
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

export default function SwapSheet() {
  const p = useLocalSearchParams<{ itemId: string; slot: string; label?: string; exclude?: string }>()
  const itemId = String(p.itemId ?? '')
  const slot = String(p.slot ?? '')
  const label = typeof p.label === 'string' && p.label ? p.label : slot
  const exclude = typeof p.exclude === 'string' ? p.exclude.split(',').filter(Boolean) : []
  const { width: sw } = useWindowDimensions()
  const tileW = Math.floor((sw - gutter * 2 - 24) / 3)

  const q = useQuery({
    queryKey: mk.alternatives(slot, exclude),
    queryFn: () => getBriefAlternatives(slot, exclude).then((r) => r.alternatives),
    enabled: !!slot,
  })

  return (
    <Screen padded edges={['bottom']}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <ScrollView contentContainerStyle={styles.content}>
        <T role="h2" accessibilityRole="header">
          Instead of the {label}
        </T>
        {q.isPending ? <ArchSkeleton width={sw - gutter * 2} count={3} columns={3} /> : null}
        {q.isError ? <LoadError onRetry={() => void q.refetch()} /> : null}
        {q.data && q.data.length === 0 ? (
          <T role="bodySm" tone="muted">
            Nothing else of that kind is clean right now.
          </T>
        ) : null}
        <View style={styles.grid}>
          {(q.data ?? []).map((a) => (
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
        <Button
          label="Take it off the rail"
          variant="quiet"
          onPress={() => {
            haptics.tap()
            mirror.remove(itemId)
            router.back()
          }}
        />
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 24, paddingBottom: 24, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
})
