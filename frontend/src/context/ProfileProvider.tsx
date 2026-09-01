import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ProfileContext, type ProfileContextValue } from './profile-context'
import { apiFetch } from '../lib/api'
import type { ProfileResponse, StyleProfile } from '../lib/types'
import { useAuth } from './useAuth'

/**
 * Loads and caches the signed-in user's style profile so the onboarding gate
 * and the profile page can share a single source of truth. Resets when the
 * user logs out.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth()
  const [profile, setProfileState] = useState<StyleProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { profile: p } = await apiFetch<ProfileResponse>('/profile')
      setProfileState(p)
      setLoadFailed(false)
    } catch {
      // Transient failure: keep whatever we had rather than bouncing an
      // established user back into onboarding.
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    // Wait for auth to settle before deciding anything.
    if (initializing) return

    if (!user) {
      // Logged out: clear any cached profile.
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
        }
      })
      .catch(() => {
        // A network blip is not "no profile" — flag it so the gate can offer
        // a retry instead of restarting onboarding.
        if (!cancelled) setLoadFailed(true)
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

  const value: ProfileContextValue = {
    profile,
    loading,
    loadFailed,
    setProfile,
    refresh,
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
