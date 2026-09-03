import { apiFetch } from './api'
import type {
  EventType,
  WearInsightsResponse,
  WearLogEntry,
  WearLogListResponse,
} from './types'

/**
 * POST /api/wearlog — one-tap "I wore this". Pass a city to snapshot today's
 * weather into the log; everything besides the items is optional.
 */
export function logWear(params: {
  itemIds?: string[]
  /** A saved outfit — its wear count moves with the log. */
  outfitId?: string
  eventType?: EventType | string
  location?: string
  rating?: number
  /** Wearing a look a friend picked — credits the stylist. */
  pickId?: string
  /** Log a past day (ISO date-time). Defaults to now. */
  wornOn?: string
}): Promise<{ log: WearLogEntry }> {
  return apiFetch<{ log: WearLogEntry }>('/wearlog', {
    method: 'POST',
    body: params,
  })
}

/**
 * GET /api/wearlog — wear history, newest first. With `month` (YYYY-MM) the
 * response also lists which days of that month were logged.
 */
export function getWearLog(opts: { month?: string; item?: string; occasion?: EventType } = {}): Promise<WearLogListResponse> {
  const q = new URLSearchParams()
  if (opts.month) q.set('month', opts.month)
  if (opts.item) q.set('item', opts.item)
  if (opts.occasion) q.set('occasion', opts.occasion)
  const s = q.toString()
  return apiFetch<WearLogListResponse>(`/wearlog${s ? `?${s}` : ''}`)
}

/** "Again?" — 5 = again, 1 = not this one, null clears it. */
export function rateWearLog(id: string, rating: 1 | 5 | null): Promise<{ rating: 1 | 5 | null }> {
  return apiFetch(`/wearlog/${id}/rating`, { method: 'PATCH', body: { rating } })
}

/** DELETE /api/wearlog/:id — remove a mistaken entry (204 No Content). */
export function deleteWearLog(id: string): Promise<void> {
  return apiFetch<void>(`/wearlog/${id}`, { method: 'DELETE' })
}

/** GET /api/wearlog/insights — per-item wear counts and wardrobe orphans. */
export function getWearInsights(): Promise<WearInsightsResponse> {
  return apiFetch<WearInsightsResponse>('/wearlog/insights')
}
