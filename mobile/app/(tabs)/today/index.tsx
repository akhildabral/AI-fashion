// The ritual. Greeting, the week, the day's looks in order, why this, and
// one brass verb in the thumb zone: Wearing it.
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
import { gutter, space } from '@/src/design/tokens'
import { ClosetNotes } from '@/src/features/today/ClosetNotes'
import { currentActIndex, firstName } from '@/src/features/today/copy'
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
          flash('Wear logged.')
          const fresh = await getRitualStats().catch(() => null)
          const brk = fresh?.priceBreaks[0]
          if (brk) flash(`Wear logged. Your ${brk.label} just broke ${money(brk.threshold)}/wear.`)
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

  const menuItems: MenuItem[] = []
  if (mode === 'brief') {
    if (!main?.wornLook) menuItems.push({ label: 'I wore something else', onPress: () => go(paths.woreElse({ date, eventType: data?.brief?.eventType, alreadyLogged: !!data?.worn, hasSuggestion: true })) })
    menuItems.push({ label: 'Share', onPress: () => go(paths.share({ date, lookId: current?.id, wearLogId: todayOnStrip?.wearLogId })) })
  }
  menuItems.push({ label: 'Add a look', onPress: () => go(paths.addLook(date)) })
  if (data?.canUndo && !data.worn) menuItems.push({ label: 'Back to the first', onPress: () => undo.mutate(undefined, { onError: (err) => flash(err instanceof Error ? err.message : 'Nothing to go back to.') }) })
  menuItems.push({ label: 'Plan tomorrow', onPress: () => go(paths.day(shiftKey(date, 1))) })

  const more = <Button variant="icon" accessibilityLabel="More" icon={<T role="h3">···</T>} onPress={() => setMenu(true)} style={{ marginLeft: 'auto' }} />

  const bar = () => {
    if (!data) return null
    if (mode === 'starter') {
      return (
        <ActionBar>
          <Button label="Add pieces" onPress={() => go(paths.closet)} />
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
    if (!current.worn) {
      return (
        <ActionBar>
          <Button label={evening ? 'I wore this' : 'Wearing it'} loading={wear.isPending} disabled={recompose.isPending} onPress={() => handleWear(current)} />
          {currentIdx === 0 ? (
            <Button label="Restyle" variant="ghost" loading={recompose.isPending} disabled={wear.isPending} onPress={restyle} />
          ) : (
            <Button label="See it on me" variant="ghost" onPress={() => go(paths.mirror(current.itemIds))} />
          )}
          {more}
        </ActionBar>
      )
    }
    return (
      <ActionBar>
        <Button label="See it on me" onPress={() => go(paths.mirror((current.wornLook?.items ?? current.items).map((i) => i.id)))} />
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
        <Animated.View key="rest" entering={fadeIn} style={styles.section}>
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
      <Animated.View key="brief" entering={fadeIn} style={styles.section}>
        {brief.isError ? (
          <T role="caption" tone="danger">
            Couldn’t refresh the brief. Pull down to try again.
          </T>
        ) : null}
        <View key={looks.map((l) => `${l.id}:${l.itemIds.join('-')}`).join('|')} style={styles.section}>
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
        <Button label="Add a look" variant="quiet" size="sm" onPress={() => go(paths.addLook(date))} />

        <WhyThis brief={data.brief} data={data} index={3 + looks.length} />

        {hour >= 20 ? (
          <Animated.View entering={rise(4 + looks.length)}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tomorrow, laid out tonight. Open tomorrow" pressRetentionOffset={12} onPress={() => go(paths.day(shiftKey(date, 1), { laidOut: true }))}>
              <Plaque style={{ gap: 4 }}>
                <T role="micro" tone="brass">
                  Act three
                </T>
                <T role="lede">Tomorrow, laid out tonight.</T>
              </Plaque>
            </Pressable>
          </Animated.View>
        ) : null}

        {stats && stats.monthlyPayback > 0 ? (
          <Animated.View entering={rise(5 + looks.length)}>
            <Plaque style={{ gap: space.md }}>
              <T role="micro" tone="faint">
                Your closet is working
              </T>
              <T role="stat" tone="brass">
                {money(stats.monthlyPayback)}{' '}
                <T role="caption" tone="muted">
                  this month
                </T>
              </T>
              <View style={styles.statRow}>
                <Stat small value={`${stats.rotationPct}%`} label="in rotation" />
                <Stat small value={stats.outfitsThisWeek} label="this week" />
                <Stat small value={stats.streak} label="day streak" />
              </View>
            </Plaque>
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
            <Greeting name={firstName(user)} stats={stats} />
            {profile && !profile.sizes?.top && !profile.sizes?.bottom && !profile.sizes?.shoe ? (
              <Animated.View entering={rise(2)}>
                <Pressable accessibilityRole="button" accessibilityLabel="A finer fit. Add your sizes" pressRetentionOffset={12} onPress={() => go(paths.profile)}>
                  <Plaque style={styles.plaque}>
                    <T role="micro" tone="faint">
                      A finer fit
                    </T>
                    <T role="lede" style={styles.plaqueLine}>
                      Add your sizes and tone: looks land better when the Mirror knows them.
                    </T>
                  </Plaque>
                </Pressable>
              </Animated.View>
            ) : null}
            <ClosetNotes index={2} />
            <Animated.View entering={rise(2)}>
              <WeekStrip selected={date} onSelect={(d) => d !== date && go(paths.day(d))} />
            </Animated.View>
            {body()}
            {!loading && data ? (
              <View style={styles.section}>
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
  body: { paddingHorizontal: gutter, gap: space.xl },
  section: { gap: space.xl },
  statRow: { flexDirection: 'row', gap: space.xl },
  plaque: { paddingVertical: 14, paddingRight: space.lg, paddingLeft: 20, gap: 4 },
  plaqueLine: { fontSize: 16, lineHeight: 22 },
})
