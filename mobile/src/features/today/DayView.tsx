// A day that isn't today. Past: what you wore, the recap, share it. Future:
// name the day and the look is composed now, more looks after it; or rest it.
//
// The room's head (a tracked brass eyebrow over the Bodoni h1), the chips 16
// beneath and the field 16 under them, the board a block beneath, the plaque
// a block beneath with hairline rows of 40-wide arches.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated from 'react-native-reanimated'
import { getWeek, shiftKey, todayKey, type LookSlot } from '@zauq/shared/brief'
import { EVENT_LABEL } from '@zauq/shared/outfits'
import { temp } from '@zauq/shared/units'
import { LoadError, Plaque, VerdictNotes } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { MoreGlyph } from '@/src/components/Glyphs'
import { Field } from '@/src/components/Field'
import { GarmentTile } from '@/src/components/GarmentTile'
import { LookBoard } from '@/src/components/LookBoard'
import { ActionRow, RoomHeader, useBottomReserve } from '@/src/components/Room'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { fadeIn, rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, space } from '@/src/design/tokens'
import { qk } from '@/src/lib/query'
import { AddLook } from './AddLook'
import { DAY_CHIPS, itemLabel, longDay } from './copy'
import { LookAct } from './LookAct'
import { MoreMenu, useMoreMenu } from './MoreMenu'
import { go, paths } from './nav'
import { TodaySkeleton } from './TodaySkeleton'
import { looksOf, useBrief, useRecompose, useRemoveLook } from './useToday'

export function DayView({ date, laidOut = false }: { date: string; laidOut?: boolean }) {
  const past = date < todayKey()
  return past ? <PastDay date={date} /> : <FutureDay date={date} laidOut={laidOut} />
}

/** The room's head: the eyebrow over the headline, whatever follows 16 beneath. */
function DayHead({ eyebrow, lead, emphasis, children }: { eyebrow: string; lead: string; emphasis?: string; children?: ReactNode }) {
  return (
    <Animated.View entering={rise(0)}>
      <RoomHeader eyebrow={eyebrow} title={lead} emphasis={emphasis} />
      {children}
    </Animated.View>
  )
}

/** The pieces of a day in a plaque: a hairline list of 40-wide arches. */
function PieceList({ items, top = false }: { items: { id: string; imageUrl: string; subtype: string | null; category: string }[]; top?: boolean }) {
  const { t } = useTheme()
  const rule = alpha(t.ink, 0.1)
  return (
    <View style={top ? { borderTopWidth: hairline, borderTopColor: rule } : null}>
      {items.map((it, i) => (
        <View key={it.id} style={[styles.pieceRow, i < items.length - 1 && { borderBottomWidth: hairline, borderBottomColor: rule }]}>
          <GarmentTile imageUrl={it.imageUrl} width={40} />
          <T role="bodySm" style={[styles.piece, { color: alpha(t.ink, 0.8) }]}>
            {itemLabel(it)}
          </T>
        </View>
      ))}
    </View>
  )
}

// ---- past: the recap ----

function PastDay({ date }: { date: string }) {
  const { t } = useTheme()
  const W = useWindowDimensions().width - gutter * 2
  const menu = useMoreMenu()
  const bottom = useBottomReserve()
  const week = useQuery({ queryKey: qk.week(date), queryFn: () => getWeek(date), staleTime: 60_000 })
  const day = week.data?.days.find((d) => d.date === date) ?? null
  const refreshing = week.isFetching && !!week.data
  const eyebrow = longDay(date)

  const body = () => {
    if (week.isPending && !week.data) return <TodaySkeleton header={false} />
    if (week.isError && !week.data) return <LoadError message="Couldn’t load that day." onRetry={() => void week.refetch()} />
    if (!day || !day.worn) {
      const rest = !!day?.rest
      return (
        <Animated.View entering={fadeIn} style={styles.sections}>
          <DayHead eyebrow={eyebrow} lead={!day ? 'Nothing on record.' : rest ? 'A home day.' : 'Nothing logged.'}>
            <T role="lede" tone="muted">
              {!day ? 'No look was worn or logged that day.' : rest ? 'A rest. The streak stayed honest.' : 'The look for that day was never worn, or never logged.'}
            </T>
          </DayHead>
          <View style={styles.actions}>
            <Button label="Log what you wore" variant="ghost" onPress={() => go(paths.woreElse({ date, eventType: day?.eventType }))} />
          </View>
        </Animated.View>
      )
    }
    return (
      <Animated.View entering={fadeIn} style={styles.sections}>
        <View style={styles.look}>
          <DayHead eyebrow={eyebrow} lead="You wore" emphasis="this.">
            {day.eventType ? (
              <T role="label" tone="faint">
                {EVENT_LABEL[day.eventType] ?? day.eventType}
              </T>
            ) : null}
          </DayHead>
          <Animated.View entering={rise(1)}>
            <LookBoard items={day.items} width={W} sweep />
            <ActionRow top={space.lg}>
              <Button label="Share it" onPress={() => go(paths.share({ date, wearLogId: day.wearLogId }))} />
              <Button label="See it on you" variant="ghost" onPress={() => go(paths.mirror(day.itemIds))} />
              <View ref={menu.ref} collapsable={false} style={styles.right}>
                <Button variant="icon" accessibilityLabel="More" tall icon={<MoreGlyph />} onPress={menu.show} />
              </View>
            </ActionRow>
          </Animated.View>
        </View>
        <Animated.View entering={rise(2)}>
          <Plaque label="That day" style={styles.plaque}>
            <PieceList items={day.items} />
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
    <View style={styles.fill}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottom }]}
        refreshControl={<RefreshControl tintColor={t.brass} refreshing={refreshing} onRefresh={() => void week.refetch()} />}
      >
        {body()}
      </ScrollView>
      <MoreMenu
        open={menu.open}
        anchor={menu.anchor}
        onClose={menu.hide}
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
  const menu = useMoreMenu()
  const bottom = useBottomReserve()
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
    <View style={styles.fill}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: bottom }]}
        refreshControl={<RefreshControl tintColor={t.brass} refreshing={brief.isFetching && !!data} onRefresh={() => void brief.refetch()} />}
      >
        <View>
          <DayHead eyebrow={eyebrow} lead={headline[0]} emphasis={headline[1]} />
          <Animated.View entering={rise(1)} style={styles.dial}>
            <View style={styles.chips}>
              {DAY_CHIPS.map((c) => (
                <Chip key={c.key} label={pendingKey === c.key ? '…' : c.label} on={current === c.key && !look?.occasion} onPress={() => !busy && plan({ eventType: c.key })} />
              ))}
              <Chip label={pendingKey === 'rest' ? '…' : 'Home day'} on={rest} onPress={() => !busy && plan({ rest: true })} />
            </View>
            <View style={styles.occasionRow}>
              <View style={styles.fill}>
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
        </View>

        {brief.isPending && !data ? (
          <T role="micro" tone="faint">
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
          <Animated.View key={look.itemIds.join('-')} entering={fadeIn} style={styles.sections}>
            {looks.map((l, i) => (
              <View key={l.id} style={styles.laidOut}>
                <LookAct
                  look={l}
                  state={i === 0 ? 'current' : 'future'}
                  index={2 + i}
                  first={i === 0}
                  planning
                  headline={i === 0 ? null : undefined}
                  onRemove={i > 0 ? handleRemove : undefined}
                  removing={remove.isPending && remove.variables === l.id}
                  actions={
                    i === 0 ? (
                      <ActionRow top={space.lg}>
                        <Button label="See it on you" onPress={() => go(paths.mirror(look.itemIds))} />
                        <Button label="Another" variant="ghost" loading={busy && recompose.variables?.eventType === look.eventType} disabled={busy} onPress={() => plan({ eventType: look.eventType, occasion: look.occasion ?? undefined })} />
                        <View ref={menu.ref} collapsable={false} style={styles.right}>
                          <Button variant="icon" accessibilityLabel="More" tall icon={<MoreGlyph />} onPress={menu.show} />
                        </View>
                      </ActionRow>
                    ) : undefined
                  }
                />
                <VerdictNotes verdict={l.verdict ?? (i === 0 ? look.verdict : undefined)} style={styles.verdict} />
                {i === 0 && laidOut ? (
                  <T role="caption" tone="faint">
                    The morning push will say it was laid out tonight.
                  </T>
                ) : null}
              </View>
            ))}
            <AddLook date={date} isToday={false} index={2 + looks.length} />
            <Animated.View entering={rise(3 + looks.length)}>
              <Plaque label={longDay(date)} value={look.weather ? temp(look.weather.temperatureC) : undefined} note={look.weather?.description} style={styles.plaque}>
                {!look.weather ? (
                  <T role="bodySm" tone="muted">
                    Add your city in the fitting for the forecast.
                  </T>
                ) : null}
                <PieceList items={look.items} top />
              </Plaque>
            </Animated.View>
          </Animated.View>
        ) : null}
      </ScrollView>

      <MoreMenu
        open={menu.open}
        anchor={menu.anchor}
        onClose={menu.hide}
        items={[
          { label: 'Add a look', onPress: () => go(paths.addLook(date)) },
          { label: 'Make it a home day', onPress: () => plan({ rest: true }) },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Blocks 32 apart; the head carries its own 8 above.
  body: { paddingHorizontal: gutter, gap: space.xxl },
  sections: { gap: space.xxl },
  // Headline to the board: element to element.
  look: { gap: space.lg },
  // The chips, then the field: element to element.
  dial: { gap: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  occasionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.lg, rowGap: space.sm },
  laidOut: { gap: space.md },
  // The verdict sits a block (16) under the look; the row gap supplies 12.
  verdict: { marginTop: space.xs },
  plaque: { gap: space.md },
  pieceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  piece: { textTransform: 'capitalize', flex: 1 },
  right: { marginLeft: 'auto' },
})
