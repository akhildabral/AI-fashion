// Add to your collection: the camera (shot after shot until Done), the
// library (many at once), or the store. Uploads go to the app-level queue so
// they survive the sheet closing; the tiles arrive in the grid as they land.
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Button } from '@/src/components/Button'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useJobs } from '@/src/context/JobsProvider'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { PermissionDenied, pickImages, type PickedImage } from '@/src/lib/upload'

type Way = 'camera' | 'library' | 'store'

function Row({ title, line, onPress, disabled }: { title: string; line: string; onPress: () => void; disabled?: boolean }) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      pressRetentionOffset={12}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: pressed ? t.brass : alpha(t.ink, 0.14), borderRadius: radius, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T role="body" style={{ fontFamily: fonts.sansSemi }}>
          {title}
        </T>
        <T role="caption" tone="muted">
          {line}
        </T>
      </View>
      <T role="body" tone="faint">
        →
      </T>
    </Pressable>
  )
}

export default function AddPiecesSheet() {
  const flash = useFlash()
  const { enqueueUploads } = useJobs()
  const [busy, setBusy] = useState<Way | null>(null)
  const [shots, setShots] = useState<PickedImage[]>([])

  function fail(err: unknown) {
    haptics.failure()
    flash(err instanceof PermissionDenied ? err.message : err instanceof Error ? err.message : 'Could not open that.')
  }

  /** The camera, shot after shot; each one queues at once, Done closes the sheet. */
  async function camera() {
    setBusy('camera')
    try {
      const [shot] = await pickImages('camera')
      if (shot) {
        haptics.tap()
        enqueueUploads([shot])
        setShots((s) => [...s, shot])
      } else if (shots.length === 0) {
        return
      }
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  async function library() {
    setBusy('library')
    try {
      const picked = await pickImages('library', { multiple: true })
      if (picked.length === 0) return
      haptics.tap()
      enqueueUploads(picked)
      flash(picked.length === 1 ? 'Adding one piece.' : `Adding ${picked.length} pieces.`)
      router.back()
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const n = shots.length

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
      <View style={styles.content}>
        <T role="h2" accessibilityRole="header">
          Add to your collection
        </T>
        <T role="bodySm" tone="muted">
          Flat-lays and hangers keep true proportions. Each garment is extracted and framed on its own.
        </T>
        <View style={styles.rows}>
          <Row
            title={n > 0 ? `Take another (${n} added)` : 'Camera'}
            line={n > 0 ? 'Keep going; every shot is already on its way.' : 'Shot after shot, until you tap Done.'}
            disabled={busy !== null}
            onPress={() => void camera()}
          />
          <Row title="Photo library" line="Pick several at once." disabled={busy !== null} onPress={() => void library()} />
          <Row
            title="Scan in store"
            line="Hold a piece up; the closet says how many outfits it makes."
            disabled={busy !== null}
            onPress={() => {
              router.back()
              router.push('/closet/store')
            }}
          />
        </View>
      </View>
      <View style={styles.foot}>
        <Button label={n > 0 ? 'Done' : 'Not now'} variant={n > 0 ? 'primary' : 'quiet'} block onPress={() => router.back()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: gutter, paddingTop: space.xl, gap: space.md },
  rows: { gap: 10, paddingTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 18, paddingVertical: 14, borderWidth: hairline },
  foot: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.md },
})
