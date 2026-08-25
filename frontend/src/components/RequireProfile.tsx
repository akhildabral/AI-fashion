import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useProfile } from '../context/useProfile'
import { Spinner } from './Spinner'

/**
 * Onboarding gate: renders children only once the user has a style profile.
 * While the profile is loading we show a spinner; if none exists we send the
 * user to `/profile` to set one up. The `/profile` route itself is NOT wrapped
 * in this guard, which avoids a redirect loop.
 */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink/50">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/profile" replace />
  }

  return <>{children}</>
}
