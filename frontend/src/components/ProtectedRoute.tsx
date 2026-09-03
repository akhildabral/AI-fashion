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
    if (sessionExpiredPending()) {
      const from = encodeURIComponent(location.pathname + location.search)
      return <Navigate to={`/login?reason=expired&from=${from}`} replace />
    }
    return <Navigate to="/landing" replace />
  }

  return <>{children}</>
}
