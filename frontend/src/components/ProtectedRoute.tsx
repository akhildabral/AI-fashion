import { Navigate, useLocation } from 'react-router-dom'
import { sessionExpiredPending } from '../lib/api'
import type { ReactNode } from 'react'
import { useAuth } from '../context/useAuth'
import { AppBoot } from './AppBoot'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth()
  const location = useLocation()

  if (initializing) {
    return <AppBoot />
  }

  if (!user) {
    const from = encodeURIComponent(location.pathname + location.search)
    if (sessionExpiredPending()) {
      return <Navigate to={`/login?reason=expired&from=${from}`} replace />
    }
    // A shop link shared into the app while signed out (the share target, the
    // extension): sign in, then resume the import where it was headed.
    if (new URLSearchParams(location.search).has('url')) {
      return <Navigate to={`/login?from=${from}`} replace />
    }
    return <Navigate to="/landing" replace />
  }

  return <>{children}</>
}
