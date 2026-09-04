import { apiFetch } from './api'
import type { User } from './types'

// The door: your standing invite link, who came in on it, and joining on
// someone else's.

export interface MyInvite {
  code: string
  url: string
  profileUrl: string | null
  /** null = unlimited (admins) */
  left: number | null
  used: { handle: string | null; firstName: string | null; name: string; joinedAt: string }[]
}

export function getMyInvite(): Promise<MyInvite> {
  return apiFetch('/invites/mine')
}

export interface JoinInfo {
  inviter: { handle: string | null; firstName: string | null; name: string }
  open: boolean
}

export function getJoinInfo(code: string): Promise<JoinInfo> {
  return apiFetch(`/auth/join/${encodeURIComponent(code)}`, { auth: false })
}

export function joinWithCode(
  code: string,
  body: {
    email: string
    password: string
    firstName: string
    lastName: string | null
    /** Name the client to be issued a refresh token alongside the access token. */
    client?: 'web' | 'mobile'
    deviceName?: string
  },
): Promise<{ token: string; refreshToken?: string; user: User; inviter: { handle: string | null } }> {
  return apiFetch(`/auth/join/${encodeURIComponent(code)}`, { method: 'POST', body, auth: false })
}
