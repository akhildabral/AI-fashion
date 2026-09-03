// I wore something else: a photo of the day, read into pieces, logged as the
// truth. Takes a `date` so the journal can log any day through it.
//
// Params: date (YYYY-MM-DD, defaults to today), eventType, alreadyLogged=1
// when the day has a wear log already, hasSuggestion=1 when the stylist had
// laid something out.
import { useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { todayKey } from '@zauq/shared/brief'
import type { EventType } from '@zauq/shared/types'
import { useFlash } from '@/src/components/Toast'
import * as haptics from '@/src/design/haptics'
import { useInvalidateDay } from '@/src/features/today/useToday'
import { WorePhoto } from '@/src/features/today/WorePhoto'
import { qk } from '@/src/lib/query'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const EVENT_TYPES: EventType[] = ['work', 'casual', 'evening', 'occasion', 'athletic']

export default function WoreElseSheet() {
  const params = useLocalSearchParams<{ date?: string; eventType?: string; alreadyLogged?: string; hasSuggestion?: string }>()
  const date = typeof params.date === 'string' && DAY_KEY.test(params.date) ? params.date : todayKey()
  const eventType = EVENT_TYPES.find((e) => e === params.eventType)
  const flash = useFlash()
  const qc = useQueryClient()
  const invalidate = useInvalidateDay()

  return (
    <WorePhoto
      date={date}
      eventType={eventType}
      alreadyLogged={params.alreadyLogged === '1'}
      hasSuggestion={params.hasSuggestion === '1'}
      onLogged={(r) => {
        haptics.success()
        void invalidate(date)
        if (r.added.length > 0) void qc.invalidateQueries({ queryKey: qk.wardrobe })
        router.back()
        flash(r.added.length ? `Logged. ${r.added.length} new ${r.added.length === 1 ? 'piece is' : 'pieces are'} joining the closet.` : 'Logged what you wore.')
      }}
    />
  )
}
