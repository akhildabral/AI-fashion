// Query keys the Today room needs beyond `qk` in `@/src/lib/query`. Kept
// here so the room owns its own invalidation and nothing in lib changes.
import { shiftKey, todayKey } from '@zauq/shared/brief'
import { qk } from '@/src/lib/query'

export const tk = {
  /** The circle's nudges for the greeting (GET /feed, first three cards). */
  nudges: ['today', 'nudges'] as const,
  /** Alternatives for one slot of the brief, excluding the pieces on the board. */
  alternatives: (slot: string, exclude: string[]) => ['today', 'alternatives', slot, exclude.join(',')] as const,
  /** The prefix under every `qk.week(from)`; invalidating it refreshes any strip. */
  weekAll: ['week'] as const,
}

/** The week the strip shows: two days back from today, as `WeekStrip` asks for it. */
export function stripFrom(): string {
  return shiftKey(todayKey(), -2)
}

/** The journal month a date belongs to, as `qk.journal` keys it. */
export function journalMonth(date: string): string {
  return date.slice(0, 7)
}

/** Every key a change to one day touches. */
export function dayKeys(date: string) {
  return [qk.brief(date), tk.weekAll, qk.ritual, qk.journal(journalMonth(date))] as const
}
