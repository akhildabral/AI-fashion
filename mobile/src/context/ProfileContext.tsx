import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch } from '../lib/api'
import type { ProfileResponse, StyleProfile } from '../lib/types'
import { useAuth } from './AuthContext'

export interface ProfileContextValue {
  profile: StyleProfile | null
  loading: boolean
  setProfile: (p: StyleProfile) => void
  refresh: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined)

/**
 * Loads and caches the signed-in user's style profile so the onboarding gate
 * and the profile screen can share a single source of truth. Resets on logout.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth()
  const [profile, setProfileState] = useState<StyleProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { profile: p } = await apiFetch<ProfileResponse>('/profile')
      setProfileState(p)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (initializing) return

    if (!user) {
      setProfileState(null)
      setLoading(false)
      return
    }

    setLoading(true)
    apiFetch<ProfileResponse>('/profile')
      .then(({ profile: p }) => {
        if (!cancelled) setProfileState(p)
      })
      .catch(() => {
        if (!cancelled) setProfileState(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, initializing])

  const setProfile = useCallback((p: StyleProfile) => {
    setProfileState(p)
  }, [])

  return (
    <ProfileContext.Provider value={{ profile, loading, setProfile, refresh }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider')
  return ctx
}
