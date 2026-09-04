// The Face ID lock. When the You room's setting is on, the rooms sit behind
// a bone screen on cold start and after a minute away, until the phone
// vouches for the member. No hardware, or nothing enrolled: the gate stays
// open (Settings does not offer the toggle either).
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery } from '@tanstack/react-query'
import * as LocalAuthentication from 'expo-local-authentication'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native'
import { ArchMark, Wordmark } from '@/src/components/Brand'
import { Button } from '@/src/components/Button'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { space } from '@/src/design/tokens'
import { LOCK_STORAGE_KEY, youKeys } from '@/src/features/you/keys'

/** Away for longer than this and the lock comes back. */
export const RELOCK_AFTER_MS = 60_000

interface LockGateProps {
  /** Only the rooms are locked; the door never is. */
  active: boolean
  children: ReactNode
}

export function LockGate({ active, children }: LockGateProps) {
  // Same key the Settings toggle writes, so a change there lands here at once.
  const flagQ = useQuery({
    queryKey: youKeys.lock,
    queryFn: async () => (await AsyncStorage.getItem(LOCK_STORAGE_KEY)) === '1',
    staleTime: Infinity,
  })
  const [capable, setCapable] = useState<boolean | null>(null)
  const [locked, setLocked] = useState(true)
  const [prompting, setPrompting] = useState(false)
  const awayAt = useRef<number | null>(null)
  const asked = useRef(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hardware, enrolled]) => {
        if (!cancelled) setCapable(hardware && enrolled)
      })
      .catch(() => {
        if (!cancelled) setCapable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const enabled = active && capable === true && flagQ.data === true

  // Back from the background after a while: lock again.
  useEffect(() => {
    if (!enabled) return
    const onChange = (state: AppStateStatus) => {
      if (state === 'background') {
        awayAt.current = Date.now()
      } else if (state === 'active') {
        const away = awayAt.current
        awayAt.current = null
        if (away !== null && Date.now() - away > RELOCK_AFTER_MS) {
          asked.current = false
          setLocked(true)
        }
      }
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [enabled])

  const unlock = useCallback(async () => {
    if (prompting) return
    setPrompting(true)
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock ZAUQ',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Not now',
        disableDeviceFallback: false,
      })
      if (result.success) {
        haptics.success()
        setLocked(false)
      } else if (result.error === 'not_available' || result.error === 'not_enrolled') {
        // The phone can no longer vouch: the gate cannot hold.
        setCapable(false)
        setLocked(false)
      }
    } catch {
      setCapable(false)
      setLocked(false)
    } finally {
      setPrompting(false)
    }
  }, [prompting])

  // Ask once per lock without waiting for the tap; the button is the retry.
  useEffect(() => {
    if (!enabled || !locked || asked.current) return
    asked.current = true
    void unlock()
  }, [enabled, locked, unlock])

  // Cover while the flag is still being read so a locked app never shows a
  // frame of the rooms; the splash is still up at that point anyway.
  const settling = flagQ.isPending || capable === null
  const covered = active && (settling || (enabled && locked))

  return (
    <View style={styles.root}>
      {children}
      {covered ? (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal testID="lock-gate">
          <Screen edges={['top', 'bottom']} padded>
            <View style={styles.body}>
              <ArchMark size={56} variant="script" />
              {/* A 26 cap height keeps the 3.5:1 wordmark above its 88px floor. */}
              <Wordmark size={26} />
              {enabled ? (
                <>
                  <T role="body" tone="muted" align="center" style={styles.line}>
                    Locked. The rooms open with Face ID or your passcode.
                  </T>
                  <Button label="Unlock" loading={prompting} onPress={() => void unlock()} testID="lock-unlock" />
                </>
              ) : null}
            </View>
          </Screen>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  line: { maxWidth: 280, marginTop: space.sm },
})
