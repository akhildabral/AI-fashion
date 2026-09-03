// The record: what was actually worn, day by day, with the holes showing.
// The dataset every brief learns from, so it reads like a ledger you can
// fill in, not a feed.
import { useQuery } from '@tanstack/react-query'
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { getRitualStats } from '@zauq/shared/brief'
import { money } from '@zauq/shared/money'
import type { EventType, WearLogEntry, WearLogListResponse } from '@zauq/shared/types'
import { deleteWearLog, getWearInsights, getWearLog } from '@zauq/shared/wearlog'
import { EmptyState, LoadError, Plaque, SectionHead, Stat } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { GarmentTile } from '@/src/components/GarmentTile'
import { ActionBar, ACTION_BAR_HEIGHT } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Filter } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, space } from '@/src/design/tokens'
import { qk, queryClient } from '@/src/lib/query'
import { dayKey, formatDay, formatMonth, monthKey, OCCASIONS } from '@/src/features/you/dates'
import { DayLogCard } from '@/src/features/you/DayLogCard'
import { TextLink } from '@/src/features/you/Furniture'
import { MonthStrip } from '@/src/features/you/MonthStrip'
import { routes } from '@/src/features/you/nav'
import { UndoBar } from '@/src/features/you/UndoBar'

const UNDO_MS = 6000
const TILE = 112

/** Same-day logs are contiguous (newest first), so grouping is a single pass. */
function groupByDay(logs: WearLogEntry[]): [string, WearLogEntry[]][] {
  const groups: [string, WearLogEntry[]][] = []
  for (const log of logs) {
    const k = dayKey(new Date(log.wornOn))
    const last = groups[groups.length - 1]
    if (last && last[0] === k) last[1].push(log)
    else groups.push([k, [log]])
  }
  return groups
}

export default function Journal() {
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
  const params = useLocalSearchParams<{ item?: string; month?: string }>()
  const itemFilter = params.item || null
  const [month, setMonth] = useState(() => (params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : monthKey(new Date())))
  const [occasion, setOccasion] = useState<EventType | null>(null)
  const [pending, setPending] = useState<{ log: WearLogEntry; timer: ReturnType<typeof setTimeout> } | null>(null)
  const scroller = useRef<ScrollView>(null)
  const dayY = useRef<Record<string, number>>({})

  const key = qk.journal(month)
  const logsQ = useQuery({ queryKey: key, queryFn: () => getWearLog({ month }) })
  const insightsQ = useQuery({ queryKey: qk.insights, queryFn: getWearInsights })
  const ritualQ = useQuery({ queryKey: qk.ritual, queryFn: getRitualStats })

  // A sheet (log a day, the photo) may have written to the record: re-read on return.
  const firstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['journal'] })
      void queryClient.invalidateQueries({ queryKey: qk.insights })
      void queryClient.invalidateQueries({ queryKey: qk.ritual })
    }, []),
  )

  const allLogs = logsQ.data?.logs ?? null
  const days = useMemo(() => new Set(logsQ.data?.days ?? []), [logsQ.data])
  const logs = useMemo(() => {
    if (!allLogs) return null
    return allLogs.filter((l) => (!occasion || l.eventType === occasion) && (!itemFilter || l.itemIds.includes(itemFilter) || l.items.some((i) => i.id === itemFilter)))
  }, [allLogs, occasion, itemFilter])
  const filteredItem = useMemo(() => (itemFilter ? allLogs?.flatMap((l) => l.items).find((i) => i.id === itemFilter) ?? null : null), [itemFilter, allLogs])

  function writeLogs(update: (logs: WearLogEntry[]) => WearLogEntry[]) {
    queryClient.setQueryData<WearLogListResponse>(key, (prev) => {
      if (!prev) return prev
      const next = update(prev.logs)
      const nextDays = new Set(next.map((l) => dayKey(new Date(l.wornOn))))
      return { ...prev, logs: next, days: [...nextDays] }
    })
  }
  const upsert = (log: WearLogEntry) => writeLogs((prev) => [...prev.filter((l) => l.id !== log.id), log].sort((a, b) => (a.wornOn < b.wornOn ? 1 : -1)))

  function remove(log: WearLogEntry) {
    if (pending) {
      clearTimeout(pending.timer)
      void deleteWearLog(pending.log.id).catch(() => undefined)
    }
    haptics.thud()
    writeLogs((prev) => prev.filter((l) => l.id !== log.id))
    const timer = setTimeout(() => {
      deleteWearLog(log.id)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: key })
          void queryClient.invalidateQueries({ queryKey: qk.insights })
          void queryClient.invalidateQueries({ queryKey: qk.ritual })
        })
        .catch(() => {
          flash('Couldn’t remove that day. Try again.')
          upsert(log)
        })
      setPending(null)
    }, UNDO_MS)
    setPending({ log, timer })
  }
  function undo() {
    if (!pending) return
    clearTimeout(pending.timer)
    upsert(pending.log)
    setPending(null)
  }
  function pickDay(day: string, logged: boolean) {
    if (logged) {
      const y = dayY.current[day]
      if (y != null) scroller.current?.scrollTo({ y: Math.max(0, y - 80), animated: true })
    } else router.push(routes.logDay(day))
  }
  const clearItem = () => router.setParams({ item: '' })

  const insights = insightsQ.data
  const ritual = ritualQ.data
  const mostWorn = insights ? [...insights.items].filter((i) => i.wearCount > 0).sort((a, b) => b.wearCount - a.wearCount).slice(0, 8) : []
  const orphans = insights ? insights.items.filter((i) => i.orphan).slice(0, 8) : []
  const filtered = Boolean(itemFilter || occasion)
  const refreshing = logsQ.isFetching && !!logsQ.data

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Wear history' }} />
      <Screen>
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              tintColor={t.brass}
              refreshing={refreshing}
              onRefresh={() => {
                void logsQ.refetch()
                void insightsQ.refetch()
                void ritualQ.refetch()
              }}
            />
          }
        >
          <View style={styles.head}>
            <T role="label" tone="brass">
              The record
            </T>
            <T role="h1" accessibilityRole="header">
              What you <T role="h1" tone="brass" italic>{`actually wore.`}</T>
            </T>
            <T role="bodySm" tone="muted">
              Every brief learns from this. Fill the days, and tell the stylist what to bring back.
            </T>
          </View>

          {ritual || insights ? (
            <Plaque>
              <View style={styles.stats}>
                {ritual ? <Stat value={ritual.streak} label="day streak" /> : null}
                {ritual ? <Stat value={`${ritual.rotationPct}%`} label="in rotation" /> : null}
                {ritual ? <Stat value={money(ritual.monthlyPayback)} label="back this month" /> : null}
              </View>
              {insights ? (
                <View style={[styles.totals, { borderTopColor: alpha(t.ink, 0.1) }]}>
                  <T role="caption" tone="muted">
                    {insights.totals.logged} {insights.totals.logged === 1 ? 'day' : 'days'} logged · {insights.totals.items} pieces · {insights.totals.orphans} idle 90+ days
                  </T>
                  <TextLink label="The ledger, in your Closet →" onPress={() => router.push(routes.closet)} />
                </View>
              ) : null}
            </Plaque>
          ) : null}

          <MonthStrip month={month} days={days} onMonth={setMonth} onPick={pickDay} />

          <View style={styles.filters}>
            <Filter label="All days" on={occasion === null} onPress={() => setOccasion(null)} />
            {OCCASIONS.slice(0, 4).map((o) => (
              <Filter key={o.key} label={o.label} on={occasion === o.key} onPress={() => setOccasion((cur) => (cur === o.key ? null : o.key))} />
            ))}
            {itemFilter ? <Filter label={`${filteredItem ? `The ${filteredItem.subtype ?? filteredItem.category}` : 'One piece'} ×`} on onPress={clearItem} /> : null}
          </View>

          {logsQ.isError && !logs ? (
            <LoadError message="Could not load your record." onRetry={() => void logsQ.refetch()} />
          ) : logs === null ? (
            <View style={styles.list} accessibilityLabel="Loading your record">
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skeleton}>
                  <SkeletonBlock width={160} height={12} />
                  <SkeletonBlock height={120} style={{ marginTop: 12 }} />
                </View>
              ))}
            </View>
          ) : logs.length === 0 ? (
            <EmptyState
              title={filtered ? 'Nothing here' : `Nothing logged in ${formatMonth(month)}`}
              line={filtered ? 'No day matches that. Clear the filter, or log one.' : 'Tap a day above, or "Wearing it" on today’s brief, and the record starts here.'}
              action={filtered ? <Button label="Show every day" variant="ghost" size="sm" onPress={() => { setOccasion(null); clearItem() }} /> : <Button label="Open today’s brief" variant="ghost" size="sm" onPress={() => router.push(routes.today)} />}
            />
          ) : (
            <View style={styles.list}>
              {groupByDay(logs).map(([dayK, dayLogs]) => (
                <View
                  key={dayK}
                  onLayout={(e) => {
                    dayY.current[dayK] = e.nativeEvent.layout.y
                  }}
                  style={styles.group}
                >
                  {dayLogs.length > 1 ? (
                    <>
                      <T role="label" tone="brass">
                        {formatDay(dayLogs[0].wornOn)} <T role="label" tone="faint">{`· ${dayLogs.length} looks`}</T>
                      </T>
                      <View style={[styles.multi, { borderLeftColor: alpha(t.brass, 0.25) }]}>
                        {dayLogs.map((log) => (
                          <DayLogCard key={log.id} log={log} heading="time" onChange={upsert} onRemove={remove} onNote={flash} />
                        ))}
                      </View>
                    </>
                  ) : (
                    <DayLogCard log={dayLogs[0]} onChange={upsert} onRemove={remove} onNote={flash} />
                  )}
                </View>
              ))}
            </View>
          )}

          {mostWorn.length > 0 ? (
            <View style={styles.section}>
              <SectionHead title="Workhorses" />
              <T role="bodySm" tone="muted">
                The pieces doing the most work, and what each wear has cost so far.
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railBody}>
                {mostWorn.map((item) => (
                  <GarmentTile
                    key={item.itemId}
                    width={TILE}
                    imageUrl={item.imageUrl}
                    label={item.subtype ?? item.category}
                    sublabel={`${item.wearCount}× worn${item.costPerWear != null ? ` · ${money(item.costPerWear)}/wear` : ''}`}
                    selected={itemFilter === item.itemId}
                    onPress={() => router.setParams({ item: itemFilter === item.itemId ? '' : item.itemId })}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {orphans.length > 0 ? (
            <View style={styles.section}>
              <SectionHead title="Sitting idle" />
              <T role="bodySm" tone="muted">
                Not worn in over ninety days. Let one go and draft the listing.
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railBody}>
                {orphans.map((item) => (
                  <View key={item.itemId} style={{ width: TILE, opacity: 0.85 }}>
                    <GarmentTile width={TILE} imageUrl={item.imageUrl} label={item.subtype ?? item.category} />
                    <TextLink label="Draft a listing" onPress={() => router.push(routes.resale(item.itemId))} />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </ScrollView>

        {pending ? <UndoBar message={`${formatDay(pending.log.wornOn)} removed.`} onUndo={undo} bottom={ACTION_BAR_HEIGHT + 12} /> : null}
        <ActionBar>
          <Button label="Log a day" block onPress={() => router.push(routes.logDay(dayKey(new Date())))} />
        </ActionBar>
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: ACTION_BAR_HEIGHT + space.xl, gap: space.xl },
  head: { gap: space.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  totals: { marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, gap: 2 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  list: { gap: space.md },
  group: { gap: space.sm },
  multi: { gap: space.sm, borderLeftWidth: 1, paddingLeft: space.md },
  skeleton: { padding: space.lg },
  section: { gap: space.sm },
  rail: { marginHorizontal: -gutter },
  railBody: { paddingHorizontal: gutter, gap: space.md, paddingTop: space.xs },
})
