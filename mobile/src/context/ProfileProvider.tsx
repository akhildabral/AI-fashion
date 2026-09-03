import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ProfileResponse, StyleProfile } from '@zauq/shared/types'
import { apiFetch } from '@/src/lib/api'
import { useAuth } from './AuthProvider'

export interface ProfileValue {
  profile: StyleProfile | null
  loading: boolean
  /** The last read failed; the gate offers a retry instead of restarting the fitting. */
  loadFailed: boolean
  setProfile: (p: StyleProfile) => void
  refresh: () => Promise<void>
}

const ProfileContext = createContext<ProfileValue | null>(null)

/**
 * The signed-in member's style profile, shared by the onboarding gate and the
 * profile screens. Resets on sign-out.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth()
  const [profile, setProfileState] = useState<StyleProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { profile: p } = await apiFetch<ProfileResponse>('/profile')
      setProfileState(p)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (initializing) return
    if (!user) {
      setProfileState(null)
      setLoadFailed(false)
      setLoading(false)
      return
    }
    setLoading(true)
    apiFetch<ProfileResponse>('/profile')
      .then(({ profile: p }) => {
        if (!cancelled) {
          setProfileState(p)
          setLoadFailed(false)
          setLoadedFor(user.id)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true)
          setLoadedFor(user.id)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, initializing])

  const setProfile = useCallback((p: StyleProfile) => setProfileState(p), [])

  const settled = !initializing && (!user || loadedFor === user.id)
  const value = useMemo<ProfileValue>(
    () => ({ profile, loading: loading || !settled, loadFailed, setProfile, refresh }),
    [profile, loading, settled, loadFailed, setProfile, refresh],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileValue {
  const v = useContext(ProfileContext)
  if (!v) throw new Error('useProfile outside ProfileProvider')
  return v
}
