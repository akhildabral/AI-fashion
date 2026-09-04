// Remove a piece and its record. There is no way back, so it is asked here,
// in a sheet, in words: never a system alert. Params: id.
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { deleteWardrobeItem } from '@zauq/shared/wardrobe'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SheetShell } from '@/src/components/Sheet'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { space } from '@/src/design/tokens'
import { nameOf, title, useInvalidateCloset, usePiece } from '@/src/features/closet/data'

/** The piece beside the question, a 64 thumb at 4/5. */
const THUMB_W = 64

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
    <SheetShell
      title={`Remove the ${item ? nameOf(item) : 'piece'}?`}
      footer={
        <>
          <Button label="Yes, remove it" variant="danger" block style={styles.grow} loading={busy} onPress={() => void remove()} />
          <Button label="Keep it" variant="quiet" disabled={busy} onPress={() => router.back()} />
        </>
      }
    >
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <View style={styles.row}>
        {item ? <GarmentTile imageUrl={item.imageUrl} width={THUMB_W} aspect={4 / 5} /> : null}
        <T role="bodySm" tone="muted" style={styles.line}>
          Its record goes with it: every wear, every outfit it was part of. There is no way back. To keep the ledger and lose the rotation, let it go instead.
        </T>
      </View>
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  line: { flex: 1, minWidth: 0 },
})
