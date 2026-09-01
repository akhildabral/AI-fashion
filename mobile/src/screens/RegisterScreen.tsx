import { Alert } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../context/AuthContext'
import type { AuthStackParamList } from '../navigation/types'
import { colors } from '../theme'

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth()

  async function handleRegister(email: string, password: string) {
    const message = await register(email, password)
    if (message) {
      Alert.alert('Check your inbox', message, [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ])
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bone }}>
      <AuthForm
        mode="register"
        onSubmit={handleRegister}
        onSwitch={() => navigation.navigate('Login')}
      />
    </SafeAreaView>
  )
}
