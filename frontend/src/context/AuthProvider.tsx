import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type AuthContextValue } from './auth-context'
import { ApiError, adoptTokens, apiFetch, clearToken, clientFields, getRefreshToken, getToken, onAuthExpired, refreshSession, signOut } from '../lib/api'
import type { AuthResponse, MeResponse, RegisterResponse, User } from '@zauq/shared/types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  // On mount: if a session exists, hydrate the user from /auth/me. An expired
  // access token is renewed by the API client on the way; a session with only
  // a refresh token left is renewed first. Clear the session on 401.
  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      if (!getToken() && !getRefreshToken()) {
        setInitializing(false)
        return
      }
      if (!getToken() && !(await refreshSession())) {
        clearToken()
        if (!cancelled) setInitializing(false)
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

  // A 401 on any authenticated request means the session died mid-use —
  // the API client clears the token and broadcasts; we drop the user so
  // routing falls back to the landing page instead of pages rendering raw errors.
  useEffect(() => onAuthExpired(() => setUser(null)), [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password, ...clientFields() },
      auth: false,
    })
    adoptTokens({ token: res.token, refreshToken: res.refreshToken ?? null })
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
      adoptTokens({ token: res.token, refreshToken: null })
      setUser(res.user)
      return null
    }
    return res.message
  }, [])

  const adoptSession = useCallback((token: string, newUser: User, refreshToken?: string | null) => {
    adoptTokens({ token, refreshToken })
    setUser(newUser)
  }, [])

  const logout = useCallback(() => {
    // Drop the member now so routing falls back to the door at once; the
    // server-side revocation (this browser's session only, or the token
    // version for a session issued before refresh tokens) follows behind.
    setUser(null)
    void signOut()
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
