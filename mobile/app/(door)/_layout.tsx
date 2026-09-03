import { Stack } from 'expo-router'
import { useTheme } from '@/src/design/theme'

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
