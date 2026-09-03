import { createContext } from 'react'
import type { StyleProfile } from '@zauq/shared/types'

export interface ProfileContextValue {
  /** The user's saved style profile, or null if they haven't created one yet. */
  profile: StyleProfile | null
  /** True while the initial profile fetch (after auth) is in flight. */
  loading: boolean
  loadFailed: boolean
  /** Replace the cached profile (e.g. after a successful save). */
  setProfile: (profile: StyleProfile) => void
  /** Re-fetch the profile from the server. */
  refresh: () => Promise<void>
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)
