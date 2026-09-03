import { Stack } from 'expo-router'
import { useTheme } from '@/src/design/theme'
import { FittingProvider } from '@/src/features/fitting/FittingProvider'

/**
 * The fitting: one sitting, no tab bar, no header. Every step draws its own
 * quiet Back; the edge swipe stays off so the taste deck owns the drag.
 */
export default function FittingLayout() {
  const { t } = useTheme()
  return (
    <FittingProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bone }, gestureEnabled: false }} />
    </FittingProvider>
  )
}
