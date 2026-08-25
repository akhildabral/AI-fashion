import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../context/AuthContext'
import type { AuthStackParamList } from '../navigation/types'
import { colors } from '../theme'

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bone }}>
      <AuthForm
        mode="login"
        onSubmit={login}
        onSwitch={() => navigation.navigate('Register')}
      />
    </SafeAreaView>
  )
}
