import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/context/AuthContext'
import { ProfileProvider } from './src/context/ProfileContext'
import { RootNavigator } from './src/navigation/RootNavigator'
import { colors } from './src/theme'

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bone,
    card: colors.white,
    text: colors.ink,
    primary: colors.clay,
    border: colors.inkLine,
  },
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ProfileProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </ProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
