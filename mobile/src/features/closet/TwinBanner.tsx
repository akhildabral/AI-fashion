// A twin flag: this piece and the one it looks like, side by side, and your
// answer. Nothing happens until you say.
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { WardrobeItem } from '@zauq/shared/types'
import { resolveTwin } from '@zauq/shared/wardrobe'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius } from '@/src/design/tokens'
import { nameOf, title, useInvalidateCloset, usePiece } from './data'

export function TwinBanner({ item, onResolved, onNote }: { item: WardrobeItem; onResolved: (kept: WardrobeItem | null) => void; onNote: (line: string) => void }) {
  const { t } = useTheme()
  const other = usePiece(item.twinOfId ?? '')
  const invalidate = useInvalidateCloset()
  const [busy, setBusy] = useState<string | null>(null)

  async function answer(resolution: 'same' | 'different', keepPhoto = false) {
    setBusy(resolution + (keepPhoto ? '-photo' : ''))
    try {
      const r = await resolveTwin(item.id, resolution, keepPhoto)
      haptics.success()
      invalidate(item.id)
      if (item.twinOfId) invalidate(item.twinOfId)
      onNote(resolution === 'same' ? 'One piece, then. The count’s right again.' : 'Two pieces. Noted. I won’t ask again.')
      onResolved(resolution === 'same' ? r.kept : null)
    } catch (err) {
      haptics.failure()
      onNote(err instanceof Error ? err.message : 'Could not save that.')
      setBusy(null)
    }
  }

  const twin = other.data
  return (
    <View style={[styles.box, { borderColor: alpha(t.brass, 0.5), borderRadius: radius }]}>
      <T role="label" tone="brass">
        A twin?
      </T>
      <T role="bodySm" tone="muted">
        This looks like a piece you already have{twin ? `: the ${nameOf(twin)}` : ''}.
        {item.twinScore != null ? (item.twinScore >= 13 ? ' Same type, same colours, and the photo matches.' : ' The same type and colours.') : ''} Nothing happens until you say.
      </T>
      <View style={styles.pair}>
        <View style={styles.thumb}>
          <GarmentTile imageUrl={item.imageUrl} width={64} aspect={4 / 5} />
          <T role="micro" tone="faint" align="center">
            New
          </T>
        </View>
        {twin ? (
          <View style={styles.thumb}>
            <GarmentTile imageUrl={twin.imageUrl} width={64} aspect={4 / 5} accessibilityLabel={`Open the ${title(nameOf(twin))}`} onPress={() => router.push(`/closet/piece/${twin.id}`)} />
            <T role="micro" tone="faint" align="center">
              Yours
            </T>
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button label="Same piece" size="sm" loading={busy === 'same'} disabled={busy !== null} onPress={() => void answer('same')} />
        <Button label="Same, keep this photo" variant="ghost" size="sm" loading={busy === 'same-photo'} disabled={busy !== null} onPress={() => void answer('same', true)} />
        <Button label="Different" variant="quiet" size="sm" loading={busy === 'different'} disabled={busy !== null} onPress={() => void answer('different')} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderWidth: hairline, padding: 16, gap: 8 },
  pair: { flexDirection: 'row', gap: 12, marginTop: 4 },
  thumb: { width: 64, gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
})
