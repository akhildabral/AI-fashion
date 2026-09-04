// A new trip: a destination and dates become a capsule packed from the
// closet. Preview it day by day, add a look where a day needs two, then save
// it and the trip becomes a page. The web's PackingPage form and preview:
// a form card, the preview a group (40) below and its sections 40 apart.
import { useMutation } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { createTrip } from '@zauq/shared/brief'
import type { PackingResponse, WardrobeItem } from '@zauq/shared/types'
import { packForTrip, packLook } from '@zauq/shared/wardrobe'
import { SectionHead } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ActionRow, useBottomReserve } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { qk, queryClient } from '@/src/lib/query'
import { dayKey, isDayKey } from '@/src/features/you/dates'
import { ForecastStrip } from '@/src/features/you/ForecastStrip'
import { Card, FieldLabel, TextLink, Wrap } from '@/src/features/you/Furniture'
import { routes } from '@/src/features/you/nav'
import { MiniPieces, pieceName } from '@/src/features/you/Pieces'

const PLANS: { key: string; label: string }[] = [
  { key: 'city', label: 'City days' },
  { key: 'beach', label: 'Beach' },
  { key: 'work', label: 'Work' },
  { key: 'a wedding', label: 'A wedding' },
  { key: 'hiking', label: 'Hiking' },
  { key: 'cold weather', label: 'Cold' },
]
const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']
/** The web's `grid-cols-3 gap-4`. */
const GRID_GAP = space.lg

let lookSeq = 0
const nextLookId = () => `look-${Date.now().toString(36)}-${++lookSeq}`

export default function NewTrip() {
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
  const { width } = useWindowDimensions()
  const bottom = useBottomReserve()
  const today = dayKey(new Date())
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [plans, setPlans] = useState<string[]>([])
  const [activities, setActivities] = useState('')
  const [result, setResult] = useState<PackingResponse | null>(null)
  const [extraLooks, setExtraLooks] = useState<Record<number, { id: string; items: WardrobeItem[] }[]>>({})
  const [addingLook, setAddingLook] = useState<number | null>(null)
  const [errors, setErrors] = useState<{ destination?: string; start?: string; end?: string }>({})

  const planText = [...plans, activities.trim()].filter(Boolean).join(', ')
  const tile = Math.floor((width - gutter * 2 - GRID_GAP * 2) / 3)

  const pack = useMutation({
    mutationFn: () => packForTrip({ destination: destination.trim(), startDate, endDate, activities: planText || undefined }),
    onSuccess: (r) => {
      setResult(r)
      setExtraLooks({})
      haptics.success()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not plan your packing.')
    },
  })

  const save = useMutation({
    mutationFn: () => {
      if (!result) throw new Error('Plan the capsule first.')
      return createTrip({
        destination: destination.trim(),
        startDate,
        endDate,
        activities: planText || null,
        packedItemIds: result.plan.capsule.map((c) => c.id),
        plan: {
          rationale: result.plan.rationale,
          essentials: result.plan.essentials,
          forecast: result.forecast,
          days: result.plan.days.map((d, i) => {
            const base = d.items.map((x) => x.id)
            return { label: d.label, note: d.note, itemIds: base, looks: [{ id: 'main', itemIds: base }, ...(extraLooks[i] ?? []).map((l) => ({ id: l.id, itemIds: l.items.map((x) => x.id) }))] }
          }),
        },
      })
    },
    onSuccess: ({ trip }) => {
      void queryClient.invalidateQueries({ queryKey: qk.trips })
      haptics.success()
      router.replace(routes.trip(trip.id))
    },
    onError: (err) => flash(err instanceof Error ? err.message : 'Could not save the trip.'),
  })

  function submit() {
    const next: typeof errors = {}
    if (!destination.trim()) next.destination = 'Where to?'
    if (!isDayKey(startDate)) next.start = 'A date, as YYYY-MM-DD.'
    else if (startDate < today) next.start = 'The trip can’t start in the past.'
    if (!isDayKey(endDate)) next.end = 'A date, as YYYY-MM-DD.'
    else if (isDayKey(startDate) && endDate < startDate) next.end = 'The end comes after the start.'
    setErrors(next)
    if (Object.keys(next).length) return
    pack.mutate()
  }

  async function addPreviewLook(dayIndex: number) {
    if (!result) return
    setAddingLook(dayIndex)
    try {
      const capsuleIds = result.plan.capsule.map((c) => c.id)
      const base = result.plan.days[dayIndex].items.map((i) => i.id)
      const extras = (extraLooks[dayIndex] ?? []).map((l) => l.items.map((i) => i.id))
      const { items } = await packLook(capsuleIds, [base, ...extras])
      setExtraLooks((prev) => ({ ...prev, [dayIndex]: [...(prev[dayIndex] ?? []), { id: nextLookId(), items }] }))
      haptics.tap()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not add a look.')
    } finally {
      setAddingLook(null)
    }
  }
  const removePreviewLook = (dayIndex: number, lookId: string) => setExtraLooks((prev) => ({ ...prev, [dayIndex]: (prev[dayIndex] ?? []).filter((l) => l.id !== lookId) }))

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'A new trip' }} />
      <Screen>
        <KeyboardAwareScrollView bottomOffset={40} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}>
          <Card padding="form">
            <T role="micro" tone="brass">
              A new trip
            </T>
            <View style={styles.fields}>
              <Field label="Destination" value={destination} onChangeText={setDestination} placeholder="e.g. Lisbon" autoCapitalize="words" error={errors.destination} returnKeyType="next" />
              <View style={styles.dates}>
                <View style={styles.half}>
                  <Field
                    label="From"
                    value={startDate}
                    onChangeText={(v) => {
                      setStartDate(v)
                      if (isDayKey(v) && v > endDate) setEndDate(v)
                    }}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numbers-and-punctuation"
                    autoCorrect={false}
                    error={errors.start}
                  />
                </View>
                <View style={styles.half}>
                  <Field label="To" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCorrect={false} error={errors.end} />
                </View>
              </View>
              <View>
                <FieldLabel>Plans</FieldLabel>
                <Wrap>
                  {PLANS.map((p) => {
                    const on = plans.includes(p.key)
                    return <Chip key={p.key} label={p.label} on={on} onPress={() => setPlans((s) => (on ? s.filter((x) => x !== p.key) : [...s, p.key]))} />
                  })}
                </Wrap>
                <View style={styles.other}>
                  <Field compact value={activities} onChangeText={setActivities} placeholder="Anything else: a dinner, a conference…" accessibilityLabel="Other plans" returnKeyType="done" onSubmitEditing={submit} />
                </View>
              </View>
            </View>
          </Card>

          {result ? (
            <View style={styles.preview}>
              <ForecastStrip forecast={result.forecast} partialNote="Part of the trip is beyond the forecast horizon, so it is packed for typical seasonal weather." />

              <View>
                <SectionHead title={`The capsule · ${result.plan.capsule.length} pieces`} />
                <T role="bodySm" tone="muted" style={styles.lead}>
                  {result.plan.rationale}
                </T>
                <T role="caption" tone="faint" style={styles.lead}>
                  Save it to edit the capsule, tick things off, and have the brief dress you from it.
                </T>
                <View style={styles.grid}>
                  {result.plan.capsule.map((item) => (
                    <GarmentTile key={item.id} width={tile} imageUrl={item.imageUrl} label={pieceName(item)} />
                  ))}
                </View>
              </View>

              {result.plan.days.length > 0 ? (
                <View>
                  <SectionHead title="Day by day" />
                  <Card style={styles.afterHead}>
                    {result.plan.days.map((day, i) => {
                      const looks = [{ id: 'main', items: day.items, removable: false }, ...(extraLooks[i] ?? []).map((l) => ({ id: l.id, items: l.items, removable: true }))]
                      return (
                        <View key={day.label} style={[styles.day, { borderTopColor: alpha(t.ink, 0.1), borderTopWidth: i === 0 ? 0 : hairline }]}>
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
                            <TextLink label={addingLook === i ? '…' : '+ Add a look'} disabled={addingLook !== null} onPress={() => void addPreviewLook(i)} />
                          </View>
                          <View style={styles.looks}>
                            {looks.map((look, li) => (
                              <View key={look.id} style={styles.look}>
                                {looks.length > 1 ? (
                                  <View style={styles.lookHead}>
                                    <T role="label" tone="brass">
                                      {ORDINALS[li] ?? `Look ${li + 1}`}
                                    </T>
                                    {look.removable ? <TextLink label="Remove" tone="muted" onPress={() => removePreviewLook(i, look.id)} /> : null}
                                  </View>
                                ) : null}
                                <MiniPieces items={look.items} />
                              </View>
                            ))}
                          </View>
                        </View>
                      )
                    })}
                  </Card>
                </View>
              ) : null}

              {result.plan.essentials.length > 0 ? (
                <View>
                  <SectionHead title="And the rest" />
                  <T role="bodySm" tone="muted" style={styles.lead}>
                    Worth packing, not in the closet. They join the checklist once the trip is saved.
                  </T>
                  <Wrap style={styles.rest}>
                    {result.plan.essentials.map((e) => (
                      <View key={e} style={[styles.essential, { borderColor: alpha(t.brass, 0.4), borderRadius: radius }]}>
                        <T role="bodySm">{e}</T>
                      </View>
                    ))}
                  </Wrap>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* the form's verb at its end; once there is a plan, the plan's */}
          <ActionRow>
            {result ? (
              <>
                <Button label="Save the trip" block style={styles.grow} loading={save.isPending} disabled={pack.isPending} onPress={() => save.mutate()} />
                <Button label="Replan" variant="ghost" loading={pack.isPending} disabled={save.isPending} onPress={submit} />
              </>
            ) : (
              <Button label="Plan the capsule" block loading={pack.isPending} onPress={submit} />
            )}
          </ActionRow>
        </KeyboardAwareScrollView>
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md },
  // The fields 8 under the card's label (label to line), 16 apart.
  fields: { marginTop: space.sm, gap: space.lg },
  dates: { flexDirection: 'row', gap: space.lg },
  half: { flex: 1 },
  other: { marginTop: space.md },
  preview: { marginTop: space.xxxl, gap: space.xxxl },
  // A section head and its line: 8.
  lead: { marginTop: space.sm },
  afterHead: { marginTop: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginTop: space.lg },
  day: { paddingVertical: space.lg },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  dayText: { flex: 1 },
  strong: { fontFamily: fonts.sansSemi },
  note: { marginTop: 2 },
  looks: { marginTop: space.md, gap: space.md },
  look: { gap: space.sm },
  lookHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  rest: { marginTop: space.md },
  essential: { borderWidth: hairline, borderStyle: 'dashed', paddingHorizontal: space.md, paddingVertical: 6 },
  grow: { flex: 1 },
})
