// Settings: how the app looks and measures, the lock, the nudges, the legal
// pages in the in-app browser, and the version. A `card p-5` of choices,
// then lists of 44px rows, the cards 20 apart.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery } from '@tanstack/react-query'
import * as LocalAuthentication from 'expo-local-authentication'
import { Stack, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { CURRENCIES, guessCurrency } from '@zauq/shared/money'
import { setCurrentUnits } from '@zauq/shared/units'
import { Screen } from '@/src/components/Screen'
import { Chip } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useTheme, type ThemeMode } from '@/src/design/theme'
import { gutter, space } from '@/src/design/tokens'
import { APP_VERSION, WEB_ORIGIN } from '@/src/lib/config'
import { queryClient } from '@/src/lib/query'
import { Card, NavRow, RowLabel, ToggleRow, Wrap } from '@/src/features/you/Furniture'
import { LOCK_STORAGE_KEY, youKeys } from '@/src/features/you/keys'
import { routes } from '@/src/features/you/nav'
import { useProfileSave } from '@/src/features/you/useProfileSave'

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
]

export default function Settings() {
  const router = useRouter()
  const flash = useFlash()
  const { t, mode, setMode } = useTheme()
  const { profile, save } = useProfileSave()
  const units = profile?.units ?? 'metric'
  const currency = CURRENCIES.find((c) => c.code === profile?.currency)
  const [biometric, setBiometric] = useState(false)
  const lockQ = useQuery({ queryKey: youKeys.lock, queryFn: async () => (await AsyncStorage.getItem(LOCK_STORAGE_KEY)) === '1', staleTime: Infinity })

  useEffect(() => {
    LocalAuthentication.hasHardwareAsync()
      .then(setBiometric)
      .catch(() => setBiometric(false))
  }, [])

  async function setLock(next: boolean) {
    queryClient.setQueryData(youKeys.lock, next)
    try {
      await AsyncStorage.setItem(LOCK_STORAGE_KEY, next ? '1' : '0')
      flash(next ? 'ZAUQ will ask for Face ID when it opens.' : 'The lock is off.')
    } catch {
      queryClient.setQueryData(youKeys.lock, !next)
      flash('Could not change that.')
    }
  }

  function open(path: string) {
    WebBrowser.openBrowserAsync(`${WEB_ORIGIN}${path}`, { toolbarColor: t.bone, controlsColor: t.brass }).catch(() => flash('Could not open that page.'))
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Settings' }} />
      <Screen>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Card padding="form">
            <RowLabel first>Appearance</RowLabel>
            <Wrap style={styles.mt3}>
              {MODES.map((m) => (
                <Chip key={m.key} label={m.label} on={mode === m.key} onPress={() => setMode(m.key)} />
              ))}
            </Wrap>
            <RowLabel>Units</RowLabel>
            <Wrap style={styles.mt3}>
              <Chip
                label="°C · cm"
                on={units === 'metric'}
                onPress={() => {
                  setCurrentUnits('metric')
                  save({ units: 'metric' })
                }}
              />
              <Chip
                label="°F · ft"
                on={units === 'imperial'}
                onPress={() => {
                  setCurrentUnits('imperial')
                  save({ units: 'imperial' })
                }}
              />
            </Wrap>
          </Card>

          <Card>
            <NavRow first label="Currency" value={currency ? currency.code : `Guess from my location (${guessCurrency()})`} onPress={() => router.push(routes.picker('currency'))} />
            {biometric ? <ToggleRow label="Lock with Face ID" line="Ask for Face ID or Touch ID when ZAUQ opens." value={lockQ.data ?? false} onChange={(v) => void setLock(v)} /> : null}
            <NavRow label="Notifications" value="The morning ritual" onPress={() => router.push(routes.notifications)} />
          </Card>

          <Card>
            <NavRow first label="Privacy" onPress={() => open('/privacy')} />
            <NavRow label="Terms" onPress={() => open('/terms')} />
            <NavRow label="Version" value={APP_VERSION} />
          </Card>

          <T role="caption" tone="faint" align="center">
            The Atelier, on your phone.
          </T>
        </ScrollView>
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxl, gap: 20 },
  mt3: { marginTop: space.md },
})
