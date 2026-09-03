// Inspiration: looks you don't own, for the fun of it. The ask, the two
// looks the stylist sketches, verdicts, and the doors on each look.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { generateLooks, getLooks, setLookVerdict, tryOnLook, type InspirationLook } from '@zauq/shared/looks'
import type { TryOn } from '@zauq/shared/types'
import { useCallback, useState } from 'react'
import { useFlash } from '@/src/components/Toast'
import { useJobs } from '@/src/context/JobsProvider'
import * as haptics from '@/src/design/haptics'
import { qk } from '@/src/lib/query'
import { mk } from './keys'

export const CHIPS: { key: string; label: string; ask?: string }[] = [
  { key: 'surprise', label: 'Surprise me' },
  { key: 'tonight', label: 'Tonight', ask: 'an evening out tonight' },
  { key: 'weekend', label: 'A weekend away', ask: 'a weekend away, easy and put together' },
  { key: 'bolder', label: 'Bolder than usual', ask: 'a step bolder than my usual' },
  { key: 'warm', label: 'Somewhere warm', ask: 'a warm place, sun and light fabrics' },
]

export const WAIT_LINES = ['Sketching two looks…', 'Choosing the fabrics…', 'Painting them on a model…']

export interface Inspiration {
  ask: string
  setAsk: (s: string) => void
  chip: string
  setChip: (k: string) => void
  looks: InspirationLook[]
  kept: InspirationLook[]
  generating: boolean
  error: string | null
  generate: () => void
  verdict: (look: InspirationLook, v: 'keep' | 'no') => void
  /** The look render is a job; returns it (tracked) so the caller can open the reveal. */
  seeOnMe: (look: InspirationLook) => Promise<TryOn | null>
  seeing: string | null
  /** Bring a kept look back into the pair on show. */
  recall: (look: InspirationLook) => void
}

export function useInspiration({ hasPhoto, onNeedPhoto }: { hasPhoto: boolean; onNeedPhoto: () => void }): Inspiration {
  const qc = useQueryClient()
  const flash = useFlash()
  const { trackRender } = useJobs()
  const [ask, setAsk] = useState('')
  const [chip, setChip] = useState('surprise')
  const [error, setError] = useState<string | null>(null)
  const [seeing, setSeeing] = useState<string | null>(null)

  const fresh = useQuery({ queryKey: mk.looks, queryFn: async () => [] as InspirationLook[], staleTime: Infinity })
  const keptQ = useQuery({ queryKey: mk.keptLooks, queryFn: () => getLooks(true).then((r) => r.looks) })
  const looks = fresh.data ?? []
  const kept = keptQ.data ?? []

  const gen = useMutation({
    mutationFn: async () => {
      const text = ask.trim() || CHIPS.find((c) => c.key === chip)?.ask
      const r = await generateLooks(text ? { occasion: text } : { surprise: true })
      return r.looks
    },
    onMutate: () => setError(null),
    onSuccess: (next) => {
      qc.setQueryData(mk.looks, next)
      void qc.invalidateQueries({ queryKey: qk.usage })
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'The stylist could not sketch that. Try another ask.'),
  })

  const apply = useCallback(
    (updated: InspirationLook) => {
      qc.setQueryData<InspirationLook[]>(mk.looks, (ls) => (ls ?? []).map((l) => (l.id === updated.id ? updated : l)))
      qc.setQueryData<InspirationLook[]>(mk.keptLooks, (ks) => {
        const rest = (ks ?? []).filter((k) => k.id !== updated.id)
        return updated.verdict === 'keep' ? [updated, ...rest] : rest
      })
    },
    [qc],
  )

  const verdictM = useMutation({
    mutationFn: ({ look, v }: { look: InspirationLook; v: 'keep' | 'no' }) => setLookVerdict(look.id, look.verdict === v ? null : v).then((r) => r.look),
    onMutate: ({ look, v }) => apply({ ...look, verdict: look.verdict === v ? null : v }),
    onSuccess: (updated, { look, v }) => {
      apply(updated)
      const next = look.verdict === v ? null : v
      if (next === 'keep') flash('Kept. The stylist takes note.')
      if (next === 'no') flash('Thrown back. Noted, and not repeated.')
    },
    onError: (_err, { look }) => {
      apply(look)
      flash('Could not save that.')
    },
  })

  const seeOnMe = useCallback(
    async (look: InspirationLook): Promise<TryOn | null> => {
      if (!hasPhoto) {
        onNeedPhoto()
        return null
      }
      setSeeing(look.id)
      try {
        const { tryOn, cached } = await tryOnLook(look.id)
        void qc.invalidateQueries({ queryKey: qk.tryons })
        void qc.invalidateQueries({ queryKey: qk.usage })
        if (cached || tryOn.status === 'ready') {
          flash('Already rendered. Here it is.')
        } else {
          trackRender(tryOn)
          flash('Dressing you in it. Half a minute.')
        }
        return tryOn
      } catch (err) {
        haptics.failure()
        flash(err instanceof Error ? err.message : 'Could not render that.')
        return null
      } finally {
        setSeeing(null)
      }
    },
    [hasPhoto, onNeedPhoto, qc, flash, trackRender],
  )

  const recall = useCallback(
    (look: InspirationLook) => {
      qc.setQueryData<InspirationLook[]>(mk.looks, (ls) => ((ls ?? []).some((l) => l.id === look.id) ? ls ?? [] : [look, ...(ls ?? [])]))
    },
    [qc],
  )

  return {
    ask,
    setAsk,
    chip,
    setChip,
    looks,
    kept,
    generating: gen.isPending,
    error,
    generate: () => {
      if (!gen.isPending) gen.mutate()
    },
    verdict: (look, v) => {
      haptics.tap()
      verdictM.mutate({ look, v })
    },
    seeOnMe,
    seeing,
    recall,
  }
}
