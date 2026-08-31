import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import {
  DEFAULT_REMINDERS,
  disableReminder,
  enableReminder,
  getReminderPrefs,
  type ReminderSlot,
} from '../lib/reminder'
import { colors, spacing } from '../theme'
import { Card, ErrorText, Heading, Label, Select, Subtle } from './ui'

function slots(from: number, to: number): string[] {
  const out: string[] = []
  for (let h = from; h <= to; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`)
  }
  return out
}

const TIMES: Record<ReminderSlot, string[]> = {
  morning: slots(5, 11),
  evening: slots(18, 23),
}

function toTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * One daily-reminder row: toggle + time picker, backed by a locally
 * scheduled notification.
 */
function ReminderRow({
  slot,
  title,
  subtitle,
  onError,
}: {
  slot: ReminderSlot
  title: string
  subtitle: string
  onError: (msg: string | null) => void
}) {
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState(
    toTime(DEFAULT_REMINDERS[slot].hour, DEFAULT_REMINDERS[slot].minute),
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getReminderPrefs(slot).then((prefs) => {
      setEnabled(prefs.enabled)
      setTime(toTime(prefs.hour, prefs.minute))
    })
  }, [slot])

  async function apply(nextEnabled: boolean, nextTime: string) {
    if (busy) return
    setBusy(true)
    onError(null)
    const [hour, minute] = nextTime.split(':').map(Number)
    try {
      if (nextEnabled) {
        const ok = await enableReminder(slot, hour, minute)
        if (!ok) {
          onError('Notifications are blocked — allow them in system Settings first.')
          setEnabled(false)
          return
        }
        setEnabled(true)
        setTime(nextTime)
      } else {
        await disableReminder(slot)
        setEnabled(false)
      }
    } catch {
      onError('Could not update the reminder. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.row}>
      <View style={styles.headRow}>
        <View style={{ flex: 1, paddingRight: spacing.md }}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Subtle style={{ marginTop: 2, fontSize: 12 }}>{subtitle}</Subtle>
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => void apply(v, time)}
          disabled={busy}
          trackColor={{ true: colors.sage }}
        />
      </View>
      {enabled && (
        <View style={{ marginTop: spacing.md }}>
          <Label>Remind me at</Label>
          <Select
            value={time}
            options={TIMES[slot]}
            onChange={(v) => {
              if (v) void apply(true, v)
            }}
            allowEmpty={false}
          />
        </View>
      )}
    </View>
  )
}

/** The daily ritual's reminders: morning look + evening wear log. */
export function MorningReminder() {
  const [error, setError] = useState<string | null>(null)

  return (
    <Card>
      <Heading size={22}>Daily reminders</Heading>
      <Subtle style={{ marginTop: 4 }}>
        Two gentle nudges — never more, both optional.
      </Subtle>

      <ReminderRow
        slot="morning"
        title="Morning look ☀️"
        subtitle="What to wear — weather checked, closet ready."
        onError={setError}
      />
      <ReminderRow
        slot="evening"
        title="Evening log ✓"
        subtitle="What did you wear today? Keeps your stylist learning."
        onError={setError}
      />

      {error && (
        <View style={{ marginTop: spacing.md }}>
          <ErrorText>{error}</ErrorText>
        </View>
      )}

      <Text style={styles.note}>
        Delivered on this device. Keep the app installed in Expo Go for them to fire.
      </Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.inkLine,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    fontSize: 15,
    color: colors.ink,
  },
  note: {
    marginTop: spacing.lg,
    fontSize: 11,
    color: colors.inkFaint,
  },
})
