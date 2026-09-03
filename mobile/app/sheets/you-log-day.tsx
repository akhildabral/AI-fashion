// Log any day: an outfit you keep, pieces from the closet, or a photo (the
// Today room's sheet takes that one and returns to the record).
import { useMutation, useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { getOutfits } from '@zauq/shared/outfits'
import type { EventType } from '@zauq/shared/types'
import { getWardrobe } from '@zauq/shared/wardrobe'
import { logWear } from '@zauq/shared/wearlog'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Chip, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, space } from '@/src/design/tokens'
import { resolveImageUrl } from '@/src/lib/api'
import { qk, queryClient } from '@/src/lib/query'
import { atNoon, dayKey, formatDay, isDayKey, OCCASIONS, occasionLabel } from '@/src/features/you/dates'
import { RowLabel, Wrap } from '@/src/features/you/Furniture'
import { routes } from '@/src/features/you/nav'
import { PieceGrid } from '@/src/features/you/Pieces'
import { SheetShell } from '@/src/features/you/SheetShell'

type Source = 'outfits' | 'pieces' | 'photo'

export default function LogDaySheet() {
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
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
    <SheetShell
      title="Log a day"
      foot={source !== 'photo' ? <Button label={validDay ? `Log ${formatDay(day)}` : 'Log the day'} block disabled={!ready} loading={log.isPending} onPress={() => log.mutate()} /> : null}
    >
      <Field label="The day" value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCorrect={false} error={dayError} />
      <View>
        <RowLabel first>The kind of day</RowLabel>
        <Wrap style={{ marginTop: space.sm }}>
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
          <Empty line="No kept outfits yet. Log with pieces instead." />
        ) : (
          <View style={styles.grid}>
            {outfits.map((o) => {
              const on = outfitId === o.id
              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${occasionLabel(o.eventType)} outfit, ${o.items.length} pieces`}
                  onPress={() => {
                    haptics.tap()
                    setOutfitId(on ? null : o.id)
                  }}
                  pressRetentionOffset={12}
                  style={{ width: tile }}
                >
                  <Arch width={tile} aspect={4 / 5} selected={on}>
                    <View style={styles.four}>
                      {o.items.slice(0, 4).map((i) => (
                        <Image key={i.id} source={{ uri: resolveImageUrl(i.imageUrl) }} contentFit="contain" cachePolicy="disk" style={styles.quarter} accessible={false} />
                      ))}
                    </View>
                  </Arch>
                  <T role="micro" tone="muted" numberOfLines={1} style={{ marginTop: 6 }}>
                    {occasionLabel(o.eventType)} · {o.items.length} pieces
                  </T>
                </Pressable>
              )
            })}
          </View>
        )
      ) : null}

      {source === 'pieces' ? (
        pieces === null ? (
          <Loading />
        ) : pieces.length === 0 ? (
          <Empty line="Nothing in the closet yet." />
        ) : (
          <PieceGrid items={pieces} selected={picked} ordered max={12} onToggle={(id) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
        )
      ) : null}
      {source !== 'photo' ? (
        <View style={[styles.note, { borderColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
          <T role="caption" tone="faint">
            Pieces of the same day are logged as one look.
          </T>
        </View>
      ) : null}
    </SheetShell>
  )
}

function Loading() {
  return (
    <View style={styles.grid} accessibilityLabel="Loading">
      {[0, 1, 2].map((i) => (
        <SkeletonBlock key={i} width="30%" height={120} />
      ))}
    </View>
  )
}
function Empty({ line }: { line: string }) {
  const { t } = useTheme()
  return (
    <View style={[styles.empty, { borderColor: alpha(t.ink, 0.2), borderRadius: radius }]}>
      <T role="bodySm" tone="muted" align="center">
        {line}
      </T>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  four: { position: 'absolute', left: '8%', right: '8%', top: '9%', bottom: '7%', flexDirection: 'row', flexWrap: 'wrap' },
  quarter: { width: '50%', height: '50%' },
  empty: { borderWidth: 1, borderStyle: 'dashed', padding: space.xl },
  note: { borderWidth: 1, padding: space.md },
})
