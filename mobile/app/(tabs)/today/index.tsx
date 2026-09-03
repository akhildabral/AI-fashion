// The ritual. Greeting, the week, the day's looks in order, why this, and
// one brass verb in the thumb zone: Wearing it.
//
// The rhythm is TodayPage.tsx's: the greeting, the plaques 16 beneath, the
// notes 16 beneath, the week 24 beneath, the headline 12 under its rule; the
// acts 32 apart on hairlines; Why this, the ROI plaque and the nudges 32 apart.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { getRitualStats, getWeek, shiftKey, todayKey, weatherCheck, type BriefItem, type BriefResponse, type LookSlot } from '@zauq/shared/brief'
import { money } from '@zauq/shared/money'
import { EmptyState, LoadError, Plaque, Stat } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { ACTION_BAR_HEIGHT, ActionBar } from '@/src/components/Room'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { WeekStrip } from '@/src/components/WeekStrip'
import { useAuth } from '@/src/context/AuthProvider'
import { useProfile } from '@/src/context/ProfileProvider'
import * as haptics from '@/src/design/haptics'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { AddLook } from '@/src/features/today/AddLook'
import { ClosetNotes } from '@/src/features/today/ClosetNotes'
import { currentActIndex, firstName, longDay } from '@/src/features/today/copy'
import { Greeting } from '@/src/features/today/Greeting'
import { stripFrom } from '@/src/features/today/keys'
import { LookAct } from '@/src/features/today/LookAct'
import { MoreMenu, type MenuItem } from '@/src/features/today/MoreMenu'
import { go, paths } from '@/src/features/today/nav'
import { Nudges, TripBanner } from '@/src/features/today/Nudges'
import { Starter } from '@/src/features/today/Starter'
import { TodaySkeleton } from '@/src/features/today/TodaySkeleton'
import { looksOf, useBrief, useCloset, useNudges, useRecompose, useRemoveLook, useRitual, useTrips, useUndo, useWearLook } from '@/src/features/today/useToday'
import { WhyThis } from '@/src/features/today/WhyThis'
import { qk } from '@/src/lib/query'

export default function TodayRoom() {
  const { t } = useTheme()
  const flash = useFlash()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { profile } = useProfile()
  const date = todayKey()
  const hour = new Date().getHours()
  const evening = hour >= 18

  const brief = useBrief(date)
  const ritual = useRitual()
  const trips = useTrips()
  const nudges = useNudges()
  const week = useQuery({ queryKey: qk.week(stripFrom()), queryFn: () => getWeek(stripFrom()), staleTime: 60_000 })
  const data = brief.data
  const mode = data?.mode
  const closet = useCloset(mode === 'starter')
  const wear = useWearLook(date)
  const recompose = useRecompose(date)
  const undo = useUndo(date)
  const remove = useRemoveLook(date)
  const [menu, setMenu] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // The midday check: did the forecast move since the brief was composed?
  const checked = useRef(false)
  useEffect(() => {
    if (checked.current || !data || data.mode !== 'brief' || hour < 12) return
    checked.current = true
    weatherCheck(date)
      .then(({ note }) => qc.setQueryData<BriefResponse>(qk.brief(date), (d) => (d ? { ...d, weatherNote: note } : d)))
      .catch(() => undefined)
  }, [data, hour, date, qc])

  const looks = looksOf(data)
  const currentIdx = currentActIndex(looks, date)
  const current: LookSlot | undefined = looks[currentIdx]
  const main: LookSlot | undefined = looks[0]
  const reconsiderable = mode === 'brief' && !!main && !main.worn && !main.wornLook
  const todayOnStrip = week.data?.days.find((d) => d.today)
  const upcomingTrip = trips.data?.trips.find((tr) => tr.startDate > date) ?? trips.data?.trips.find((tr) => tr.startDate <= date && tr.endDate >= date) ?? null
  const stats = ritual.data

  async function onRefresh() {
    setRefreshing(true)
    await Promise.all([brief.refetch(), ritual.refetch(), trips.refetch(), nudges.refetch(), week.refetch()])
    setRefreshing(false)
  }

  function handleWear(look: LookSlot) {
    wear.mutate(
      { look },
      {
        onSuccess: async () => {
          const fresh = await getRitualStats().catch(() => null)
          const brk = fresh?.priceBreaks[0]
          if (brk) flash(`Logged. Your ${brk.label} just broke ${money(brk.threshold)}/wear.`)
          else if (fresh) flash(`Logged. ${fresh.streak} day${fresh.streak === 1 ? '' : 's'} styled in a row.`)
          else flash('Logged for today.')
        },
        onError: (err) => flash(err instanceof Error ? err.message : 'Could not log the wear.'),
      },
    )
  }

  function handleRemove(look: LookSlot) {
    remove.mutate(look.id, {
      onSuccess: () => flash('Taken off the day.'),
      onError: (err) => flash(err instanceof Error ? err.message : 'Could not remove that.'),
    })
  }

  function restyle() {
    recompose.mutate({ refresh: true }, { onError: (err) => flash(err instanceof Error ? err.message : 'Could not restyle.') })
  }

  function openReconsider(item: BriefItem) {
    haptics.tap()
    go(paths.reconsider(date, item.id))
  }

  // Everything that changes the look lives behind one door, so the primary act stays the obvious one.
  const menuItems: MenuItem[] = []
  if (mode === 'brief') {
    if (main && !main.worn) menuItems.push({ label: 'Restyle it', onPress: restyle })
    if (data?.canUndo && !data.worn) menuItems.push({ label: 'Back to the first', onPress: () => undo.mutate(undefined, { onError: (err) => flash(err instanceof Error ? err.message : 'Nothing to go back to.') }) })
    if (!main?.wornLook) menuItems.push({ label: 'I wore something else', onPress: () => go(paths.woreElse({ date, eventType: data?.brief?.eventType, alreadyLogged: !!data?.worn, hasSuggestion: true })) })
    menuItems.push({ label: 'Share', onPress: () => go(paths.share({ date, lookId: current?.id, wearLogId: todayOnStrip?.wearLogId })) })
  }
  menuItems.push({ label: 'Add a look', onPress: () => go(paths.addLook(date)) })
  menuItems.push({ label: 'Plan tomorrow', onPress: () => go(paths.day(shiftKey(date, 1))) })

  const more = <Button variant="icon" accessibilityLabel="Change today's look" icon={<T role="h3">···</T>} onPress={() => setMenu(true)} style={styles.right} />

  const bar = () => {
    if (!data) return null
    if (mode === 'starter') {
      return (
        <ActionBar>
          <Button label="Add your clothes" onPress={() => go(paths.closet)} />
          {more}
        </ActionBar>
      )
    }
    if (mode === 'rest') {
      return (
        <ActionBar>
          <Button label="Dress me after all" loading={recompose.isPending} onPress={restyle} />
          {more}
        </ActionBar>
      )
    }
    if (mode === 'unplanned' || !current) {
      return (
        <ActionBar>
          <Button label="Dress me" loading={recompose.isPending} onPress={restyle} />
          {more}
        </ActionBar>
      )
    }
    const shown = (current.wornLook?.items ?? current.items).map((i) => i.id)
    if (!current.worn) {
      return (
        <ActionBar>
          <Button label={evening ? 'I wore this' : 'Wearing it'} loading={wear.isPending} disabled={recompose.isPending} onPress={() => handleWear(current)} />
          <Button label="See it on you" variant="ghost" disabled={wear.isPending} onPress={() => go(paths.mirror(shown))} />
          {more}
        </ActionBar>
      )
    }
    return (
      <ActionBar>
        <Button label="See it on you" onPress={() => go(paths.mirror(shown))} />
        <Button label="Share" variant="ghost" onPress={() => go(paths.share({ date, lookId: current.id, wearLogId: todayOnStrip?.wearLogId }))} />
        {more}
      </ActionBar>
    )
  }

  const body = () => {
    if (brief.isPending && !data) return <TodaySkeleton header={false} />
    if (brief.isError && !data) return <LoadError message="The stylist is out for a moment. Try again in a few seconds." onRetry={() => void brief.refetch()} />
    if (!data) return null

    if (mode === 'rest') {
      return (
        <Animated.View key="rest" entering={fadeIn} style={styles.rest}>
          <T role="display" accessibilityRole="header">
            A home{' '}
            <T role="display" tone="brass" italic>
              day.
            </T>
          </T>
          <T role="lede" tone="muted">
            No look, no push. The streak stays honest. Change your mind and the stylist is a tap away.
          </T>
        </Animated.View>
      )
    }

    if (mode === 'starter') {
      return (
        <Animated.View key="starter" entering={fadeIn}>
          <Starter closet={closet.data?.items ?? []} />
        </Animated.View>
      )
    }

    if (mode === 'unplanned' || !data.brief || looks.length === 0) {
      return (
        <Animated.View key="unplanned" entering={fadeIn}>
          <EmptyState title="Nothing laid out yet." line="Say the word and today’s look is composed from what’s clean in your closet." />
        </Animated.View>
      )
    }

    return (
      <Animated.View key="brief" entering={fadeIn} style={styles.sections}>
        {brief.isError ? (
          <View style={[styles.alert, { backgroundColor: alpha(t.danger, 0.1), borderRadius: radius }]} accessibilityLiveRegion="polite">
            <T role="bodySm" tone="danger">
              Couldn’t refresh the brief. Pull down to try again.
            </T>
          </View>
        ) : null}
        <View key={looks.map((l) => `${l.id}:${l.itemIds.join('-')}`).join('|')} style={styles.sections}>
          {looks.map((look, i) => (
            <LookAct
              key={look.id}
              look={look}
              state={i < currentIdx ? 'past' : i === currentIdx ? 'current' : 'future'}
              index={2 + i}
              first={i === 0}
              evening={evening}
              onReconsider={i === 0 && reconsiderable ? openReconsider : undefined}
              onWear={handleWear}
              wearing={wear.isPending && wear.variables?.look.id === look.id}
              onRemove={i > 0 ? handleRemove : undefined}
              removing={remove.isPending && remove.variables === look.id}
            />
          ))}
        </View>
        <AddLook date={date} isToday index={2 + looks.length} />

        <WhyThis brief={data.brief} data={data} index={3 + looks.length} />

        {stats && stats.monthlyPayback > 0 ? (
          <Animated.View entering={rise(4 + looks.length)}>
            <Plaque style={styles.plaque}>
              <View style={styles.plaqueHead}>
                <T role="micro" tone="faint" style={styles.tracked2}>
                  Your closet is working
                </T>
                <T role="stat" tone="brass">
                  {money(stats.monthlyPayback)}{' '}
                  <T role="caption" tone="muted" style={styles.semi}>
                    this month
                  </T>
                </T>
              </View>
              <View style={[styles.statRow, { borderTopColor: alpha(t.ink, 0.1) }]}>
                <Stat small value={`${stats.rotationPct}%`} label="in rotation" />
                <Stat small value={stats.outfitsThisWeek} label="this week" />
                <Stat small value={stats.streak} label="day streak" />
              </View>
            </Plaque>
          </Animated.View>
        ) : null}

        {hour >= 20 ? (
          <Animated.View entering={rise(5 + looks.length)} style={[styles.actThree, { borderTopColor: alpha(t.ink, 0.1) }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tomorrow, laid out tonight. Open tomorrow" pressRetentionOffset={12} onPress={() => go(paths.day(shiftKey(date, 1), { laidOut: true }))}>
              <Plaque style={styles.plaque}>
                <View style={styles.plaqueHead}>
                  <T role="micro" tone="brass" style={styles.tracked}>
                    Tomorrow · {longDay(shiftKey(date, 1))}
                  </T>
                  <T role="lede">Tomorrow, laid out tonight.</T>
                </View>
              </Plaque>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>
    )
  }

  const loading = brief.isPending && !data

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: ACTION_BAR_HEIGHT + space.xl }]}
        refreshControl={<RefreshControl tintColor={t.brass} refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        {loading ? (
          <TodaySkeleton />
        ) : (
          <>
            <View style={styles.header}>
              <Greeting name={firstName(user)} stats={stats} />
              {profile && !profile.sizes?.top && !profile.sizes?.bottom && !profile.sizes?.shoe ? (
                <Animated.View entering={rise(2)}>
                  <Pressable accessibilityRole="button" accessibilityLabel="A finer fit. Add your sizes and tone" pressRetentionOffset={12} onPress={() => go(paths.profile)}>
                    <Plaque style={styles.finerFit}>
                      <View style={styles.finerFitText}>
                        <T role="micro" tone="faint" style={styles.tracked2}>
                          A finer fit
                        </T>
                        <T role="lede">Add your sizes and tone: looks land better when the Mirror knows them.</T>
                      </View>
                      <Button label="Add details" variant="ghost" size="sm" onPress={() => go(paths.profile)} />
                    </Plaque>
                  </Pressable>
                </Animated.View>
              ) : null}
              <ClosetNotes index={2} />
            </View>
            <View style={styles.week}>
              <Animated.View entering={rise(2)}>
                <WeekStrip selected={date} onSelect={(d) => d !== date && go(paths.day(d))} />
              </Animated.View>
              {body()}
            </View>
            {!loading && data && (upcomingTrip || (nudges.data?.length ?? 0) > 0) ? (
              <View style={styles.nudges}>
                {upcomingTrip ? <TripBanner trip={upcomingTrip} index={6} /> : null}
                <Nudges cards={nudges.data ?? []} index={7} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      {bar()}
      <MoreMenu open={menu} onClose={() => setMenu(false)} items={menuItems} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.sm, gap: space.xxl },
  // greeting, plaques and notes: `mt-4` apart.
  header: { gap: space.lg },
  // the strip, and the headline `mt-3` under its rule.
  week: { gap: space.md },
  sections: { gap: space.xxl },
  rest: { gap: space.lg },
  nudges: { gap: space.md },
  right: { marginLeft: 'auto' },
  alert: { paddingHorizontal: space.lg, paddingVertical: 10 },
  // `plaque p-4 pl-5`, `items-center justify-between gap-4`.
  finerFit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, padding: space.lg, paddingLeft: 20 },
  finerFitText: { flex: 1, gap: 2 },
  // `p-5 pl-6` (the primitive), the figure `mt-1`, the row `mt-3 border-t pt-3 gap-6`.
  plaque: { gap: space.md },
  plaqueHead: { gap: space.xs },
  statRow: { flexDirection: 'row', gap: space.xl, borderTopWidth: hairline, paddingTop: space.md },
  // `mt-10 border-t border-ink/10 pt-6`.
  actThree: { borderTopWidth: hairline, paddingTop: space.xl },
  tracked: { letterSpacing: 2.8 },
  tracked2: { letterSpacing: 2 },
  semi: { fontFamily: fonts.sansSemi },
})
