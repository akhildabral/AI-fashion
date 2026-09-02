import { apiFetch, apiUpload } from './api'

// The Circle: one ranked feed of posts from the people you follow, the
// reactions on them, and the things that happened to you (behind the bell).

export const REACTION_KINDS = ['would_wear', 'bold', 'love'] as const
export type ReactionKind = (typeof REACTION_KINDS)[number]

export interface PostItem {
  id: string
  imageUrl: string
  subtype: string | null
  category: string
}

export interface ReactionSummary {
  counts: Record<string, number>
  total: number
  sample: string[]
  mine: ReactionKind | null
}

export interface LookPost {
  type: 'look'
  id: string
  at: string
  handle: string | null
  isMine: boolean
  isFriend: boolean
  eventType: string | null
  featured: boolean
  items: PostItem[]
  reactions: ReactionSummary
  comments: number
  saved: boolean
  saves: number
  recreates: number
  photoUrl: string | null
}

export interface VerdictPost {
  type: 'verdict'
  id: string
  at: string
  handle: string | null
  isMine: boolean
  question: string
  options: { id: string; imageUrl: string }[]
  expiresAt: string
  settled: boolean
  counts: Record<string, number> | null
  totalVotes: number
  myVote: string | null
  comments: number
}

export interface PickPost {
  type: 'pick'
  id: string
  at: string
  handle: string | null
  note: string | null
  items: PostItem[]
}

export type CirclePost = LookPost | VerdictPost | PickPost
export type Lens = 'foryou' | 'following' | 'explore' | 'saved'

export function getCircleFeed(lens: 'foryou' | 'following', offset = 0) {
  return apiFetch<{ posts: CirclePost[]; nextOffset: number | null; circleSize: number }>(
    `/circle/feed?lens=${lens}&offset=${offset}`,
  )
}

export function getCircleExplore() {
  return apiFetch<{ posts: LookPost[] }>('/circle/explore')
}

export function getCircleToday() {
  return apiFetch<{ entries: LookPost[] }>('/circle/today')
}

export function reactToLook(wearLogId: string, kind: ReactionKind) {
  return apiFetch<{ reactions: ReactionSummary }>(`/looks/${wearLogId}/react`, {
    method: 'POST',
    body: { kind },
  })
}

export function unreactToLook(wearLogId: string) {
  return apiFetch<{ reactions: ReactionSummary }>(`/looks/${wearLogId}/react`, { method: 'DELETE' })
}

/** Vote on a friend's verdict from the feed. Signed-in voters key by user id. */
export function voteOnVerdict(pollId: string, optionId: string, userId: string) {
  return apiFetch<{ ok: boolean; alreadyVoted: boolean }>(`/polls/${pollId}/vote`, {
    method: 'POST',
    body: { optionId, voterKey: `user:${userId}` },
  })
}

export interface Notification {
  id: string
  type: 'new_follower' | 'pick_received' | 'pick_worn' | 'look_reacted' | 'look_recreated' | 'commented' | 'mentioned' | 'verdict_settled' | 'laundry_due' | 'wishlist_nudge'
  actorHandle: string | null
  payload: Record<string, unknown>
  read: boolean
  at: string
}

export function getNotifications() {
  return apiFetch<{ unread: number; items: Notification[] }>('/notifications')
}

export function getUnreadCount() {
  return apiFetch<{ unread: number }>('/notifications/unread')
}

export function markNotificationsRead() {
  return apiFetch<{ ok: boolean }>('/notifications/read', { method: 'POST' })
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'closed'
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return `${mins}m left`
  return `${Math.ceil(mins / 60)}h left`
}

/* ---------- comments ---------- */

export interface Comment {
  id: string
  body: string
  at: string
  handle: string | null
  isMine: boolean
}
export type CommentTarget = 'look' | 'verdict'

export function getComments(target: CommentTarget, id: string) {
  return apiFetch<{ comments: Comment[] }>(`/comments?target=${target}&id=${id}`)
}
export function addComment(target: CommentTarget, id: string, body: string) {
  return apiFetch<{ comment: Comment }>('/comments', { method: 'POST', body: { target, id, body } })
}
export function deleteComment(id: string) {
  return apiFetch<void>(`/comments/${id}`, { method: 'DELETE' })
}

/* ---------- saved looks (your board) ---------- */

export function saveLook(wearLogId: string) {
  return apiFetch<{ saved: boolean }>(`/looks/${wearLogId}/save`, { method: 'POST' })
}
export function unsaveLook(wearLogId: string) {
  return apiFetch<{ saved: boolean }>(`/looks/${wearLogId}/save`, { method: 'DELETE' })
}
export function getCircleSaved() {
  return apiFetch<{ posts: LookPost[] }>('/circle/saved')
}

/* ---------- sharing your own looks ---------- */

export interface MyLook {
  id: string
  wornOn: string
  eventType: string | null
  shared: boolean
  photoUrl: string | null
  items: PostItem[]
}
export function getMyRecentLooks() {
  return apiFetch<{ looks: MyLook[] }>('/circle/mine')
}
export function shareLook(wearLogId: string) {
  return apiFetch<{ shared: boolean }>(`/looks/${wearLogId}/share`, { method: 'POST' })
}
export function unshareLook(wearLogId: string) {
  return apiFetch<{ shared: boolean }>(`/looks/${wearLogId}/share`, { method: 'DELETE' })
}

/* ---------- the OOTD photo ---------- */

export function setLookPhoto(wearLogId: string, file: File) {
  const fd = new FormData()
  fd.append('photo', file)
  return apiUpload<{ photoUrl: string }>(`/looks/${wearLogId}/photo`, fd)
}
export function setLookPhotoFromRender(wearLogId: string, tryOnId: string) {
  return apiFetch<{ photoUrl: string }>(`/looks/${wearLogId}/photo-from-render`, { method: 'POST', body: { tryOnId } })
}
export function clearLookPhoto(wearLogId: string) {
  return apiFetch<{ photoUrl: null }>(`/looks/${wearLogId}/photo`, { method: 'DELETE' })
}
