import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getLocales } from 'expo-localization'
import { setCurrentCurrency, setLocaleHints } from '@zauq/shared/money'
import type { ProfileResponse, StyleProfile } from '@zauq/shared/types'
import { setCurrentUnits } from '@zauq/shared/units'
import { apiFetch } from '@/src/lib/api'
import { useAuth } from './AuthProvider'

// Until the profile names a currency, guess it from the device's region.
setLocaleHints(getLocales().map((l) => l.languageTag))

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

  // Every figure prints in the member's currency and units once the profile is known.
  useEffect(() => {
    setCurrentCurrency(profile?.currency ?? null)
    setCurrentUnits(profile?.units ?? null)
  }, [profile?.currency, profile?.units])

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
