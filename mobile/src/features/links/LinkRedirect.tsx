// The landing for a web link opened on the phone. Door links go to the
// door; room links open at once for a fitted member, and wait as a pending
// link for anyone still outside.
import { Redirect } from 'expo-router'
import { useAuth } from '@/src/context/AuthProvider'
import { useProfile } from '@/src/context/ProfileProvider'
import { fittingComplete } from '@/src/lib/fitting'
import { appLinkFor, type LinkParams } from '@/src/lib/links'
import { setPendingLink } from '@/src/lib/pendingLink'

export function LinkRedirect({ path, params }: { path: string; params?: LinkParams }) {
  const { user, initializing } = useAuth()
  const { profile, loading } = useProfile()
  const link = appLinkFor(path, params)

  if (!link) return <Redirect href="/(tabs)/today" />
  if (link.kind === 'door') return <Redirect href={user ? '/(tabs)/today' : link.href} />

  // The shell keeps the splash up until this settles, so nothing shows here.
  if (initializing || (user && loading)) return null
  if (user && fittingComplete(profile)) return <Redirect href={link.href} />

  // Idempotent, so setting it during render is safe.
  setPendingLink(link.href)
  return <Redirect href={user ? '/(fitting)' : '/(door)/sign-in'} />
}
