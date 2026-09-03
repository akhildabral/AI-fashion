// The fitting, deferred: what the profile still lacks, counted so the You
// room can show "3 of 7" and point at the section that fills each one.
import { useQuery } from '@tanstack/react-query'
import { getPhoto } from '@zauq/shared/tryon'
import { useAuth } from '@/src/context/AuthProvider'
import { useProfile } from '@/src/context/ProfileProvider'
import { qk } from '@/src/lib/query'

export type FittingSection = 'fit' | 'taste' | 'practical' | 'account' | 'mirror'

export interface FittingStep {
  key: string
  label: string
  done: boolean
  section: FittingSection
}

export function useFittingProgress(): { steps: FittingStep[]; done: number; total: number; complete: boolean } {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { data: photo } = useQuery({ queryKey: qk.reflections, queryFn: getPhoto, staleTime: 5 * 60 * 1000 })

  const sizes = profile?.sizes ?? {}
  const steps: FittingStep[] = [
    { key: 'sizes', label: 'Your sizes', done: Boolean(sizes.top || sizes.bottom || sizes.shoe), section: 'fit' },
    { key: 'tone', label: 'Your tone', done: Boolean(profile?.skinTone), section: 'taste' },
    { key: 'budget', label: 'How you shop', done: Boolean(profile?.budgetBand), section: 'taste' },
    { key: 'avoid', label: 'Colours never on you', done: (profile?.avoidColors?.length ?? 0) > 0, section: 'taste' },
    { key: 'city', label: 'Your home city', done: Boolean(profile?.city?.trim()), section: 'practical' },
    { key: 'handle', label: 'Your address on the circle', done: Boolean(user?.handle), section: 'account' },
    { key: 'reflection', label: 'Your reflection', done: Boolean(photo?.photoUrl), section: 'mirror' },
  ]
  const done = steps.filter((s) => s.done).length
  return { steps, done, total: steps.length, complete: done === steps.length }
}
