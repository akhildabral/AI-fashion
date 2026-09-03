import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useProfile } from '../context/useProfile'
import { Spinner } from './Spinner'

/**
 * Onboarding gate: renders children only once the user has a style profile.
 * While the profile is loading we show a spinner; if none exists we send the
 * user to the fitting.
 */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { profile, loading, loadFailed, refresh } = useProfile()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink/50">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!profile && loadFailed) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-ink/60">We couldn’t reach your stylist. Check your connection.</p>
        <button type="button" onClick={() => void refresh()} className="btn-primary">
          Try again
        </button>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/fitting" replace />
  }

  return <>{children}</>
}
