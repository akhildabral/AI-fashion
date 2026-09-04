// Add to your collection: the camera (shot after shot until Done), the
// library (many at once), or the store. Uploads go to the app-level queue so
// they survive the sheet closing; the tiles arrive in the grid as they land.
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button } from '@/src/components/Button'
import { Press } from '@/src/components/Press'
import { SheetShell } from '@/src/components/Sheet'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useJobs } from '@/src/context/JobsProvider'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { PermissionDenied, pickImages, type PickedImage } from '@/src/lib/upload'

type Way = 'camera' | 'library' | 'store'

/** The chooser row: a hairline box, a semibold line over a quiet one, an arrow. */
function Row({ title, line, onPress, disabled }: { title: string; line: string; onPress: () => void; disabled?: boolean }) {
  const { t } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      haptic="select"
      onPress={onPress}
      style={[styles.row, { borderColor: alpha(t.ink, 0.12), borderRadius: radius, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={styles.rowText}>
        <T role="bodySm" style={styles.semi}>
          {title}
        </T>
        <T role="caption" tone="faint">
          {line}
        </T>
      </View>
      <T role="body" tone="faint">
        →
      </T>
    </Press>
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
    <SheetShell
      title="Add to your collection"
      lead="Flat-lays and hangers keep true proportions. Each garment is extracted and framed on its own."
      footer={<Button label={n > 0 ? 'Done' : 'Not now'} variant={n > 0 ? 'primary' : 'quiet'} block onPress={() => router.back()} />}
    >
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />
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
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  // The ways 8 apart, each 20 x 16 inside.
  rows: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.ml, paddingVertical: space.lg, borderWidth: hairline },
  rowText: { flex: 1, gap: space.xs },
  semi: { fontFamily: fonts.sansSemi },
})
