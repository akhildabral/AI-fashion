import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { AuthStack } from './AuthStack'
import { MainTabs } from './MainTabs'
import { ProfileScreen } from '../screens/ProfileScreen'
import { colors } from '../theme'

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator size="large" color={colors.clay} />
    </View>
  )
}

/**
 * Top-level routing:
 *  - auth still initializing → splash
 *  - logged out → auth stack (Login/Register)
 *  - logged in, profile still loading → splash
 *  - logged in, no profile yet → onboarding (the profile setup screen)
 *  - logged in, profile present → main tabs
 */
export function RootNavigator() {
  const { user, initializing } = useAuth()
  const { profile, loading: profileLoading } = useProfile()

  if (initializing) return <Splash />
  if (!user) return <AuthStack />
  if (profileLoading) return <Splash />
  if (!profile) return <ProfileScreen />
  return <MainTabs />
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bone,
  },
})
