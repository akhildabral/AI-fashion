import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/useAuth'
import { Spinner } from './Spinner'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth()

  if (initializing) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink/50">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/landing" replace />
  }

  return <>{children}</>
}
