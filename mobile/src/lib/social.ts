import { apiFetch } from './api'
import type { WardrobeItem } from './types'

export interface SocialMe {
  handle: string | null
  followers: number
  following: number
  picks: number
}

export interface NetworkEntry {
  handle: string
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
  user: { handle: string | null }
  counts: { followers: number; following: number; publicItems: number }
  isFollowing: boolean
  followsYou: boolean
  isFriend: boolean
  isMe: boolean
  publicItems: PublicItem[]
}

export interface FriendPick {
  id: string
  byHandle: string | null
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

export function searchUsers(q: string): Promise<{ users: { handle: string }[] }> {
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
  match: number
  sharedTaste: string[]
  isFollowing: boolean
}

/** People matched by taste (quiz signals + wardrobe make-up), not followers. */
export function getStyleTwins(): Promise<{ twins: StyleTwin[] }> {
  return apiFetch('/social/twins')
}
