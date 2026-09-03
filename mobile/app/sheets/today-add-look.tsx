// Add a look: another outfit for later in the day (a preset time of day, or
// a ritual with its own name and hour), and beneath it the dial for the day
// itself: not that kind of day, or dress me for something in particular.
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { todayKey, type LookSlotKind } from '@zauq/shared/brief'
import { Hairline } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { fadeIn } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { DAY_CHIPS, longDay, normalizeTime } from '@/src/features/today/copy'
import { SheetShell } from '@/src/features/today/SheetShell'
import { useAddLook, useBrief, useRecompose } from '@/src/features/today/useToday'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const PRESETS: { slot: LookSlotKind; label: string }[] = [
  { slot: 'morning', label: 'Morning' },
  { slot: 'afternoon', label: 'Afternoon' },
  { slot: 'evening', label: 'Evening' },
  { slot: 'custom', label: 'Custom' },
]

export default function AddLookSheet() {
  const params = useLocalSearchParams<{ date?: string }>()
  const date = typeof params.date === 'string' && DAY_KEY.test(params.date) ? params.date : todayKey()
  const isToday = date === todayKey()
  const flash = useFlash()
  const brief = useBrief(date, { peek: !isToday })
  const add = useAddLook(date)
  const recompose = useRecompose(date)

  const [slot, setSlot] = useState<LookSlotKind>(new Date().getHours() < 12 ? 'afternoon' : 'evening')
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('')
  const [occasion, setOccasion] = useState('')
  const [dayOccasion, setDayOccasion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const busy = add.isPending || recompose.isPending
  const current = brief.data?.brief

  function submit() {
    setError(null)
    const t = time.trim() ? normalizeTime(time) : null
    if (time.trim() && !t) {
      setError('A time like 19:30.')
      return
    }
    add.mutate(
      {
        slot,
        ...(slot === 'custom' && label.trim() ? { label: label.trim() } : {}),
        ...(t ? { time: t } : {}),
        ...(occasion.trim() ? { occasion: occasion.trim() } : {}),
      },
      {
        onSuccess: () => {
          haptics.success()
          router.back()
          flash('Another look, laid out.')
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Could not add a look.'),
      },
    )
  }

  function redress(body: { eventType?: string; occasion?: string }, done: string) {
    setError(null)
    recompose.mutate(body, {
      onSuccess: () => {
        haptics.success()
        router.back()
        flash(done)
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Could not compose that.'),
    })
  }

  const dayName = isToday ? 'Today' : longDay(date)

  return (
    <SheetShell
      title="Add a look"
      lead={`Another outfit for ${isToday ? 'later today' : longDay(date)}: an event, a change, or a ritual of its own.`}
      footer={<Button label="Lay it out" block loading={add.isPending} disabled={busy} onPress={submit} />}
    >
      <View style={{ gap: space.md }}>
        <T role="label" tone="faint">
          When
        </T>
        <View style={styles.chips}>
          {PRESETS.map((p) => (
            <Chip key={p.slot} label={p.label} on={slot === p.slot} onPress={() => setSlot(p.slot)} />
          ))}
        </View>
        {slot === 'custom' ? (
          <Animated.View entering={fadeIn} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Name" value={label} onChangeText={setLabel} placeholder="Ceremony" autoCapitalize="sentences" returnKeyType="next" />
            </View>
            <View style={{ width: 120 }}>
              <Field label="Time" value={time} onChangeText={setTime} placeholder="19:30" keyboardType="numbers-and-punctuation" returnKeyType="done" />
            </View>
          </Animated.View>
        ) : (
          <View style={{ width: 140 }}>
            <Field label="Time (optional)" value={time} onChangeText={setTime} placeholder="19:30" keyboardType="numbers-and-punctuation" returnKeyType="done" />
          </View>
        )}
        <Field label="Dress me for…" value={occasion} onChangeText={setOccasion} placeholder="a client lunch, a first date, a long flight" autoCapitalize="sentences" returnKeyType="go" onSubmitEditing={submit} />
        {error ? (
          <T role="bodySm" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
      </View>

      <Hairline />

      <View style={{ gap: space.md }}>
        <T role="h3" accessibilityRole="header">
          Not that kind of day?
        </T>
        <T role="bodySm" tone="muted">
          {dayName}
          {current ? `’s look is composed for ${current.occasion ? current.occasion.toLowerCase() : `a ${DAY_CHIPS.find((c) => c.key === current.eventType)?.label.toLowerCase() ?? current.eventType} day`}. ` : '. '}
          Pick another kind and the main look is composed again.
        </T>
        <View style={styles.chips}>
          {DAY_CHIPS.map((c) => (
            <Chip
              key={c.key}
              label={recompose.isPending && recompose.variables?.eventType === c.key ? '…' : c.label}
              on={!!current && current.eventType === c.key && !current.occasion}
              onPress={() => !busy && redress({ eventType: c.key }, `${dayName} is a ${c.label.toLowerCase()} day now.`)}
            />
          ))}
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field
              compact
              value={dayOccasion}
              onChangeText={setDayOccasion}
              placeholder="Or name the day: a wedding, a first day"
              autoCapitalize="sentences"
              returnKeyType="go"
              onSubmitEditing={() => dayOccasion.trim() && redress({ occasion: dayOccasion.trim() }, `Composed for ${dayOccasion.trim().toLowerCase()}.`)}
              accessibilityLabel="Name the day"
            />
          </View>
          <Button
            label="Compose"
            variant="ghost"
            size="sm"
            disabled={busy || !dayOccasion.trim()}
            loading={recompose.isPending && !!recompose.variables?.occasion}
            onPress={() => redress({ occasion: dayOccasion.trim() }, `Composed for ${dayOccasion.trim().toLowerCase()}.`)}
          />
        </View>
      </View>
    </SheetShell>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
})
