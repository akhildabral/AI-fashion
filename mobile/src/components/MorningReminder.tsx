import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import {
  DEFAULT_REMINDER,
  disableReminder,
  enableReminder,
  getReminderPrefs,
} from '../lib/reminder'
import { colors, spacing } from '../theme'
import { Card, ErrorText, Heading, Label, Select, Subtle } from './ui'

// Half-hour slots across normal getting-ready hours.
const TIMES: string[] = []
for (let h = 5; h <= 11; h++) {
  TIMES.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`)
}

function toTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * The morning ritual's hook: a daily local notification at the user's chosen
 * time. Local (not remote push) so it works in Expo Go; tapping it opens the
 * app for the day's weather-aware suggestion.
 */
export function MorningReminder() {
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState(toTime(DEFAULT_REMINDER.hour, DEFAULT_REMINDER.minute))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getReminderPrefs().then((prefs) => {
      setEnabled(prefs.enabled)
      setTime(toTime(prefs.hour, prefs.minute))
    })
  }, [])

  async function apply(nextEnabled: boolean, nextTime: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    const [hour, minute] = nextTime.split(':').map(Number)
    try {
      if (nextEnabled) {
        const ok = await enableReminder(hour, minute)
        if (!ok) {
          setError('Notifications are blocked — allow them in system Settings first.')
          setEnabled(false)
          return
        }
        setEnabled(true)
        setTime(nextTime)
      } else {
        await disableReminder()
        setEnabled(false)
      }
    } catch {
      setError('Could not update the reminder. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <View style={styles.headRow}>
        <View style={{ flex: 1, paddingRight: spacing.md }}>
          <Heading size={22}>Morning look</Heading>
          <Subtle style={{ marginTop: 4 }}>
            A daily nudge to check what to wear — weather checked, closet ready.
          </Subtle>
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => void apply(v, time)}
          disabled={busy}
          trackColor={{ true: colors.sage }}
        />
      </View>

      {enabled && (
        <View style={{ marginTop: spacing.lg }}>
          <Label>Remind me at</Label>
          <Select
            value={time}
            options={TIMES}
            onChange={(v) => {
              if (v) void apply(true, v)
            }}
            allowEmpty={false}
          />
        </View>
      )}

      {error && (
        <View style={{ marginTop: spacing.md }}>
          <ErrorText>{error}</ErrorText>
        </View>
      )}

      <Text style={styles.note}>
        Delivered on this device. Keep the app installed in Expo Go for it to fire.
      </Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  note: {
    marginTop: spacing.md,
    fontSize: 11,
    color: colors.inkFaint,
  },
})
