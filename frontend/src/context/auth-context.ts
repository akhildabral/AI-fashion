import { createContext } from 'react'
import type { User } from '../lib/types'

export interface AuthContextValue {
  user: User | null
  /** True while the initial token → /auth/me hydration is in flight. */
  initializing: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
