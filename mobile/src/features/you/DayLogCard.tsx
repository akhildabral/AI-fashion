// One day in the record: the look on its board (and the photo, if there is
// one), "Again?" as two chips (a rating is a value picked, so a Chip, brass
// when on), and the small actions beside it. The web's DayCard: `card p-4`, head on the baseline, the board
// 12 below, a hairline foot 12 below that with the actions 4 apart.
import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { clearLookPhoto, shareLook, unshareLook } from '@zauq/shared/circle'
import type { WearLogEntry } from '@zauq/shared/types'
import { temp } from '@zauq/shared/units'
import { rateWearLog } from '@zauq/shared/wearlog'
import { Arch } from '@/src/components/Arch'
import { LookBoard, type FlatLayItem } from '@/src/components/LookBoard'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, space } from '@/src/design/tokens'
import { apiUpload, resolveImageUrl } from '@/src/lib/api'
import { imageForm, PermissionDenied, pickImages } from '@/src/lib/upload'
import { formatDay, occasionLabel, timeOfDay } from './dates'
import { Card, TextLink } from './Furniture'

/** The web's `w-24` photo and `p-4` card. */
const PHOTO_W = 96
const PAD = space.lg

export function DayLogCard({
  log,
  heading = 'date',
  onChange,
  onRemove,
  onNote,
}: {
  log: WearLogEntry
  heading?: 'date' | 'time'
  onChange: (log: WearLogEntry) => void
  onRemove: (log: WearLogEntry) => void
  onNote: (msg: string) => void
}) {
  const { t } = useTheme()
  const { width: screen } = useWindowDimensions()
  const [busy, setBusy] = useState<string | null>(null)
  const shared = Boolean(log.sharedAt)
  const inner = screen - gutter * 2 - PAD * 2
  const boardW = log.photoUrl ? inner - PHOTO_W - space.lg : inner
  const boardItems: (FlatLayItem & { id: string })[] = log.items.filter((i) => !!i.imageUrl).map((i) => ({ id: i.id, category: i.category, subtype: i.subtype, imageUrl: i.imageUrl }))

  async function rate(v: 1 | 5) {
    if (busy) return
    const next = log.rating === v ? null : v
    setBusy('rate')
    // The Chip's own `select()` is the haptic for this choice.
    try {
      await rateWearLog(log.id, next)
      onChange({ ...log, rating: next })
    } catch {
      onNote('Couldn’t save that. Try again.')
    } finally {
      setBusy(null)
    }
  }
  async function toggleShare() {
    setBusy('share')
    try {
      if (shared) {
        await unshareLook(log.id)
        onChange({ ...log, sharedAt: null })
        onNote('Taken off the circle.')
      } else {
        await shareLook(log.id)
        onChange({ ...log, sharedAt: new Date().toISOString() })
        onNote('On the circle.')
      }
      haptics.tap()
    } catch {
      onNote('Couldn’t change that. Try again.')
    } finally {
      setBusy(null)
    }
  }
  async function addPhoto() {
    setBusy('photo')
    try {
      const [image] = await pickImages('library')
      if (!image) return
      const r = await apiUpload<{ photoUrl: string }>(`/looks/${log.id}/photo`, imageForm('photo', image))
      onChange({ ...log, photoUrl: r.photoUrl })
      haptics.success()
    } catch (err) {
      onNote(err instanceof PermissionDenied ? err.message : err instanceof Error ? err.message : 'Could not add the photo.')
    } finally {
      setBusy(null)
    }
  }
  async function removePhoto() {
    setBusy('photo')
    try {
      await clearLookPhoto(log.id)
      onChange({ ...log, photoUrl: null })
    } catch {
      onNote('Could not remove the photo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card padding={PAD}>
      <View style={styles.head}>
        <T role="label" tone="brass">
          {heading === 'time' ? timeOfDay(log.wornOn) : formatDay(log.wornOn)}
        </T>
        <T role="caption" tone="faint" style={{ flexShrink: 1 }} numberOfLines={1}>
          {[occasionLabel(log.eventType), log.weather ? `${temp(log.weather.temperatureC)} ${log.weather.description}` : null, shared ? 'on the circle' : null].filter(Boolean).join(' · ')}
        </T>
      </View>
      <View style={styles.body}>
        {log.photoUrl ? (
          <Arch width={PHOTO_W} aspect={4 / 5} variant="photo">
            <Image source={{ uri: resolveImageUrl(log.photoUrl) }} contentFit="cover" cachePolicy="disk" transition={200} style={StyleSheet.absoluteFill} accessibilityLabel="The day's photo" />
          </Arch>
        ) : null}
        {boardItems.length > 0 ? (
          <LookBoard items={boardItems} width={boardW} aspect={5 / 4} />
        ) : (
          <View style={{ width: boardW, justifyContent: 'center' }}>
            <T role="bodySm" tone="faint">
              Pieces no longer in your closet.
            </T>
          </View>
        )}
      </View>
      <View style={[styles.foot, { borderTopColor: alpha(t.ink, 0.1) }]}>
        <T role="micro" tone="faint" style={styles.again} accessibilityRole="header">
          Again?
        </T>
        <Chip label="Yes" on={log.rating === 5} onPress={() => void rate(5)} />
        <Chip label="Not this one" on={log.rating === 1} onPress={() => void rate(1)} />
        <View style={[styles.sep, { backgroundColor: alpha(t.ink, 0.15) }]} />
        {log.photoUrl ? (
          <TextLink label="Remove the photo" tone="muted" disabled={busy === 'photo'} onPress={() => void removePhoto()} />
        ) : (
          <TextLink label={busy === 'photo' ? 'Adding…' : 'Add a photo'} tone="muted" disabled={busy === 'photo'} onPress={() => void addPhoto()} />
        )}
        <TextLink label={busy === 'share' ? '…' : shared ? 'On the circle ✓' : 'Share to the circle'} tone={shared ? 'brass' : 'muted'} disabled={busy === 'share'} onPress={() => void toggleShare()} />
        <View style={styles.remove}>
          <TextLink label="Remove" tone="muted" onPress={() => onRemove(log)} />
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.lg },
  body: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  foot: { marginTop: space.md, paddingTop: space.md, borderTopWidth: hairline, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  again: { marginRight: 0 },
  // The web's `.filter-sep`: a 1 x 16 hairline with 4 either side.
  sep: { width: 1, height: 16, marginHorizontal: space.xs },
  remove: { marginLeft: 'auto' },
})
