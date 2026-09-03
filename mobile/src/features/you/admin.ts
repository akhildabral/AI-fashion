// The admin desk's shapes and words, from the web's AdminPage.
export interface AdminUser {
  id: string
  email: string
  handle: string | null
  role: string
  status: string
  emailVerified: boolean
  firstName: string | null
  lastName: string | null
  viaGoogle: boolean
  plan: string
  planStatus: string
  createdAt: string
  items: number
  wears: number
  aiCalls7d: number
  invitesLeft: number
  invited: number
  invitedBy: string | null
}

export interface AdminReport {
  id: string
  targetType: string
  targetId: string
  target: string
  reason: string
  detail: string | null
  reporter: string
  createdAt: string
  resolvedAt: string | null
}

export const REASON_LABEL: Record<string, string> = {
  spam: 'Spam or ads',
  impersonation: 'Impersonation',
  harassment: 'Harassment',
  not_their_clothes: 'Not their clothes',
  other: 'Other',
}

export const WAITING = ['waitlist', 'pending', 'invited']
export const PLAN_IDS = ['free', 'plus', 'pro', 'premium', 'founder'] as const

export function displayName(u: AdminUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ')
  return name || u.email
}
