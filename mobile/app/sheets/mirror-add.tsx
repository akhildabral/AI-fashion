// Add a piece to the rail, from everything in the closet that isn't on it.
import { FlashList } from '@shopify/flash-list'
import { router, Stack } from 'expo-router'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { EmptyState, LoadError } from '@/src/components/Bits'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { gutter } from '@/src/design/tokens'
import { pieceLabel, useCloset } from '@/src/features/mirror/data'
import { mirror, useMirrorStore } from '@/src/features/mirror/store'

export default function AddPieceSheet() {
  const { width: sw } = useWindowDimensions()
  const { rail } = useMirrorStore()
  const closetQ = useCloset()
  const onRail = new Set(rail.map((r) => r.id))
  const pieces = (closetQ.data ?? []).filter((p) => !onRail.has(p.id))
  const cellW = (sw - gutter * 2) / 3
  const tileW = Math.floor(cellW - 8)

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <FlashList
        data={pieces}
        numColumns={3}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <T role="h2" accessibilityRole="header" style={styles.title}>
            Add a piece
          </T>
        }
        ListEmptyComponent={
          closetQ.isPending ? (
            <ArchSkeleton width={sw - gutter * 2} count={6} columns={3} />
          ) : closetQ.isError ? (
            <LoadError onRetry={() => void closetQ.refetch()} />
          ) : (
            <EmptyState title="Everything is on the rail." line="Add pieces to your closet and they appear here." />
          )
        }
        renderItem={({ item, index }) => (
          <View style={[styles.cell, { width: cellW, alignItems: index % 3 === 0 ? 'flex-start' : index % 3 === 2 ? 'flex-end' : 'center' }]}>
            <GarmentTile
              width={tileW}
              imageUrl={item.imageUrl}
              label={pieceLabel(item)}
              accessibilityLabel={`${pieceLabel(item)}. Put it on the rail.`}
              onPress={() => {
                haptics.tap()
                mirror.add([item.id])
                router.back()
              }}
            />
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 24 }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { paddingTop: 24, paddingBottom: 16 },
  cell: { marginBottom: 14 },
})
