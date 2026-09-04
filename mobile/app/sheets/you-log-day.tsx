// Log any day: an outfit you keep, pieces from the closet, or a photo (the
// Today room's sheet takes that one and returns to the record).
import { useMutation, useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { getOutfits } from '@zauq/shared/outfits'
import type { EventType } from '@zauq/shared/types'
import { getWardrobe } from '@zauq/shared/wardrobe'
import { logWear } from '@zauq/shared/wearlog'
import { Arch } from '@/src/components/Arch'
import { EmptyState } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Press } from '@/src/components/Press'
import { ArchSkeleton } from '@/src/components/Skeleton'
import { Chip, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { gutter, space } from '@/src/design/tokens'
import { resolveImageUrl } from '@/src/lib/api'
import { qk, queryClient } from '@/src/lib/query'
import { atNoon, dayKey, formatDay, isDayKey, OCCASIONS, occasionLabel } from '@/src/features/you/dates'
import { FieldLabel, Wrap } from '@/src/features/you/Furniture'
import { routes } from '@/src/features/you/nav'
import { PieceGrid } from '@/src/features/you/Pieces'
import { SheetShell } from '@/src/components/Sheet'

type Source = 'outfits' | 'pieces' | 'photo'

export default function LogDaySheet() {
  const router = useRouter()
  const flash = useFlash()
  const { width } = useWindowDimensions()
  const params = useLocalSearchParams<{ date?: string }>()
  const today = dayKey(new Date())
  const [day, setDay] = useState(params.date && isDayKey(params.date) ? params.date : today)
  const [occasion, setOccasion] = useState<EventType>('work')
  const [source, setSource] = useState<Source>('outfits')
  const [outfitId, setOutfitId] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])

  const outfitsQ = useQuery({ queryKey: qk.outfits, queryFn: getOutfits })
  const piecesQ = useQuery({ queryKey: qk.wardrobe, queryFn: getWardrobe })
  const outfits = outfitsQ.data?.outfits ?? null
  const pieces = piecesQ.data ? piecesQ.data.items.filter((i) => i.status === 'ready') : null

  useEffect(() => {
    if (outfits && outfits.length === 0) setSource((s) => (s === 'outfits' ? 'pieces' : s))
  }, [outfits])
  // A sensible default from the weekday; changeable in a tap.
  const validDay = isDayKey(day)
  const dow = validDay ? atNoon(day).getDay() : 1
  useEffect(() => {
    setOccasion(dow === 0 || dow === 6 ? 'casual' : 'work')
  }, [dow])

  const dayError = !validDay ? 'A date, as YYYY-MM-DD.' : day > today ? 'Not a day that has happened yet.' : null
  const ready = !dayError && (source === 'outfits' ? Boolean(outfitId) : picked.length > 0)

  const log = useMutation({
    mutationFn: () => logWear({ wornOn: atNoon(day).toISOString(), eventType: occasion, ...(source === 'outfits' ? { outfitId: outfitId! } : { itemIds: picked }) }),
    onSuccess: ({ log: entry }) => {
      haptics.success()
      void queryClient.invalidateQueries({ queryKey: ['journal'] })
      void queryClient.invalidateQueries({ queryKey: qk.insights })
      void queryClient.invalidateQueries({ queryKey: qk.ritual })
      void queryClient.invalidateQueries({ queryKey: ['week'] })
      flash(`${formatDay(entry.wornOn)} logged.`)
      router.back()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not log that day.')
    },
  })

  const tile = Math.floor((width - gutter * 2 - 24) / 3)

  return (
    <SheetShell dense
      title="Log a day"
      footer={source !== 'photo' ? <Button label={validDay ? `Log ${formatDay(day)}` : 'Log the day'} block disabled={!ready} loading={log.isPending} onPress={() => log.mutate()} /> : null}
    >
      <Field label="The day" value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCorrect={false} error={dayError} />
      <View>
        <FieldLabel>The kind of day</FieldLabel>
        <Wrap>
          {OCCASIONS.map((o) => (
            <Chip key={o.key} label={o.label} on={occasion === o.key} onPress={() => setOccasion(o.key)} />
          ))}
        </Wrap>
      </View>
      <Tabs<Source>
        items={[
          { key: 'outfits', label: 'An outfit' },
          { key: 'pieces', label: 'Pieces', count: picked.length || undefined },
          { key: 'photo', label: 'A photo' },
        ]}
        value={source}
        onChange={setSource}
      />

      {source === 'photo' ? (
        <View style={{ gap: space.md }}>
          <T role="bodySm" tone="muted">
            A photo of the day, and the stylist reads the pieces from it. Anything new joins the closet.
          </T>
          <Button label="Log from a photo" block disabled={!!dayError} onPress={() => router.replace(routes.woreElse(day))} />
        </View>
      ) : null}

      {source === 'outfits' ? (
        outfits === null ? (
          <Loading />
        ) : outfits.length === 0 ? (
          <EmptyState title="No kept outfits yet. Log with pieces instead." />
        ) : (
          <View style={styles.grid}>
            {outfits.map((o) => {
              const on = outfitId === o.id
              return (
                <Press
                  key={o.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${occasionLabel(o.eventType)} outfit, ${o.items.length} pieces`}
                  onPress={() => {
                    haptics.select()
                    setOutfitId(on ? null : o.id)
                  }}
                  wrapStyle={{ width: tile }}
                >
                  <Arch width={tile} aspect={4 / 5} selected={on}>
                    <View style={styles.four}>
                      {o.items.slice(0, 4).map((i) => (
                        <Image key={i.id} source={{ uri: resolveImageUrl(i.imageUrl) }} contentFit="contain" cachePolicy="disk" style={styles.quarter} accessible={false} />
                      ))}
                    </View>
                  </Arch>
                  <T role="label" tone="muted" numberOfLines={1} align="center" style={styles.outfitLabel}>
                    {occasionLabel(o.eventType)} · {o.items.length} pieces
                  </T>
                </Press>
              )
            })}
          </View>
        )
      ) : null}

      {source === 'pieces' ? (
        pieces === null ? (
          <Loading />
        ) : pieces.length === 0 ? (
          <EmptyState title="Nothing in the closet yet." />
        ) : (
          <PieceGrid items={pieces} selected={picked} columns={4} gap={space.sm} ordered max={12} onToggle={(id) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
        )
      ) : null}
      {source !== 'photo' ? (
        <T role="caption" tone="faint">
          Pieces of the same day are logged as one look.
        </T>
      ) : null}
    </SheetShell>
  )
}

/** The shape of the outfits arriving: three arches across. */
function Loading() {
  const { width } = useWindowDimensions()
  return <ArchSkeleton count={3} columns={3} width={width - gutter * 2} />
}
const styles = StyleSheet.create({
  // Three kept outfits across, 12 apart, the label 8 beneath each.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  outfitLabel: { marginTop: space.sm },
  four: { position: 'absolute', left: '8%', right: '8%', top: '9%', bottom: '7%', flexDirection: 'row', flexWrap: 'wrap' },
  quarter: { width: '50%', height: '50%' },
})
