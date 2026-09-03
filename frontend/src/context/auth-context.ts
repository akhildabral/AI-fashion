import { createContext } from 'react'
import type { User } from '@zauq/shared/types'

export interface AuthContextValue {
  user: User | null
  /** True while the initial token → /auth/me hydration is in flight. */
  initializing: boolean
  login: (email: string, password: string) => Promise<void>
  /** Returns a waitlist message when no session was created, null when logged in. */
  register: (email: string, password: string) => Promise<string | null>
  logout: () => void
  /** Install a session obtained outside the normal login call (SSO, invites). */
  adoptSession: (token: string, user: User) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
