import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Device from 'expo-device'
import type { MeResponse, User } from '@zauq/shared/types'
import { ApiError, apiFetch, onAuthExpired } from '@/src/lib/api'
import { adoptTokens, getRefreshToken, hydrateSession, tokens } from '@/src/lib/session'
import { queryClient } from '@/src/lib/query'

/** What every sign-in route returns for a mobile client. */
export interface SessionResponse {
  token: string
  refreshToken?: string
  user: User
}

export interface AuthValue {
  user: User | null
  /** True until the stored session has been checked. */
  initializing: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: (idToken: string, joinCode?: string) => Promise<void>
  signInWithApple: (identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null }, joinCode?: string) => Promise<void>
  /** Adopt a session issued elsewhere (an invite, a join code, a reset). */
  adoptSession: (res: SessionResponse) => void
  signOut: () => Promise<void>
  setUser: (u: User) => void
}

const AuthContext = createContext<AuthValue | null>(null)

/** Sent with every sign-in so the server issues a device session. */
export function clientFields() {
  return { client: 'mobile' as const, deviceName: Device.deviceName ?? Device.modelName ?? undefined }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  // Boot: read the stored session, then confirm it with /auth/me. An expired
  // access token is renewed by the API client on the way.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { token, refreshToken } = await hydrateSession()
      if (!token && !refreshToken) {
        if (!cancelled) setInitializing(false)
        return
      }
      try {
        const { user: me } = await apiFetch<MeResponse>('/auth/me')
        if (!cancelled) setUserState(me)
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) tokens.clear()
        if (!cancelled) setUserState(null)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // The session died mid-use (and could not be renewed): drop the member.
  useEffect(
    () =>
      onAuthExpired(() => {
        setUserState(null)
        queryClient.clear()
      }),
    [],
  )

  const adoptSession = useCallback((res: SessionResponse) => {
    adoptTokens({ token: res.token, refreshToken: res.refreshToken ?? null })
    setUserState(res.user)
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<SessionResponse>('/auth/login', {
        method: 'POST',
        body: { email, password, ...clientFields() },
        auth: false,
      })
      adoptSession(res)
    },
    [adoptSession],
  )

  const signInWithGoogle = useCallback(
    async (idToken: string, joinCode?: string) => {
      const res = await apiFetch<SessionResponse>('/auth/google', {
        method: 'POST',
        body: { credential: idToken, joinCode, ...clientFields() },
        auth: false,
      })
      adoptSession(res)
    },
    [adoptSession],
  )

  const signInWithApple = useCallback(
    async (identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null }, joinCode?: string) => {
      const res = await apiFetch<SessionResponse>('/auth/apple', {
        method: 'POST',
        body: { identityToken, fullName, joinCode, ...clientFields() },
        auth: false,
      })
      adoptSession(res)
    },
    [adoptSession],
  )

  const signOut = useCallback(async () => {
    // Revoke only this device's session; the web stays signed in.
    const refreshToken = getRefreshToken()
    await apiFetch('/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : undefined }).catch(() => undefined)
    tokens.clear()
    setUserState(null)
    queryClient.clear()
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, initializing, signIn, signInWithGoogle, signInWithApple, adoptSession, signOut, setUser: setUserState }),
    [user, initializing, signIn, signInWithGoogle, signInWithApple, adoptSession, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
