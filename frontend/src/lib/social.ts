import { apiFetch } from './api'
import type { WardrobeItem } from './types'

export interface SocialMe {
  handle: string | null
  name: string
  followers: number
  following: number
  picks: number
}

export interface NetworkEntry {
  handle: string
  name: string
  isFriend: boolean
}

/** A public item as exposed on someone's profile (subset of WardrobeItem). */
export interface PublicItem {
  id: string
  imageUrl: string
  category: string
  subtype: string | null
  primaryColor: string | null
  pattern: string | null
  formality: string | null
  season: string[]
}

export interface PublicProfile {
  user: { handle: string | null; name: string }
  counts: { followers: number; following: number; publicItems: number }
  isFollowing: boolean
  followsYou: boolean
  isFriend: boolean
  isMe: boolean
  blockedByMe: boolean
  /** null = not muted, 'forever', or an ISO date */
  mutedUntil: string | null
  publicItems: PublicItem[]
  standing: { picksWorn: number; recreated: number; looksShared: number; wouldWear: number }
  looks: import('./circle').LookPost[]
}

export interface FriendPick {
  id: string
  byHandle: string | null
  byName: string
  note: string | null
  createdAt: string
  items: WardrobeItem[]
}

export function setHandle(handle: string): Promise<{ user: { handle: string } }> {
  return apiFetch('/social/handle', { method: 'PUT', body: { handle } })
}

export function getSocialMe(): Promise<SocialMe> {
  return apiFetch('/social/me')
}

export function getNetwork(): Promise<{ following: NetworkEntry[]; followers: NetworkEntry[] }> {
  return apiFetch('/social/network')
}

export function searchUsers(q: string): Promise<{ users: { handle: string; name: string }[] }> {
  return apiFetch(`/users/search?q=${encodeURIComponent(q)}`)
}

export function getProfileByHandle(handle: string): Promise<PublicProfile> {
  return apiFetch(`/users/${encodeURIComponent(handle)}`)
}

export function followUser(handle: string): Promise<{ ok: boolean; isFriend: boolean }> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/follow`, { method: 'POST' })
}

export function unfollowUser(handle: string): Promise<void> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/follow`, { method: 'DELETE' })
}

/** Assemble an outfit for a friend from their public items. */
export function sendPick(
  handle: string,
  params: { itemIds: string[]; note?: string },
): Promise<{ pick: { id: string } }> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/picks`, { method: 'POST', body: params })
}

export function getPicks(): Promise<{ picks: FriendPick[] }> {
  return apiFetch('/picks')
}

export function dismissPick(id: string): Promise<void> {
  return apiFetch(`/picks/${id}`, { method: 'DELETE' })
}

// ---- Safety: the ways out of an unwanted presence --------------------------

export function blockUser(handle: string): Promise<{ blocked: boolean }> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/block`, { method: 'POST' })
}
export function unblockUser(handle: string): Promise<{ blocked: boolean }> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/block`, { method: 'DELETE' })
}
export function muteUser(handle: string, days?: number): Promise<{ muted: boolean; until: string | null }> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/mute`, { method: 'POST', body: days ? { days } : {} })
}
export function unmuteUser(handle: string): Promise<{ muted: boolean }> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/mute`, { method: 'DELETE' })
}
export function removeFollower(handle: string): Promise<void> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/follower`, { method: 'DELETE' })
}

export type ReportTarget = 'user' | 'look' | 'verdict' | 'pick' | 'comment'
export type ReportReason = 'spam' | 'impersonation' | 'harassment' | 'not_their_clothes' | 'other'
export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam or ads' },
  { key: 'impersonation', label: 'Pretending to be someone' },
  { key: 'harassment', label: 'Unkind or harassing' },
  { key: 'not_their_clothes', label: 'Not their clothes' },
  { key: 'other', label: 'Something else' },
]

export function report(body: { targetType: ReportTarget; targetId: string; reason: ReportReason; detail?: string }): Promise<{ ok: boolean }> {
  return apiFetch('/reports', { method: 'POST', body })
}

export interface Hidden {
  blocked: { handle: string | null; name: string; since: string }[]
  muted: { handle: string | null; name: string; until: string | null }[]
}
export function getHidden(): Promise<Hidden> {
  return apiFetch('/social/hidden')
}

export interface OverlapMatch {
  theirs: PublicItem
  yours: PublicItem
}

export interface OverlapResult {
  theirCount: number
  matchedCount: number
  matches: OverlapMatch[]
}

/** How much of their public wardrobe you could recreate from yours. */
export function getOverlap(handle: string): Promise<OverlapResult> {
  return apiFetch(`/users/${encodeURIComponent(handle)}/overlap`)
}

export interface StyleTwin {
  handle: string
  name: string
  match: number
  sharedTaste: string[]
  isFollowing: boolean
}

/** People matched by taste (quiz signals + wardrobe make-up), not followers. */
export function getStyleTwins(): Promise<{ twins: StyleTwin[] }> {
  return apiFetch('/social/twins')
}
