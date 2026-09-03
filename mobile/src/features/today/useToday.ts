// The room's data: the day's brief, the ritual stats, the nudges, and the
// mutations that change a day. Every change lands in the cache at once and
// invalidates what it touched (the strip, the stats, the journal).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  composeLook,
  getBrief,
  getFeed,
  getRitualStats,
  getTrips,
  planDay,
  removeLook,
  todayKey,
  undoBrief,
  wearBrief,
  type BriefResponse,
  type LookSlot,
  type LookSlotKind,
} from '@zauq/shared/brief'
import { getWardrobe } from '@zauq/shared/wardrobe'
import * as haptics from '@/src/design/haptics'
import { qk } from '@/src/lib/query'
import { dayKeys, tk } from './keys'

/** The id of a look synthesised from a brief that carries no timeline. */
export const MAIN_LOOK_ID = 'main'

/** The day's looks, in order; a brief without a timeline is one look. */
export function looksOf(data: BriefResponse | undefined): LookSlot[] {
  if (!data) return []
  if (data.looks && data.looks.length > 0) return data.looks
  const b = data.brief
  if (!b) return []
  return [
    {
      id: MAIN_LOOK_ID,
      slot: 'morning',
      label: null,
      time: null,
      occasion: b.occasion,
      rationale: b.rationale,
      weather: b.weather,
      itemIds: b.itemIds,
      items: b.items,
      worn: !!data.worn,
      wornLook: data.wornLook ?? null,
    },
  ]
}

export function useBrief(date: string, opts: { peek?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.brief(date),
    queryFn: () => getBrief({ date, peek: opts.peek }),
    enabled: opts.enabled ?? true,
  })
}

export function useRitual() {
  return useQuery({ queryKey: qk.ritual, queryFn: getRitualStats, staleTime: 60_000 })
}

export function useTrips() {
  return useQuery({ queryKey: qk.trips, queryFn: getTrips, staleTime: 5 * 60_000 })
}

export function useNudges() {
  return useQuery({ queryKey: tk.nudges, queryFn: getFeed, select: (r) => r.cards.slice(0, 3), staleTime: 60_000 })
}

export function useCloset(enabled: boolean) {
  return useQuery({ queryKey: qk.wardrobe, queryFn: getWardrobe, enabled })
}

/** Refresh everything one day's change touches. */
export function useInvalidateDay() {
  const qc = useQueryClient()
  return useCallback((date: string) => Promise.all(dayKeys(date).map((queryKey) => qc.invalidateQueries({ queryKey }))), [qc])
}

/** A fresh brief response for the day, straight into the cache. */
export function useApplyBrief(date: string) {
  const qc = useQueryClient()
  return useCallback(
    (res: BriefResponse) => {
      qc.setQueryData<BriefResponse>(qk.brief(date), res)
      void qc.invalidateQueries({ queryKey: tk.weekAll })
    },
    [qc, date],
  )
}

/** "Wearing it": the look is worn on the board before the server answers. */
export function useWearLook(date: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateDay()
  return useMutation({
    mutationFn: ({ look }: { look: LookSlot }) => wearBrief(look.itemIds, look.id === MAIN_LOOK_ID ? {} : { lookId: look.id }, date),
    onMutate: async ({ look }) => {
      await qc.cancelQueries({ queryKey: qk.brief(date) })
      const prev = qc.getQueryData<BriefResponse>(qk.brief(date))
      if (prev) {
        const first = looksOf(prev)[0]
        qc.setQueryData<BriefResponse>(qk.brief(date), {
          ...prev,
          worn: prev.worn || first?.id === look.id,
          looks: prev.looks?.map((l) => (l.id === look.id ? { ...l, worn: true } : l)),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.brief(date), ctx.prev)
      haptics.failure()
    },
    onSuccess: () => {
      haptics.success()
    },
    onSettled: () => invalidate(date),
  })
}

export interface RecomposeOpts {
  refresh?: boolean
  eventType?: string
  occasion?: string
  rest?: boolean
}

/** Restyle, name the day, or rest it. Today composes through the brief; other days through the plan. */
export function useRecompose(date: string) {
  const apply = useApplyBrief(date)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: RecomposeOpts) =>
      date === todayKey() && !opts.rest
        ? getBrief({ date, refresh: opts.refresh, eventType: opts.eventType, occasion: opts.occasion })
        : planDay({ date, eventType: opts.eventType, occasion: opts.occasion, rest: opts.rest }),
    onSuccess: (res) => {
      apply(res)
      void qc.invalidateQueries({ queryKey: qk.ritual })
    },
    onError: () => haptics.failure(),
  })
}

/** "Back to the first": the day's first composition, restored. */
export function useUndo(date: string) {
  const apply = useApplyBrief(date)
  return useMutation({ mutationFn: () => undoBrief(date), onSuccess: apply, onError: () => haptics.failure() })
}

export interface AddLookBody {
  slot?: LookSlotKind
  label?: string
  time?: string
  occasion?: string
}

export function useAddLook(date: string) {
  const apply = useApplyBrief(date)
  return useMutation({ mutationFn: (body: AddLookBody) => composeLook(body, date), onSuccess: apply, onError: () => haptics.failure() })
}

export function useRemoveLook(date: string) {
  const apply = useApplyBrief(date)
  return useMutation({ mutationFn: (lookId: string) => removeLook(lookId, date), onSuccess: apply, onError: () => haptics.failure() })
}
