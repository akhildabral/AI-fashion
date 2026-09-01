import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiFetch, clearToken, getToken, setToken } from '../lib/api'
import type { AuthResponse, MeResponse, RegisterResponse, User } from '../lib/types'

export interface AuthContextValue {
  user: User | null
  initializing: boolean
  login: (email: string, password: string) => Promise<void>
  /** Returns a waitlist message when no session was created, null when logged in. */
  register: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  // On mount: if a token exists, hydrate the user from /auth/me.
  // Clear the token on 401 (or any auth failure).
  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      const token = await getToken()
      if (!token) {
        if (!cancelled) setInitializing(false)
        return
      }
      try {
        const { user: me } = await apiFetch<MeResponse>('/auth/me')
        if (!cancelled) setUser(me)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await clearToken()
        }
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    await setToken(res.token)
    setUser(res.user)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    if (res.token) {
      await setToken(res.token)
      setUser(res.user)
      return null
    }
    return res.message
  }, [])

  const logout = useCallback(async () => {
    await clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, initializing, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
