import { apiFetch } from './api'
import type { TasteResponse } from './types'

// The taste layer: what the stylist has learned from the record, for the
// member to read and correct.

/** GET /api/profile/taste — the facts, the favourite looks, the leanings. */
export function getTaste(): Promise<TasteResponse> {
  return apiFetch<TasteResponse>('/profile/taste')
}

/** "Not quite": the fact is never said again; the profile comes back redrawn. */
export function dismissTasteFact(id: string): Promise<TasteResponse> {
  return apiFetch<TasteResponse>(`/profile/taste/facts/${encodeURIComponent(id)}/dismiss`, { method: 'POST' })
}

/** Redraw the profile from the record now, rather than tonight. */
export function recomputeTaste(): Promise<TasteResponse> {
  return apiFetch<TasteResponse>('/profile/taste/recompute', { method: 'POST' })
}

/** The lean, in words: "a step more casual", "a step sharper", or null when there is nothing to say. */
export function formalityLean(offset: Record<string, { offset: number; days: number }> | undefined): string | null {
  const e = offset?.all
  if (!e || e.days < 3 || Math.abs(e.offset) < 0.5) return null
  const steps = Math.abs(e.offset) >= 1.5 ? 'Two steps' : 'A step'
  return e.offset < 0 ? `${steps} more casual` : `${steps} sharper`
}
