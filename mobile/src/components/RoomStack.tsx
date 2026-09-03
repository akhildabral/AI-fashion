import { Stack } from 'expo-router'
import { useTheme } from '@/src/design/theme'
import { fonts } from '@/src/design/type'

/**
 * The native stack inside each room. Room index screens draw their own
 * header (the Bodoni greeting); pushed screens get the platform header with
 * a Bodoni title and a brass, label-less back control.
 */
export function RoomStack() {
  const { t } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTintColor: t.brass,
        headerStyle: { backgroundColor: t.bone },
        headerTitleStyle: { fontFamily: fonts.serif, fontSize: 20, color: t.ink },
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.bone },
      }}
    />
  )
}
