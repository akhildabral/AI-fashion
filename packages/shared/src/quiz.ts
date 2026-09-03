import { apiFetch } from './api'
import type { QuizResponse, StyleProfile } from './types'

/** GET /api/quiz — the visual this-or-that pairs. */
export function getQuiz(): Promise<QuizResponse> {
  return apiFetch<QuizResponse>('/quiz')
}

/**
 * POST /api/quiz — submit answers; the server derives style signals and
 * stores them on the profile.
 */
export function submitQuiz(
  choices: Record<string, 'left' | 'right'>,
): Promise<{ profile: StyleProfile }> {
  return apiFetch<{ profile: StyleProfile }>('/quiz', {
    method: 'POST',
    body: { choices },
  })
}
