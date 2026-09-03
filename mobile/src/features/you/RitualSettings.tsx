// The morning ritual and the nudges: one switch and an hour for this device,
// the evening layout, and the event pushes. Talks to the server through
// `push.ts`; reads its state from the `push` query.
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Plaque } from '@/src/components/Bits'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { space } from '@/src/design/tokens'
import { qk, queryClient } from '@/src/lib/query'
import { TextLink, ToggleRow, Wrap } from './Furniture'
import { disableRitual, enableRitual, getPushStatus, hourLabel, pushAvailable, RITUAL_HOURS, sendTestPush, subscribedHere, updatePushSettings, type PushStatus } from './push'

const FALLBACK: PushStatus = { devices: 0, hour: 7, timezone: null, eveningPush: false, events: { circle: true, renders: true }, subscriptions: [] }

export function RitualSettings() {
  const flash = useFlash()
  const available = pushAvailable()
  const { data, isPending, isError } = useQuery({ queryKey: qk.push, queryFn: getPushStatus })
  const status = data ?? (isError ? FALLBACK : null)
  const [onHere, setOnHere] = useState(false)
  const [hour, setHour] = useState(7)
  const [evening, setEvening] = useState(false)
  const [events, setEvents] = useState({ circle: true, renders: true })

  useEffect(() => {
    if (!status) return
    setHour(status.hour || 7)
    setEvening(Boolean(status.eveningPush))
    setEvents({ circle: status.events?.circle ?? true, renders: status.events?.renders ?? true })
    let live = true
    subscribedHere(status).then((v) => live && setOnHere(v))
    return () => {
      live = false
    }
  }, [status])

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.push })

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) await enableRitual(hour)
      else await disableRitual()
      return next
    },
    onSuccess: (next) => {
      setOnHere(next)
      haptics.success()
      flash(next ? `Set. Your look will be waiting at ${hourLabel(hour)}.` : 'The ritual is off on this device.')
      void refresh()
    },
    onError: (err) => {
      haptics.failure()
      flash(err instanceof Error ? err.message : 'Could not change that.')
    },
  })

  const settings = useMutation({
    mutationFn: updatePushSettings,
    onSuccess: () => void refresh(),
  })

  function turnOn() {
    // Pre-permission copy first; the OS prompt follows only after a yes.
    Alert.alert('Laid out every morning?', `ZAUQ will ask to send notifications: one a day at ${hourLabel(hour)}, with the look already composed.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Allow', onPress: () => toggle.mutate(true) },
    ])
  }

  function changeHour(h: number) {
    setHour(h)
    if (!status || status.devices === 0) return
    settings.mutate({ hour: h }, { onSuccess: () => flash(`Moved to ${hourLabel(h)}.`), onError: () => flash('Could not change the hour.') })
  }

  function toggleEvening(next: boolean) {
    setEvening(next)
    settings.mutate(
      { eveningPush: next },
      {
        onSuccess: () => flash(next ? 'Tomorrow will be laid out at 8pm, and you will hear about it.' : 'The evening nudge is off; tomorrow is still laid out quietly.'),
        onError: () => {
          setEvents((e) => e)
          setEvening(!next)
          flash('Could not change that.')
        },
      },
    )
  }

  function toggleEvent(kind: 'circle' | 'renders', next: boolean) {
    setEvents((e) => ({ ...e, [kind]: next }))
    settings.mutate(
      { events: { [kind]: next } },
      {
        onError: () => {
          setEvents((e) => ({ ...e, [kind]: !next }))
          flash('Could not change that.')
        },
      },
    )
  }

  function test() {
    sendTestPush()
      .then((r) => flash(r.sent ? 'Sent. Check your notifications.' : 'The test did not go through.'))
      .catch(() => flash('The test did not go through.'))
  }

  if (isPending && !status) {
    return (
      <Plaque>
        <SkeletonBlock width={140} height={12} />
        <SkeletonBlock height={28} style={{ marginTop: 10 }} />
        <SkeletonBlock width="80%" style={{ marginTop: 10 }} />
      </Plaque>
    )
  }
  const s = status ?? FALLBACK
  const canAct = available && !toggle.isPending
  const line = !available
    ? 'Push arrives with the store build.'
    : onHere
      ? `On for this device at ${hourLabel(hour)}${s.timezone ? ` (${s.timezone.replace(/_/g, ' ')})` : ''}.`
      : s.devices > 0
        ? `On for ${s.devices} other device${s.devices === 1 ? '' : 's'}. Turn it on here too?`
        : 'One nudge a day, at your hour, with the outfit already composed.'

  return (
    <View style={styles.wrap}>
      <Plaque>
        <T role="micro" tone="faint">
          The morning ritual
        </T>
        <T role="h2" style={{ marginTop: 4 }}>
          Your look, waiting when you wake.
        </T>
        <T role="bodySm" tone="muted" style={{ marginTop: 6 }}>
          {line}
        </T>
        <ToggleRow label="On this device" value={onHere} disabled={!canAct} onChange={(next) => (next ? turnOn() : toggle.mutate(false))} />
        <T role="label" tone="faint" style={{ marginTop: space.sm, marginBottom: space.sm }}>
          At
        </T>
        <Wrap>
          {RITUAL_HOURS.map((h) => (
            <Chip key={h} label={hourLabel(h)} on={hour === h} onPress={() => available && changeHour(h)} />
          ))}
        </Wrap>
        {onHere ? (
          <View style={{ marginTop: space.md }}>
            <TextLink label="Send a test to this device" onPress={test} />
          </View>
        ) : null}
      </Plaque>

      <Plaque>
        <T role="micro" tone="faint">
          The evening
        </T>
        <ToggleRow first label="Nudge me when tomorrow is laid out" line="Tomorrow is laid out at 8pm either way." value={evening} disabled={!available || s.devices === 0} onChange={toggleEvening} />
      </Plaque>

      <Plaque>
        <T role="micro" tone="faint">
          Also tell me when
        </T>
        <ToggleRow first label="The circle reacts" line="Reactions, comments, picks and verdicts." value={events.circle} disabled={!available || s.devices === 0} onChange={(v) => toggleEvent('circle', v)} />
        <ToggleRow label="A reflection is ready" line="A render finished while you were away." value={events.renders} disabled={!available || s.devices === 0} onChange={(v) => toggleEvent('renders', v)} />
      </Plaque>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
})
