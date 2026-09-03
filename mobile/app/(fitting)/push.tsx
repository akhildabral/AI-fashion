import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button } from '@/src/components/Button'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useAuth } from '@/src/context/AuthProvider'
import { useProfile } from '@/src/context/ProfileProvider'
import * as haptics from '@/src/design/haptics'
import { space } from '@/src/design/tokens'
import { finishFitting, setRitual } from '@/src/features/fitting/finish'
import { useFitting } from '@/src/features/fitting/FittingProvider'
import { Frame } from '@/src/features/fitting/Frame'
import { HOURS } from '@/src/features/fitting/steps'

/**
 * Step 6, the ritual: the one pre-permission ask, after the reveal. Either
 * answer ends the fitting: the profile is written once, here, and the root
 * layout swaps to the rooms the moment it lands.
 */
export default function Push() {
  const { user, setUser } = useAuth()
  const { setProfile } = useProfile()
  const { draft, patch, reset } = useFitting()
  const [hour, setHour] = useState(draft.hour)
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const finish = async (ritual: boolean) => {
    setError(null)
    setNote(null)
    setBusy(ritual ? 'yes' : 'no')
    try {
      if (ritual) {
        const outcome = await setRitual(hour).catch(() => 'unavailable' as const)
        if (outcome === 'denied') setNote('Notifications are off for ZAUQ. You can turn the ritual on later from You.')
      }
      const { profile, user: renamed } = await finishFitting({ ...draft, hour }, user)
      if (renamed) setUser(renamed)
      reset()
      setProfile(profile)
    } catch (err) {
      haptics.failure()
      setError(err instanceof Error ? err.message : 'The stylist is out for a moment.')
      setBusy(null)
    }
  }

  return (
    <Frame
      step="push"
      who="The ritual"
      ask={
        <>
          Laid out every morning <T role="h1" tone="brass" italic>at {hour}?</T>
        </>
      }
      lead="The look waits for you before you are up: composed from your closet, checked against the weather."
      actions={
        <>
          {error ? (
            <T role="bodySm" tone="danger" align="center" accessibilityLiveRegion="polite">
              {error}
            </T>
          ) : note ? (
            <T role="bodySm" tone="muted" align="center" accessibilityLiveRegion="polite">
              {note}
            </T>
          ) : null}
          <Button label={error ? 'Try again' : 'Yes, every morning'} block loading={busy === 'yes'} disabled={busy !== null} onPress={() => void finish(true)} />
          <Button label="Not now" variant="quiet" size="sm" style={styles.center} loading={busy === 'no'} disabled={busy !== null} onPress={() => void finish(false)} />
        </>
      }
    >
      <View style={styles.group}>
        <T role="label" tone="faint">
          Which hour
        </T>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {HOURS.map((h) => (
            <Chip
              key={h}
              label={`${h}:00`}
              on={hour === h}
              onPress={() => {
                setHour(h)
                patch({ hour: h })
              }}
            />
          ))}
        </View>
      </View>
    </Frame>
  )
}

const styles = StyleSheet.create({
  group: { gap: space.md },
  chips: { flexDirection: 'row', gap: space.sm },
  center: { alignSelf: 'center' },
})
