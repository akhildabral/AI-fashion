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
  itemIds: string[]
  eventType?: EventType
  location?: string
  rating?: number
}): Promise<{ log: WearLogEntry }> {
  return apiFetch<{ log: WearLogEntry }>('/wearlog', {
    method: 'POST',
    body: params,
  })
}

/** GET /api/wearlog — wear history, newest first. */
export function getWearLog(): Promise<WearLogListResponse> {
  return apiFetch<WearLogListResponse>('/wearlog')
}

/** DELETE /api/wearlog/:id — remove a mistaken entry (204 No Content). */
export function deleteWearLog(id: string): Promise<void> {
  return apiFetch<void>(`/wearlog/${id}`, { method: 'DELETE' })
}

/** GET /api/wearlog/insights — per-item wear counts and wardrobe orphans. */
export function getWearInsights(): Promise<WearInsightsResponse> {
  return apiFetch<WearInsightsResponse>('/wearlog/insights')
}
