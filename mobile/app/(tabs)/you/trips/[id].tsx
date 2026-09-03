// A trip is a page. Open it on packing day; look back on it after.
import { useMutation, useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { addChecklistItem, addTripLook, deleteTrip, getTrip, removeChecklistItem, removeTripLook, replanTripDay, swapTripItem, updateTrip, type TripPage } from '@zauq/shared/brief'
import type { WardrobeItem } from '@zauq/shared/types'
import { LoadError, Plaque, SectionHead } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ActionBar, ACTION_BAR_HEIGHT } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton, SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { qk, queryClient } from '@/src/lib/query'
import { dayKey, formatDay, nights } from '@/src/features/you/dates'
import { ForecastStrip } from '@/src/features/you/ForecastStrip'
import { Card, TextLink } from '@/src/features/you/Furniture'
import { routes } from '@/src/features/you/nav'
import { MiniPieces, pieceName } from '@/src/features/you/Pieces'

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']

// The checklist reads best packed by kind: all the tops, then bottoms, shoes.
const CHECKLIST_ORDER: [string, string[]][] = [
  ['Tops', ['top']],
  ['Bottoms', ['bottom']],
  ['Dresses', ['dress']],
  ['Outerwear', ['outerwear']],
  ['Shoes', ['footwear']],
  ['Accessories', ['accessory', 'bag']],
]
function checklistGroups(items: WardrobeItem[]): [string, WardrobeItem[]][] {
  const groups: [string, WardrobeItem[]][] = []
  const used = new Set<string>()
  for (const [label, cats] of CHECKLIST_ORDER) {
    const g = items.filter((it) => cats.includes(it.category))
    g.forEach((it) => used.add(it.id))
    if (g.length) groups.push([label, g])
  }
  const rest = items.filter((it) => !used.has(it.id))
  if (rest.length) groups.push(['Other', rest])
  return groups
}

function CheckRow({ label, on, dashed, onToggle, onRemove }: { label: string; on: boolean; dashed?: boolean; onToggle: () => void; onRemove?: () => void }) {
  const { t } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={() => {
        haptics.tap()
        onToggle()
      }}
      pressRetentionOffset={12}
      style={({ pressed }) => [styles.check, { backgroundColor: dashed ? alpha(t.brass, 0.06) : t.surface, borderColor: dashed ? alpha(t.brass, 0.4) : alpha(t.ink, 0.1), borderStyle: dashed ? 'dashed' : 'solid', borderRadius: radius, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.box, { borderColor: on ? t.brass : alpha(t.ink, 0.35), backgroundColor: on ? t.brass : 'transparent', borderRadius: radius }]}>
        {on ? (
          <T role="micro" style={{ color: t.onBrass }}>
            ✓
          </T>
        ) : null}
      </View>
      <T role="bodySm" style={[{ flex: 1, textTransform: 'capitalize' }, on && { textDecorationLine: 'line-through', color: alpha(t.ink, 0.35) }]}>
        {label}
      </T>
      {onRemove ? <TextLink label="×" tone="muted" onPress={onRemove} /> : null}
    </Pressable>
  )
}

export default function TripScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
  const { width } = useWindowDimensions()
  const q = useQuery({ queryKey: qk.trip(id), queryFn: () => getTrip(id), enabled: !!id })
  const data = q.data
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [newItem, setNewItem] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tile = Math.floor((width - gutter * 2 - 24) / 3)

  useEffect(() => {
    if (data) setChecked(new Set(data.trip.checked))
  }, [data])

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.trip(id) })
  const reloadAll = () => {
    void reload()
    void queryClient.invalidateQueries({ queryKey: qk.trips })
  }

  // The checklist remembers: ticks save themselves, a moment after the last one.
  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        updateTrip(id, { checked: [...next] })
          .then(({ trip }) => queryClient.setQueryData<TripPage>(qk.trip(id), (p) => (p ? { ...p, trip } : p)))
          .catch(() => flash('Couldn’t save the checklist. Try again.'))
      }, 500)
      return next
    })
  }

  async function run(key: string, work: () => Promise<unknown>, done?: string) {
    setBusy(key)
    try {
      await work()
      reloadAll()
      if (done) flash(done)
      haptics.tap()
    } catch (err) {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not do that.')
    } finally {
      setBusy(null)
    }
  }

  const notThis = (item: WardrobeItem) =>
    run(`swap-${item.id}`, async () => {
      const r = await swapTripItem(id, item.id)
      flash(`The ${pieceName(item)} is out; the ${pieceName(r.swappedFor)} came in.`)
    })
  const unpack = (item: WardrobeItem) => data && run(`unpack-${item.id}`, () => updateTrip(id, { packedItemIds: data.trip.packedItemIds.filter((x) => x !== item.id) }))
  const replan = (index: number, lookId: string) => run(`day-${index}`, () => replanTripDay(id, index, lookId), 'That look is replanned from the capsule.')
  const addLook = (index: number) => run(`day-${index}`, () => addTripLook(id, index), 'Another look for that day, from the capsule.')
  const removeLook = (index: number, lookId: string) => run(`day-${index}`, () => removeTripLook(id, index, lookId), 'Taken off the day.')
  const removeCustom = (text: string) => run(`custom-${text}`, () => removeChecklistItem(id, text))
  const addItem = () => {
    const text = newItem.trim()
    if (!text) return
    void run('add-item', async () => {
      await addChecklistItem(id, text)
      setNewItem('')
    })
  }

  const remove = useMutation({
    mutationFn: () => deleteTrip(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: qk.trip(id) })
      void queryClient.invalidateQueries({ queryKey: qk.trips })
      haptics.thud()
      router.replace(routes.trips)
    },
    onError: () => flash('Couldn’t remove the trip. Try again.'),
  })

  if (q.isError && !data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: 'Trip' }} />
        <Screen>
          <View style={styles.body}>
            <LoadError message="Could not open the trip." onRetry={() => void q.refetch()} />
            <Button label="All trips" variant="ghost" onPress={() => router.replace(routes.trips)} />
          </View>
        </Screen>
      </>
    )
  }
  if (!data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: 'Trip' }} />
        <Screen>
          <View style={styles.body} accessibilityLabel="Loading the trip">
            <SkeletonBlock width={90} height={10} />
            <SkeletonBlock width="70%" height={30} />
            <SkeletonBlock width={160} height={12} />
            <ArchSkeleton count={6} columns={3} width={width - gutter * 2} />
          </View>
        </Screen>
      </>
    )
  }

  const { trip, capsule, days, recap } = data
  const today = dayKey(new Date())
  const past = trip.endDate < today
  const on = !past && trip.startDate <= today
  const plan = trip.plan
  const essentials = plan?.essentials ?? []
  const custom = plan?.custom ?? []
  const ticked = capsule.filter((i) => checked.has(`item-${i.id}`)).length + essentials.filter((e) => checked.has(`extra-${e}`)).length + custom.filter((e) => checked.has(`extra-${e}`)).length
  const total = capsule.length + essentials.length + custom.length
  const progress = total ? ticked / total : 0

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: trip.destination }} />
      <Screen>
        <KeyboardAwareScrollView bottomOffset={40} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, !past && { paddingBottom: ACTION_BAR_HEIGHT + space.xl }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl tintColor={t.brass} refreshing={q.isFetching} onRefresh={() => void q.refetch()} />}>
          <View style={styles.head}>
            <T role="label" tone="brass">
              Trips · {past ? 'past' : on ? 'on now' : 'upcoming'}
            </T>
            <T role="h1" accessibilityRole="header">
              {trip.destination}, <T role="h1" tone="brass" italic>{`${nights(trip.startDate, trip.endDate)} days.`}</T>
            </T>
            <T role="bodySm" tone="muted">
              {formatDay(trip.startDate)} to {formatDay(trip.endDate)}
              {trip.activities ? ` · ${trip.activities}` : ''}
            </T>
          </View>

          {recap ? (
            <Plaque>
              <T role="micro" tone="brass">
                Looking back
              </T>
              <T role="h3" style={{ marginTop: 4 }}>
                {recap.worn} of {recap.packed} pieces worn.
                {recap.unworn.length === 0 ? ' Packed exactly right.' : recap.unworn.length === recap.packed ? ' Nothing was logged on the road.' : ` The ${recap.unworn.map(pieceName).slice(0, 3).join(', ')} never left the case.`}
              </T>
              {recap.unworn.length > 0 && recap.unworn.length < recap.packed ? (
                <T role="bodySm" tone="muted" style={{ marginTop: 2 }}>
                  Next time, pack {recap.worn || recap.packed - 1}.
                </T>
              ) : null}
              {recap.unworn.length > 0 ? (
                <View style={{ marginTop: space.md }}>
                  <MiniPieces items={recap.unworn} dim />
                </View>
              ) : null}
            </Plaque>
          ) : null}

          {plan && plan.forecast.days.length > 0 ? <ForecastStrip forecast={plan.forecast} partialNote="Part of the trip was beyond the forecast, so it is packed for typical seasonal weather." /> : null}

          <View style={styles.section}>
            <SectionHead title={`The capsule · ${capsule.length} pieces`} />
            {plan?.rationale ? (
              <T role="bodySm" tone="muted">
                {plan.rationale}
              </T>
            ) : null}
            {!past ? (
              <T role="caption" tone="faint">
                {'“Not this” swaps in the closest piece you own. Unpack takes it out.'}
              </T>
            ) : null}
            <View style={styles.grid}>
              {capsule.map((item) => (
                <View key={item.id} style={{ width: tile, opacity: busy === `swap-${item.id}` || busy === `unpack-${item.id}` ? 0.5 : 1 }}>
                  <GarmentTile width={tile} imageUrl={item.imageUrl} label={pieceName(item)} />
                  {!past ? (
                    <View style={styles.tileActions}>
                      <TextLink label="Not this" disabled={busy !== null} onPress={() => void notThis(item)} />
                      <TextLink label="Unpack" tone="muted" disabled={busy !== null || capsule.length <= 1} onPress={() => void unpack(item)} />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          {days.length > 0 ? (
            <View style={styles.section}>
              <SectionHead title="Day by day" />
              <Card>
                {days.map((day, i) => (
                  <View key={`${day.label}-${i}`} style={[styles.day, { borderTopColor: alpha(t.ink, 0.1), borderTopWidth: i === 0 ? 0 : hairline }]}>
                    <View style={styles.dayHead}>
                      <View style={{ flex: 1 }}>
                        <T role="bodySm" style={{ fontWeight: '600' }}>
                          {day.label}
                        </T>
                        {day.note ? (
                          <T role="caption" tone="muted">
                            {day.note}
                          </T>
                        ) : null}
                      </View>
                      {!past ? <TextLink label={busy === `day-${i}` ? '…' : '+ Add a look'} disabled={busy !== null} onPress={() => void addLook(i)} /> : null}
                    </View>
                    <View style={{ gap: space.md }}>
                      {day.looks.map((look, li) => (
                        <View key={look.id} style={{ gap: 6 }}>
                          {day.looks.length > 1 || look.label || look.time ? (
                            <T role="label" tone="brass">
                              {look.label || ORDINALS[li] || `Look ${li + 1}`}
                              {look.time ? <T role="caption" tone="faint">{`  ${look.time}`}</T> : null}
                            </T>
                          ) : null}
                          {look.occasion ? (
                            <T role="caption" tone="muted">
                              {look.occasion}
                            </T>
                          ) : null}
                          <MiniPieces items={look.items} empty="Nothing left in the capsule for this look." />
                          {!past ? (
                            <View style={styles.lookActions}>
                              <TextLink label="Pick pieces" onPress={() => router.push(routes.tripPick(id, i, look.id, look.items.map((it) => it.id)))} />
                              <TextLink label={busy === `day-${i}` ? 'Replanning…' : 'Auto'} tone="muted" disabled={busy !== null} onPress={() => void replan(i, look.id)} />
                              {day.looks.length > 1 ? <TextLink label="Remove" tone="muted" disabled={busy !== null} onPress={() => void removeLook(i, look.id)} /> : null}
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {!past ? (
            <View style={styles.section}>
              <SectionHead
                title="Checklist"
                action={
                  <T role="caption" tone="faint">
                    {ticked} of {total} packed · it remembers
                  </T>
                }
              />
              <View style={[styles.track, { backgroundColor: alpha(t.ink, 0.1) }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: ticked }}>
                <View style={[styles.fill, { backgroundColor: t.brass, width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <View style={{ gap: space.lg, marginTop: space.sm }}>
                {checklistGroups(capsule).map(([label, items]) => {
                  const done = items.filter((it) => checked.has(`item-${it.id}`)).length
                  return (
                    <View key={label} style={{ gap: space.sm }}>
                      <T role="micro" tone="faint">
                        {label} <T role="micro" tone="faint">{`${done}/${items.length}`}</T>
                      </T>
                      {items.map((item) => (
                        <CheckRow key={item.id} label={pieceName(item)} on={checked.has(`item-${item.id}`)} onToggle={() => toggle(`item-${item.id}`)} />
                      ))}
                    </View>
                  )
                })}
                {essentials.length > 0 ? (
                  <View style={{ gap: space.sm }}>
                    <T role="micro" tone="brass">
                      To pick up <T role="micro" tone="faint">{`${essentials.filter((e) => checked.has(`extra-${e}`)).length}/${essentials.length}`}</T>
                    </T>
                    {essentials.map((extra) => (
                      <CheckRow key={extra} label={extra} dashed on={checked.has(`extra-${extra}`)} onToggle={() => toggle(`extra-${extra}`)} />
                    ))}
                  </View>
                ) : null}
                {custom.length > 0 ? (
                  <View style={{ gap: space.sm }}>
                    <T role="micro" tone="faint">
                      Yours <T role="micro" tone="faint">{`${custom.filter((e) => checked.has(`extra-${e}`)).length}/${custom.length}`}</T>
                    </T>
                    {custom.map((extra) => (
                      <CheckRow key={extra} label={extra} on={checked.has(`extra-${extra}`)} onToggle={() => toggle(`extra-${extra}`)} onRemove={() => void removeCustom(extra)} />
                    ))}
                  </View>
                ) : null}
                <View style={styles.addRow}>
                  <View style={{ flex: 1 }}>
                    <Field compact value={newItem} onChangeText={setNewItem} placeholder="Add your own: passport, meds, a gift…" accessibilityLabel="Add your own item" returnKeyType="done" onSubmitEditing={addItem} />
                  </View>
                  <Button label="Add" variant="ghost" size="sm" loading={busy === 'add-item'} disabled={!newItem.trim()} onPress={addItem} />
                </View>
                {essentials.length > 0 ? (
                  <T role="caption" tone="faint">
                    Missing one of the dashed lines? Photograph it in the store from the Closet and it joins your wishlist.
                  </T>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={[styles.removeRow, { borderTopColor: alpha(t.ink, 0.1) }]}>
            {confirmRemove ? (
              <>
                <Button label="Yes, remove it" variant="danger" size="sm" loading={remove.isPending} onPress={() => remove.mutate()} />
                <Button label="Keep it" variant="quiet" size="sm" onPress={() => setConfirmRemove(false)} />
              </>
            ) : (
              <Button label="Remove the trip" variant="quiet" size="sm" onPress={() => setConfirmRemove(true)} />
            )}
          </View>
        </KeyboardAwareScrollView>

        {!past ? (
          <ActionBar>
            <Button label="Today’s brief" variant="ghost" onPress={() => router.push(routes.today)} />
            <Button label="Add from the closet" block style={{ flex: 1 }} onPress={() => router.push(routes.tripAdd(id))} />
          </ActionBar>
        ) : null}
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxl, gap: space.xl },
  head: { gap: space.sm },
  section: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: space.sm },
  tileActions: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
  day: { paddingVertical: space.md, gap: space.md },
  dayHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  lookActions: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  track: { height: 6, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 14, paddingVertical: 10, borderWidth: hairline, minHeight: 44 },
  box: { width: 18, height: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  removeRow: { flexDirection: 'row', gap: space.md, paddingTop: space.lg, borderTopWidth: hairline },
})
