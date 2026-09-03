import { Stack } from 'expo-router'
import { useTheme } from '@/src/design/theme'

/**
 * Every secondary flow lives here and presents as the platform's form sheet
 * (see the root layout). Inside the sheet, a plain stack with no header:
 * each sheet draws its own title.
 */
export default function SheetsLayout() {
  const { t } = useTheme()
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.surface } }} />
}
