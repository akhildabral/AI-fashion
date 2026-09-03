import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/src/context/AuthProvider'
import { clearDraft, EMPTY_DRAFT, loadDraft, saveDraft, type FittingDraft } from './draft'

export interface FittingValue {
  draft: FittingDraft
  /** The stored draft has been read; before this, patches are dropped. */
  hydrated: boolean
  patch: (p: Partial<FittingDraft>) => void
  /** The fitting is over: forget the draft. */
  reset: () => void
}

const FittingContext = createContext<FittingValue | null>(null)

/**
 * The one draft shared by every step of the fitting, persisted after every
 * change. Lives in the `(fitting)` layout, so it is gone with the group.
 */
export function FittingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [draft, setDraft] = useState<FittingDraft>(EMPTY_DRAFT)
  const [hydrated, setHydrated] = useState(false)
  const live = useRef(false)

  useEffect(() => {
    let cancelled = false
    live.current = false
    loadDraft().then((saved) => {
      if (cancelled) return
      setDraft(saved && saved.userId === userId ? saved : { ...EMPTY_DRAFT, userId })
      live.current = true
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (hydrated && live.current) saveDraft(draft)
  }, [draft, hydrated])

  const patch = useCallback((p: Partial<FittingDraft>) => {
    if (!live.current) return
    setDraft((prev) => ({ ...prev, ...p }))
  }, [])

  const reset = useCallback(() => {
    live.current = false
    clearDraft()
    setDraft({ ...EMPTY_DRAFT, userId })
  }, [userId])

  const value = useMemo<FittingValue>(() => ({ draft, hydrated, patch, reset }), [draft, hydrated, patch, reset])
  return <FittingContext.Provider value={value}>{children}</FittingContext.Provider>
}

export function useFitting(): FittingValue {
  const v = useContext(FittingContext)
  if (!v) throw new Error('useFitting outside FittingProvider')
  return v
}
