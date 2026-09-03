// Remove a piece and its record. There is no way back, so it is asked here,
// in a sheet, in words. Params: id.
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { deleteWardrobeItem } from '@zauq/shared/wardrobe'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { gutter, space } from '@/src/design/tokens'
import { nameOf, title, useInvalidateCloset, usePiece } from '@/src/features/closet/data'

export default function RemovePieceSheet() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const flash = useFlash()
  const invalidate = useInvalidateCloset()
  const piece = usePiece(id)
  const [busy, setBusy] = useState(false)
  const item = piece.data
  const name = item ? title(nameOf(item)) : 'this piece'

  async function remove() {
    setBusy(true)
    try {
      await deleteWardrobeItem(id)
      haptics.thud()
      invalidate(id)
      router.dismiss()
      router.navigate('/closet')
      flash(`${name} removed from the closet.`)
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Couldn’t remove it. Try again.')
      setBusy(false)
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <View style={styles.content}>
        <T role="h2" accessibilityRole="header">
          Remove the {item ? nameOf(item) : 'piece'}?
        </T>
        <View style={styles.row}>
          {item ? <GarmentTile imageUrl={item.imageUrl} width={72} aspect={4 / 5} /> : null}
          <T role="body" tone="muted" style={{ flex: 1 }}>
            Its record goes with it: every wear, every outfit it was part of. There is no way back. To keep the ledger and lose the rotation, let it go instead.
          </T>
        </View>
        <View style={styles.actions}>
          <Button label="Yes, remove it" variant="danger" block loading={busy} onPress={() => void remove()} />
          <Button label="Keep it" variant="quiet" block disabled={busy} onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.lg, gap: space.lg },
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  actions: { gap: 8 },
})
