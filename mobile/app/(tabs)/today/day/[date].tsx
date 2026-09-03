// Another day on the strip: look back at what was worn, or plan what's ahead.
import { Stack, useLocalSearchParams } from 'expo-router'
import { todayKey } from '@zauq/shared/brief'
import { EmptyState } from '@/src/components/Bits'
import { Screen } from '@/src/components/Screen'
import { shortDay } from '@/src/features/today/copy'
import { DayView } from '@/src/features/today/DayView'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export default function DayScreen() {
  const { date: raw, laidOut } = useLocalSearchParams<{ date: string; laidOut?: string }>()
  const date = typeof raw === 'string' && DAY_KEY.test(raw) ? raw : todayKey()
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, title: shortDay(date) }} />
      {DAY_KEY.test(String(raw)) ? <DayView date={date} laidOut={laidOut === '1'} /> : <EmptyState title="Not a day we know." line="Pick one on the strip." />}
    </Screen>
  )
}
