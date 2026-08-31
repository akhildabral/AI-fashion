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

/** POST /api/polls — create a verdict poll from 2-3 image URLs. */
export function createPoll(params: {
  imageUrls: string[]
  question?: string
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
