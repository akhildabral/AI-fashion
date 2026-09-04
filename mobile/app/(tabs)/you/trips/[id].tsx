// A trip is a page. Open it on packing day; look back on it after. The
// web's TripPage, block by block: header, the recap and forecast 32 below,
// the capsule, the days and the checklist 40 apart.
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
import { ActionBar, ACTION_BAR_HEIGHT, RoomHeader } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { ArchSkeleton, SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk, queryClient } from '@/src/lib/query'
import { dayKey, formatDay, nights } from '@/src/features/you/dates'
import { ForecastStrip } from '@/src/features/you/ForecastStrip'
import { Card, TextLink } from '@/src/features/you/Furniture'
import { routes } from '@/src/features/you/nav'
import { MiniPieces, pieceName } from '@/src/features/you/Pieces'

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']
/** The web's `grid-cols-3 gap-4`. */
const GRID_GAP = space.lg

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

/** The web's checklist line: `px-4 py-2.5 gap-3`, a 16px box, dashed brass for the things to pick up. */
function CheckRow({ label, on, dashed, capitalize, onToggle, onRemove }: { label: string; on: boolean; dashed?: boolean; capitalize?: boolean; onToggle: () => void; onRemove?: () => void }) {
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
      style={({ pressed }) => [
        styles.check,
        { backgroundColor: dashed ? alpha(t.brassSoft, 0.4) : t.surface, borderColor: dashed ? alpha(t.brass, 0.4) : alpha(t.ink, 0.1), borderStyle: dashed ? 'dashed' : 'solid', borderRadius: radius, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.box, { borderColor: on ? t.brass : alpha(t.ink, 0.35), backgroundColor: on ? t.brass : 'transparent', borderRadius: radius }]}>
        {on ? (
          <T role="micro" style={{ color: t.onBrass }}>
            ✓
          </T>
        ) : null}
      </View>
      <T role="bodySm" style={[styles.checkLabel, capitalize && styles.capitalize, on && { textDecorationLine: 'line-through', color: alpha(t.ink, 0.35) }]}>
        {label}
      </T>
      {onRemove ? <TextLink label="×" tone="muted" onPress={onRemove} /> : null}
    </Pressable>
  )
}

/** A group's micro heading with its done count: the web's `label <span>done/total</span>`. */
function GroupLabel({ label, done, total, tone = 'faint' }: { label: string; done: number; total: number; tone?: 'faint' | 'brass' }) {
  return (
    <T role="micro" tone={tone} style={styles.groupLabel}>
      {label} <T role="micro" tone="faint">{`${done}/${total}`}</T>
    </T>
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
  const tile = Math.floor((width - gutter * 2 - GRID_GAP * 2) / 3)

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
          <View style={[styles.body, styles.stack]}>
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
            <SkeletonBlock width={112} height={16} />
            <SkeletonBlock width="66%" height={48} style={{ marginTop: space.md }} />
            <SkeletonBlock width={160} height={16} style={{ marginTop: space.md }} />
            <View style={{ marginTop: space.xxl }}>
              <ArchSkeleton count={6} columns={3} width={width - gutter * 2} />
            </View>
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
  const essentialsDone = essentials.filter((e) => checked.has(`extra-${e}`)).length
  const customDone = custom.filter((e) => checked.has(`extra-${e}`)).length
  const ticked = capsule.filter((i) => checked.has(`item-${i.id}`)).length + essentialsDone + customDone
  const total = capsule.length + essentials.length + custom.length
  const progress = total ? ticked / total : 0

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: trip.destination }} />
      <Screen>
        <KeyboardAwareScrollView
          bottomOffset={40}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, !past && styles.bodyWithBar]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl tintColor={t.brass} refreshing={q.isFetching} onRefresh={() => void q.refetch()} />}
        >
          <RoomHeader
            eyebrow={`Trips · ${past ? 'past' : on ? 'on now' : 'upcoming'}`}
            title={`${trip.destination},`}
            emphasis={`${nights(trip.startDate, trip.endDate)} days.`}
            lead={`${formatDay(trip.startDate)} to ${formatDay(trip.endDate)}${trip.activities ? ` · ${trip.activities}` : ''}`}
            style={styles.header}
          />

          {recap ? (
            <Plaque style={styles.mt8}>
              <T role="micro" tone="brass">
                Looking back
              </T>
              <T role="h2" style={styles.mt1}>
                {recap.worn} of {recap.packed} pieces worn.
                {recap.unworn.length === 0 ? ' Packed exactly right.' : recap.unworn.length === recap.packed ? ' Nothing was logged on the road.' : ` The ${recap.unworn.map(pieceName).slice(0, 3).join(', ')} never left the case.`}
              </T>
              {recap.unworn.length > 0 && recap.unworn.length < recap.packed ? (
                <T role="bodySm" tone="muted" style={styles.mt1}>
                  Next time, pack {recap.worn || recap.packed - 1}.
                </T>
              ) : null}
              {recap.unworn.length > 0 ? (
                <View style={styles.mt4}>
                  <MiniPieces items={recap.unworn} dim />
                </View>
              ) : null}
            </Plaque>
          ) : null}

          {plan && plan.forecast.days.length > 0 ? (
            <View style={styles.mt8}>
              <ForecastStrip forecast={plan.forecast} partialNote="Part of the trip was beyond the forecast, so it is packed for typical seasonal weather." />
            </View>
          ) : null}

          <View style={styles.mt10}>
            <SectionHead title={`The capsule · ${capsule.length} pieces`} />
            {plan?.rationale ? (
              <T role="bodySm" tone="muted" style={styles.mt1}>
                {plan.rationale}
              </T>
            ) : null}
            {!past ? (
              <T role="caption" tone="faint" style={styles.mt1}>
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
                      <T role="caption" tone="faint" accessible={false}>
                        ·
                      </T>
                      <TextLink label="Unpack" tone="muted" disabled={busy !== null || capsule.length <= 1} onPress={() => void unpack(item)} />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          {days.length > 0 ? (
            <View style={styles.mt10}>
              <SectionHead title="Day by day" />
              <Card style={styles.mt4}>
                {days.map((day, i) => (
                  <View key={`${day.label}-${i}`} style={[styles.day, { borderTopColor: alpha(t.ink, 0.1), borderTopWidth: i === 0 ? 0 : hairline }]}>
                    <View style={styles.dayHead}>
                      <View style={styles.dayText}>
                        <T role="bodySm" style={styles.strong}>
                          {day.label}
                        </T>
                        {day.note ? (
                          <T role="caption" tone="muted" style={styles.note}>
                            {day.note}
                          </T>
                        ) : null}
                      </View>
                      {!past ? <TextLink label={busy === `day-${i}` ? '…' : '+ Add a look'} disabled={busy !== null} onPress={() => void addLook(i)} /> : null}
                    </View>
                    <View style={styles.looks}>
                      {day.looks.map((look, li) => (
                        <View key={look.id} style={styles.look}>
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
            <View style={styles.mt10}>
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
              <View style={styles.groups}>
                {checklistGroups(capsule).map(([label, items]) => (
                  <View key={label}>
                    <GroupLabel label={label} done={items.filter((it) => checked.has(`item-${it.id}`)).length} total={items.length} />
                    <View style={styles.lines}>
                      {items.map((item) => (
                        <CheckRow key={item.id} label={pieceName(item)} capitalize on={checked.has(`item-${item.id}`)} onToggle={() => toggle(`item-${item.id}`)} />
                      ))}
                    </View>
                  </View>
                ))}
                {essentials.length > 0 ? (
                  <View>
                    <GroupLabel label="To pick up" tone="brass" done={essentialsDone} total={essentials.length} />
                    <View style={styles.lines}>
                      {essentials.map((extra) => (
                        <CheckRow key={extra} label={extra} dashed on={checked.has(`extra-${extra}`)} onToggle={() => toggle(`extra-${extra}`)} />
                      ))}
                    </View>
                  </View>
                ) : null}
                {custom.length > 0 ? (
                  <View>
                    <GroupLabel label="Yours" done={customDone} total={custom.length} />
                    <View style={styles.lines}>
                      {custom.map((extra) => (
                        <CheckRow key={extra} label={extra} on={checked.has(`extra-${extra}`)} onToggle={() => toggle(`extra-${extra}`)} onRemove={() => void removeCustom(extra)} />
                      ))}
                    </View>
                  </View>
                ) : null}
                <View style={styles.addRow}>
                  <View style={styles.grow}>
                    <Field compact value={newItem} onChangeText={setNewItem} placeholder="Add your own: passport, meds, a gift…" accessibilityLabel="Add your own item" returnKeyType="done" onSubmitEditing={addItem} />
                  </View>
                  <Button label={busy === 'add-item' ? 'Adding…' : 'Add'} variant="ghost" size="sm" disabled={!newItem.trim() || busy === 'add-item'} onPress={addItem} />
                </View>
              </View>
              {essentials.length > 0 ? (
                <T role="caption" tone="faint" style={styles.mt3}>
                  Missing one of the dashed lines?{' '}
                  <T role="caption" tone="brass" style={styles.strong} accessibilityRole="link" onPress={() => router.push(routes.store)}>
                    Photograph it in the store
                  </T>{' '}
                  and it joins your wishlist.
                </T>
              ) : null}
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
            <Button label="Add from the closet" block style={styles.grow} onPress={() => router.push(routes.tripAdd(id))} />
          </ActionBar>
        ) : null}
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxxl },
  bodyWithBar: { paddingBottom: ACTION_BAR_HEIGHT + space.xl },
  stack: { gap: space.lg },
  header: { paddingBottom: 0 },
  // The web's `mt-*`, literally.
  mt1: { marginTop: space.xs },
  mt3: { marginTop: space.md },
  mt4: { marginTop: space.lg },
  mt8: { marginTop: space.xxl },
  mt10: { marginTop: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginTop: space.lg },
  tileActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, marginTop: space.xs },
  day: { paddingVertical: space.lg },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  dayText: { flex: 1 },
  strong: { fontFamily: fonts.sansSemi },
  note: { marginTop: 2 },
  looks: { marginTop: space.md, gap: space.md },
  look: { gap: 2 },
  lookActions: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap', marginTop: 2 },
  track: { height: 6, borderRadius: radius, overflow: 'hidden', marginTop: space.md },
  fill: { height: '100%', borderRadius: radius },
  groups: { marginTop: 20, gap: 20 },
  groupLabel: { marginBottom: space.sm },
  lines: { gap: space.sm },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10, borderWidth: hairline, minHeight: 44 },
  box: { width: 16, height: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1 },
  capitalize: { textTransform: 'capitalize' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
  removeRow: { flexDirection: 'row', gap: space.md, marginTop: 40, paddingTop: space.lg, borderTopWidth: hairline },
})
