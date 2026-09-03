// A day that isn't today. Past: what you wore, the recap, share it. Future:
// name the day and the look is composed now, more looks after it; or rest it.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'
import { getWeek, shiftKey, todayKey, type LookSlot } from '@zauq/shared/brief'
import { EVENT_LABEL } from '@zauq/shared/outfits'
import { temp } from '@zauq/shared/units'
import { EmptyState, LoadError, Plaque } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { LookBoard } from '@/src/components/LookBoard'
import { ACTION_BAR_HEIGHT, ActionBar } from '@/src/components/Room'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, space } from '@/src/design/tokens'
import { qk } from '@/src/lib/query'
import { DAY_CHIPS, itemLabel, longDay } from './copy'
import { LookAct } from './LookAct'
import { MoreMenu } from './MoreMenu'
import { go, paths } from './nav'
import { TodaySkeleton } from './TodaySkeleton'
import { looksOf, useBrief, useRecompose, useRemoveLook } from './useToday'

export function DayView({ date, laidOut = false }: { date: string; laidOut?: boolean }) {
  const past = date < todayKey()
  return past ? <PastDay date={date} /> : <FutureDay date={date} laidOut={laidOut} />
}

// ---- past: the recap ----

function PastDay({ date }: { date: string }) {
  const { t } = useTheme()
  const W = useWindowDimensions().width - gutter * 2
  const [menu, setMenu] = useState(false)
  const week = useQuery({ queryKey: qk.week(date), queryFn: () => getWeek(date), staleTime: 60_000 })
  const day = week.data?.days.find((d) => d.date === date) ?? null
  const refreshing = week.isFetching && !!week.data

  const body = () => {
    if (week.isPending && !week.data) return <TodaySkeleton header={false} />
    if (week.isError && !week.data) return <LoadError message="Couldn’t load that day." onRetry={() => void week.refetch()} />
    if (!day) {
      return <EmptyState title="Nothing on record." line="No look was worn or logged that day." action={<Button label="Log what you wore" variant="ghost" size="sm" onPress={() => go(paths.woreElse({ date }))} />} />
    }
    if (!day.worn) {
      return (
        <EmptyState
          title={day.rest ? 'A home day.' : 'Nothing logged.'}
          line={day.rest ? 'A rest. The streak stayed honest.' : 'The look for that day was never worn, or never logged.'}
          action={<Button label="Log what you wore" variant="ghost" size="sm" onPress={() => go(paths.woreElse({ date, eventType: day.eventType }))} />}
        />
      )
    }
    return (
      <Animated.View entering={fadeIn} style={{ gap: space.lg }}>
        <Animated.View entering={rise(0)} style={{ gap: space.sm }}>
          <T role="label" tone="brass">
            {longDay(date)}
          </T>
          <T role="display" accessibilityRole="header">
            You wore{' '}
            <T role="display" tone="brass" italic>
              this.
            </T>
          </T>
          {day.eventType ? (
            <T role="micro" tone="faint">
              {EVENT_LABEL[day.eventType] ?? day.eventType}
            </T>
          ) : null}
        </Animated.View>
        <Animated.View entering={rise(1)}>
          <LookBoard items={day.items} width={W} sweep />
        </Animated.View>
        <Animated.View entering={rise(2)}>
          <Plaque style={{ gap: space.sm }}>
            <T role="micro" tone="faint">
              That day
            </T>
            <View>
              {day.items.map((it, i) => (
                <View key={it.id} style={[styles.pieceRow, i < day.items.length - 1 && { borderBottomWidth: hairline, borderBottomColor: alpha(t.ink, 0.1) }]}>
                  <GarmentTile imageUrl={it.imageUrl} width={40} />
                  <T role="bodySm" style={{ textTransform: 'capitalize', flex: 1 }}>
                    {itemLabel(it)}
                  </T>
                </View>
              ))}
            </View>
            <T role="caption" tone="faint">
              {day.eventType ? `${EVENT_LABEL[day.eventType] ?? day.eventType} · ` : ''}
              {day.shared ? 'shared to your circle' : 'kept to yourself'}
              {day.photoUrl ? ' · with a photo' : ''}
            </T>
          </Plaque>
        </Animated.View>
      </Animated.View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: ACTION_BAR_HEIGHT + space.xl }]}
        refreshControl={<RefreshControl tintColor={t.brass} refreshing={refreshing} onRefresh={() => void week.refetch()} />}
      >
        {body()}
      </ScrollView>
      {day?.worn ? (
        <ActionBar>
          <Button label="Share it" onPress={() => go(paths.share({ date, wearLogId: day.wearLogId }))} />
          <Button label="See it on me" variant="ghost" onPress={() => go(paths.mirror(day.itemIds))} />
          <Button variant="icon" accessibilityLabel="More" icon={<T role="h3">···</T>} onPress={() => setMenu(true)} style={{ marginLeft: 'auto' }} />
        </ActionBar>
      ) : null}
      <MoreMenu
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: 'I wore something else', onPress: () => go(paths.woreElse({ date, eventType: day?.eventType, alreadyLogged: true })) },
          { label: 'Compose from it', onPress: () => go(paths.compose) },
        ]}
      />
    </View>
  )
}

// ---- future: plan the day ----

function FutureDay({ date, laidOut }: { date: string; laidOut: boolean }) {
  const { t } = useTheme()
  const flash = useFlash()
  const qc = useQueryClient()
  const [menu, setMenu] = useState(false)
  const [occasion, setOccasion] = useState('')
  const brief = useBrief(date, { peek: !laidOut })
  const recompose = useRecompose(date)
  const remove = useRemoveLook(date)
  const data = brief.data
  const tomorrow = date === shiftKey(todayKey(), 1)
  const rest = data?.mode === 'rest'
  const look = data?.mode === 'brief' ? (data.brief ?? null) : null
  const looks = look ? looksOf(data) : []
  const current = rest ? 'rest' : (look?.eventType ?? null)
  const busy = recompose.isPending
  const pendingKey = busy ? (recompose.variables?.rest ? 'rest' : (recompose.variables?.eventType ?? 'occasion')) : null

  function plan(body: { eventType?: string; occasion?: string; rest?: boolean }) {
    recompose.mutate(body, {
      onSuccess: () => {
        flash(body.rest ? 'A home day. No look, no push.' : `${longDay(date)} is planned.`)
        void qc.invalidateQueries({ queryKey: qk.brief(date) })
      },
      onError: (err) => flash(err instanceof Error ? err.message : 'Could not plan that day.'),
    })
  }

  function handleRemove(l: LookSlot) {
    remove.mutate(l.id, {
      onSuccess: () => flash('Taken off the day.'),
      onError: (err) => flash(err instanceof Error ? err.message : 'Could not remove that.'),
    })
  }

  const eyebrow = tomorrow ? `Tomorrow · ${longDay(date)}` : longDay(date)
  const headline: [string, string] = laidOut && look ? ['Laid', 'out.'] : rest ? ['A home', 'day.'] : ['What kind of', 'day?']

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: ACTION_BAR_HEIGHT + space.xl }]}
        refreshControl={<RefreshControl tintColor={t.brass} refreshing={brief.isFetching && !!data} onRefresh={() => void brief.refetch()} />}
      >
        <Animated.View entering={rise(0)} style={{ gap: space.sm }}>
          <T role="label" tone="brass">
            {eyebrow}
          </T>
          <T role="display" accessibilityRole="header">
            {headline[0]}{' '}
            <T role="display" tone="brass" italic>
              {headline[1]}
            </T>
          </T>
        </Animated.View>

        <Animated.View entering={rise(1)} style={{ gap: space.md }}>
          <View style={styles.chips}>
            {DAY_CHIPS.map((c) => (
              <Chip key={c.key} label={pendingKey === c.key ? '…' : c.label} on={current === c.key && !look?.occasion} onPress={() => !busy && plan({ eventType: c.key })} />
            ))}
            <Chip label={pendingKey === 'rest' ? '…' : 'Home day'} on={rest} onPress={() => !busy && plan({ rest: true })} />
          </View>
          <View style={styles.occasionRow}>
            <View style={{ flex: 1 }}>
              <Field
                compact
                value={occasion}
                onChangeText={setOccasion}
                placeholder="Or name it: a wedding, a first day, a long flight"
                returnKeyType="go"
                onSubmitEditing={() => occasion.trim() && plan({ occasion: occasion.trim() })}
                accessibilityLabel="Name the day"
              />
            </View>
            <Button label="Plan" variant="ghost" size="sm" disabled={busy || !occasion.trim()} loading={pendingKey === 'occasion'} onPress={() => plan({ occasion: occasion.trim() })} />
          </View>
        </Animated.View>

        {brief.isPending && !data ? (
          <T role="bodySm" tone="faint">
            reading the day…
          </T>
        ) : null}
        {brief.isError && !data ? <LoadError onRetry={() => void brief.refetch()} /> : null}
        {rest ? (
          <T role="lede" tone="muted">
            No look, no push. The streak stays honest.
          </T>
        ) : null}
        {data?.mode === 'starter' ? (
          <T role="lede" tone="muted">
            The closet needs a few more clean pieces to plan this day.
          </T>
        ) : null}
        {data?.mode === 'unplanned' ? (
          <T role="lede" tone="muted">
            Nothing planned. Name the day and the look is composed now; the morning push will confirm it.
          </T>
        ) : null}

        {look ? (
          <Animated.View key={look.itemIds.join('-')} entering={fadeIn} style={{ gap: space.lg }}>
            {looks.map((l, i) => (
              <LookAct
                key={l.id}
                look={l}
                state={i === 0 ? 'current' : 'future'}
                index={2 + i}
                first={i === 0}
                planning
                headline={i === 0 ? null : undefined}
                onRemove={i > 0 ? handleRemove : undefined}
                removing={remove.isPending && remove.variables === l.id}
              />
            ))}
            {laidOut ? (
              <T role="caption" tone="faint">
                The morning push will say it was laid out tonight.
              </T>
            ) : null}
            <Button label="Add a look" variant="quiet" size="sm" onPress={() => go(paths.addLook(date))} />
            <Animated.View entering={rise(3)}>
              <Plaque style={{ gap: space.sm }}>
                <T role="micro" tone="faint">
                  {longDay(date)}
                </T>
                {look.weather ? (
                  <T role="stat" tone="brass">
                    {temp(look.weather.temperatureC)}{' '}
                    <T role="caption" tone="muted">
                      {look.weather.description}
                    </T>
                  </T>
                ) : (
                  <T role="bodySm" tone="muted">
                    Add your city in the fitting for the forecast.
                  </T>
                )}
                <View style={{ borderTopWidth: hairline, borderTopColor: alpha(t.ink, 0.1) }}>
                  {look.items.map((it, i) => (
                    <View key={it.id} style={[styles.pieceRow, i < look.items.length - 1 && { borderBottomWidth: hairline, borderBottomColor: alpha(t.ink, 0.1) }]}>
                      <GarmentTile imageUrl={it.imageUrl} width={40} />
                      <T role="bodySm" style={{ textTransform: 'capitalize', flex: 1 }}>
                        {itemLabel(it)}
                      </T>
                    </View>
                  ))}
                </View>
              </Plaque>
            </Animated.View>
          </Animated.View>
        ) : null}
      </ScrollView>

      {look ? (
        <ActionBar>
          <Button label="See it on me" onPress={() => go(paths.mirror(look.itemIds))} />
          <Button label="Another" variant="ghost" loading={busy && recompose.variables?.eventType === look.eventType} disabled={busy} onPress={() => plan({ eventType: look.eventType, occasion: look.occasion ?? undefined })} />
          <Button variant="icon" accessibilityLabel="More" icon={<T role="h3">···</T>} onPress={() => setMenu(true)} style={{ marginLeft: 'auto' }} />
        </ActionBar>
      ) : null}
      <MoreMenu
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: 'Add a look', onPress: () => go(paths.addLook(date)) },
          { label: 'Make it a home day', onPress: () => plan({ rest: true }) },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.lg, gap: space.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  occasionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pieceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
})
