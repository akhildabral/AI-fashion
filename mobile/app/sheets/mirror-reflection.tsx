// Your reflections: the photos the Mirror can dress, one of them active.
// Adding one goes through consent, then the camera or the library. Deleting
// one is asked here, in words; the native Alert is only the permission nudge.
import { useQueryClient } from '@tanstack/react-query'
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Alert as NativeAlert, StyleSheet, View } from 'react-native'
// `usePhoto` is the shared module's name for "dress this one"; it is not a hook.
import { deleteReflection, usePhoto as dressReflection } from '@zauq/shared/tryon'
import type { PhotoResponse } from '@zauq/shared/types'
import { Alert, Card } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Check } from '@/src/components/Check'
import { GarmentTile } from '@/src/components/GarmentTile'
import { SheetShell } from '@/src/components/Sheet'
import { GRID_GAP } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, radius, space } from '@/src/design/tokens'
import { CONSENT_LINE, uploadReflection, useInvalidateMirror, useReflections } from '@/src/features/mirror/data'
import { useMirrorStore } from '@/src/features/mirror/store'
import { qk } from '@/src/lib/query'
import { PermissionDenied, pickImages, type PickSource } from '@/src/lib/upload'

/** A reflection: a person, so 4/5. */
const THUMB = 84

export default function ReflectionSheet() {
  const { t } = useTheme()
  const flash = useFlash()
  const qc = useQueryClient()
  const invalidate = useInvalidateMirror()
  const reflQ = useReflections()
  const { rail } = useMirrorStore()

  const photoUrl = reflQ.data?.photoUrl ?? null
  const photos = reflQ.data?.photos ?? []
  const max = reflQ.data?.max ?? 3
  const canAdd = photos.length < max

  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setPhotos = (r: PhotoResponse) => {
    qc.setQueryData<PhotoResponse>(qk.reflections, { photoUrl: r.photoUrl, photos: r.photos ?? [], max: r.max ?? max })
    void qc.invalidateQueries({ queryKey: qk.reflections })
  }

  async function add(source: PickSource) {
    if (!consent || busy) return
    setError(null)
    try {
      const [image] = await pickImages(source)
      if (!image) return
      setBusy('upload')
      const hadPhoto = !!photoUrl
      const r = await uploadReflection(image)
      setPhotos(r)
      setConsent(false)
      haptics.success()
      flash(hadPhoto ? 'That’s the one the Mirror dresses now.' : rail.some((x) => x.on) ? 'You’re in the mirror. Tap See it on me when you’re ready.' : 'You’re in the mirror.')
      if (!hadPhoto) router.back()
    } catch (err) {
      haptics.failure()
      if (err instanceof PermissionDenied) NativeAlert.alert(err.what === 'camera' ? 'Camera' : 'Photos', err.message)
      else setError(err instanceof Error ? err.message : 'Could not save your photo.')
    } finally {
      setBusy(null)
    }
  }

  async function pick(id: string) {
    if (busy) return
    const p = photos.find((x) => x.id === id)
    if (!p || p.active) return
    setBusy(id)
    try {
      const r = await dressReflection(id)
      setPhotos(r)
      haptics.select()
      flash('That’s the one the Mirror dresses now.')
    } catch {
      flash('Could not switch photos.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(id)
    try {
      const r = await deleteReflection(id)
      setPhotos(r)
      invalidate()
      haptics.thud()
      setConfirm(null)
      flash(r.removedRenders ? `Gone, with ${r.removedRenders} render${r.removedRenders === 1 ? '' : 's'}.` : 'Gone.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete that photo.')
    } finally {
      setBusy(null)
    }
  }

  const uploading = busy === 'upload'
  const chosen = rail.some((x) => x.on)

  return (
    <SheetShell
      title={photos.length > 0 ? 'Your reflections' : 'Add your photo'}
      lead={
        photos.length > 0
          ? canAdd
            ? 'Add one for winter, a haircut, a new length. The brass one is the one the Mirror dresses.'
            : 'Three at most. The brass one is the one the Mirror dresses.'
          : 'One clear, full-length photo, and every outfit renders on you.'
      }
    >
      <Stack.Screen options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 3 }} />

      {photos.length > 0 ? (
        <View style={styles.block}>
          <View style={styles.thumbs}>
            {photos.map((p) => (
              <View key={p.id} style={[styles.thumb, { opacity: p.active ? 1 : 0.75 }]}>
                <GarmentTile
                  photo
                  width={THUMB}
                  aspect={4 / 5}
                  imageUrl={p.url}
                  selected={p.active}
                  badge={p.active ? 'dressed' : undefined}
                  accessibilityLabel={p.active ? 'The one the Mirror dresses' : 'Dress this one'}
                  onPress={() => void pick(p.id)}
                  onLongPress={() => setConfirm(p.id)}
                />
                <Button label="Delete" variant="quiet" size="sm" disabled={busy !== null} onPress={() => setConfirm(p.id)} style={styles.thumbAction} />
              </View>
            ))}
          </View>
          {confirm ? (
            <Card style={[styles.confirm, { borderColor: alpha(t.danger, 0.4) }]}>
              <T role="h3">Delete this photo?</T>
              <T role="bodySm" tone="muted">
                Every render made from it goes with it. There’s no way back.
              </T>
              <View style={styles.row}>
                <Button label="Keep it" variant="quiet" size="sm" onPress={() => setConfirm(null)} />
                <Button label="Delete photo" variant="danger" size="sm" loading={busy === confirm} disabled={busy !== null} onPress={() => void remove(confirm)} />
              </View>
            </Card>
          ) : null}
        </View>
      ) : null}

      {canAdd ? (
        <View style={[styles.block, photos.length > 0 && { borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.12), paddingTop: space.lg }]}>
          {photos.length === 0 && chosen ? (
            <View style={[styles.note, { borderRadius: radius, borderColor: alpha(t.brass, 0.3), backgroundColor: t.brassSoft }]}>
              <T role="lede" style={{ color: alpha(t.ink, 0.8) }}>
                The pieces stay on the rail. Once your photo’s in, See it on me is one tap.
              </T>
            </View>
          ) : null}
          <Check checked={consent} onChange={setConsent} label={CONSENT_LINE} disabled={uploading} />
          <View style={styles.doors}>
            <Button label="Take a photo" block disabled={!consent || uploading} loading={uploading} onPress={() => void add('camera')} />
            <T role="caption" tone="faint" align="center">
              Full-length, a plain wall behind you, even light
            </T>
            <Button label="Choose from gallery" variant="ghost" block disabled={!consent || uploading} onPress={() => void add('library')} />
            <T role="caption" tone="faint" align="center">
              A clear, front-facing, full-length shot
            </T>
          </View>
          {uploading ? (
            <T role="micro" tone="faint" align="center">
              saving your photo…
            </T>
          ) : null}
          {error ? <Alert>{error}</Alert> : null}
        </View>
      ) : null}
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  // A block's parts 16 apart.
  block: { gap: space.lg },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  thumb: { width: THUMB, gap: space.xs },
  thumbAction: { alignSelf: 'center' },
  confirm: { gap: space.sm },
  note: { paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: hairline },
  row: { flexDirection: 'row', alignItems: 'center', columnGap: space.lg, rowGap: space.sm, flexWrap: 'wrap' },
  doors: { gap: space.sm },
})
