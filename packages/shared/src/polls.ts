import { apiFetch } from './api'

export interface PollOption {
  id: string
  imageUrl: string
}

export interface Poll {
  id: string
  question: string
  options: PollOption[]
  expiresAt: string
  createdAt: string
  /** Votes per option id — asker only. */
  counts?: Record<string, number>
  totalVotes?: number
  shareUrl: string
  expired: boolean
}

export type PollOptionInput = { imageUrl: string; label?: string } | { itemIds: string[]; label?: string }
export type PollAudience = 'circle' | 'friends' | 'link'

/** POST /api/polls — ask a verdict with two or three of anything, of everyone, a few friends, or a link. */
export function createPoll(params: {
  imageUrls?: string[]
  options?: PollOptionInput[]
  question?: string
  audience?: PollAudience
  friendHandles?: string[]
  expiresInMinutes?: number
}): Promise<{ poll: Poll }> {
  return apiFetch<{ poll: Poll }>('/polls', { method: 'POST', body: params })
}

/** GET /api/polls — the asker's polls with vote counts. */
export function listPolls(): Promise<{ polls: Poll[] }> {
  return apiFetch<{ polls: Poll[] }>('/polls')
}

/** DELETE /api/polls/:id (204 No Content). */
export function deletePoll(id: string): Promise<void> {
  return apiFetch<void>(`/polls/${id}`, { method: 'DELETE' })
}
