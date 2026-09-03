import { Stack } from 'expo-router'
import { useTheme } from '@/src/design/theme'

export const unstable_settings = {
  initialRouteName: 'sign-in',
}

/** The unauthenticated stack: sign in, invites, resets. */
export default function DoorLayout() {
  const { t } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.bone },
      }}
    />
  )
}
