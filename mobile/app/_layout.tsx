// The app shell: fonts, theme, the query cache, the session, and the three
// doors (signed out, unfitted, the rooms). The splash stays up until the
// stored session has been checked so there is never a flash of the wrong door.
import '@/src/lib/api'
import * as Sentry from '@sentry/react-native'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { LogBox } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { TAB_BAR_HEIGHT } from '@/src/components/Room'
import { ToastProvider } from '@/src/components/Toast'
import { AuthProvider, useAuth } from '@/src/context/AuthProvider'
import { JobsProvider } from '@/src/context/JobsProvider'
import { ProfileProvider, useProfile } from '@/src/context/ProfileProvider'
import { JobTray } from '@/src/features/jobs/JobTray'
import { LockGate } from '@/src/features/lock/LockGate'
import { readSavedThemeMode, ThemeProvider, useTheme, type ThemeMode } from '@/src/design/theme'
import { fontAssets } from '@/src/design/type'
import { fittingComplete } from '@/src/lib/fitting'
import { usePendingLink } from '@/src/lib/pendingLink'
import { configureNotifications, usePushRouting } from '@/src/lib/push-routing'
import { persistOptions, queryClient } from '@/src/lib/query'

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn && !__DEV__,
  sendDefaultPii: false,
  tracesSampleRate: 0.2,
})

configureNotifications()

// A development build compiled without code signing has no keychain
// entitlement, so expo-notifications logs this on every launch. Signed builds
// never hit it; keep the simulator quiet.
if (__DEV__) LogBox.ignoreLogs(['[expo-notifications] Error reading persisted'])

SplashScreen.preventAutoHideAsync().catch(() => undefined)
SplashScreen.setOptions({ fade: true, duration: 350 })

export const unstable_settings = {
  anchor: '(tabs)',
}

function Shell() {
  const { t } = useTheme()
  const { user, initializing } = useAuth()
  const { profile, loading } = useProfile()

  const settled = !initializing && (!user || !loading)
  useEffect(() => {
    if (settled) SplashScreen.hideAsync().catch(() => undefined)
  }, [settled])

  const signedIn = !!user
  const fitted = signedIn && fittingComplete(profile)

  // Links and push taps that arrive while the rooms are closed wait here
  // and open once the member is through the door and fitted.
  usePendingLink(fitted)
  usePushRouting(fitted)

  return (
    <ToastProvider bottomOffset={fitted ? TAB_BAR_HEIGHT : 0}>
      <StatusBar style={t.statusBar} />
      <LockGate active={signedIn}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bone } }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(door)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !fitted}>
            <Stack.Screen name="(fitting)" />
          </Stack.Protected>
          <Stack.Protected guard={fitted}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="u/[handle]" options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="reveal/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen
              name="sheets"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.62, 1],
                sheetGrabberVisible: true,
                sheetCornerRadius: 3,
                contentStyle: { backgroundColor: t.surface },
              }}
            />
          </Stack.Protected>
          {/* The web links the app claims (universal / app links). Outside every
              guard so they resolve in any state: door links open the door, room
              links open the room or wait as a pending link (LinkRedirect). */}
          <Stack.Screen name="join/[code]" options={{ animation: 'none' }} />
          <Stack.Screen name="invite" options={{ animation: 'none' }} />
          <Stack.Screen name="reset" options={{ animation: 'none' }} />
          <Stack.Screen name="verify-email" options={{ animation: 'none' }} />
          <Stack.Screen name="look/[id]" options={{ animation: 'none' }} />
          <Stack.Screen name="vote/[id]" options={{ animation: 'none' }} />
          <Stack.Screen name="trips/[id]" options={{ animation: 'none' }} />
          <Stack.Screen name="closet/piece/[id]" options={{ animation: 'none' }} />
          <Stack.Screen name="mirror" options={{ animation: 'none' }} />
        </Stack>
        {fitted ? <JobTray /> : null}
      </LockGate>
    </ToastProvider>
  )
}

function Root() {
  const [fontsLoaded] = useFonts(fontAssets)
  const [mode, setMode] = useState<ThemeMode | null>(null)
  useEffect(() => {
    readSavedThemeMode().then(setMode)
  }, [])

  if (!fontsLoaded || !mode) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider initialMode={mode}>
          <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <AuthProvider>
              <ProfileProvider>
                <JobsProvider>
                  <Shell />
                </JobsProvider>
              </ProfileProvider>
            </AuthProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(Root)
