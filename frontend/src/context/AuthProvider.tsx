import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from './auth-context'
import { ApiError, apiFetch, clearToken, getToken, setToken } from '../lib/api'
import type { AuthResponse, MeResponse, RegisterResponse, User } from '../lib/types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  // On mount: if a token exists, hydrate the user from /auth/me.
  // Clear the token on 401 (or any auth failure).
  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      if (!getToken()) {
        setInitializing(false)
        return
      }
      try {
        const { user: me } = await apiFetch<MeResponse>('/auth/me')
        if (!cancelled) setUser(me)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearToken()
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
    setToken(res.token)
    setUser(res.user)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    // Waitlist: most signups get a message, not a session. Bootstrap admins
    // (ADMIN_EMAILS) get a token and log straight in.
    if (res.token) {
      setToken(res.token)
      setUser(res.user)
      return null
    }
    return res.message
  }, [])

  const adoptSession = useCallback((token: string, newUser: User) => {
    setToken(token)
    setUser(newUser)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  const value: AuthContextValue = {
    user,
    initializing,
    login,
    register,
    logout,
    adoptSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
