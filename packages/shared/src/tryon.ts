import { apiFetch, apiUpload } from './api'
import type {
  PhotoResponse,
  PhotoUploadResponse,
  TryOnResponse,
  TryOnsResponse,
} from './types'

/** GET /api/photo — the user's stored try-on photo (or null). */
export function getPhoto(): Promise<PhotoResponse> {
  return apiFetch<PhotoResponse>('/photo')
}

/** POST /api/photo — upload a new try-on photo (multipart, field name `photo`). */
export function uploadPhoto(file: File): Promise<PhotoUploadResponse & PhotoResponse> {
  const form = new FormData()
  form.append('photo', file)
  // Consent travels with the photo and is recorded server-side.
  form.append('consent', 'true')
  return apiUpload<PhotoUploadResponse & PhotoResponse>('/photo', form)
}

/** POST /api/photo/:id/use — dress this reflection. */
export function usePhoto(id: string): Promise<PhotoResponse> {
  return apiFetch<PhotoResponse>(`/photo/${id}/use`, { method: 'POST' })
}

/** DELETE /api/photo/:id — the photo and every render made from it. */
export function deleteReflection(id: string): Promise<PhotoResponse & { removedRenders: number }> {
  return apiFetch<PhotoResponse & { removedRenders: number }>(`/photo/${id}`, { method: 'DELETE' })
}

/** DELETE /api/photo — remove the stored photo (204 No Content). */
export function deletePhoto(): Promise<void> {
  return apiFetch<void>('/photo', { method: 'DELETE' })
}

/** POST /api/looks/:id/tryon — render the look onto the user's photo (slow, ~20-40s). */
export function createTryOn(lookId: string): Promise<TryOnResponse> {
  return apiFetch<TryOnResponse>(`/looks/${lookId}/tryon`, { method: 'POST' })
}

/** GET /api/tryons — all rendered try-ons, newest first. */
export function getTryOns(): Promise<TryOnsResponse> {
  return apiFetch<TryOnsResponse>('/tryons')
}

/** DELETE /api/tryons/:id — remove a rendered try-on (204 No Content). */
export function deleteTryOn(id: string): Promise<void> {
  return apiFetch<void>(`/tryons/${id}`, { method: 'DELETE' })
}

/** GET /api/tryons/:id — the glass polls this while a render is a job. */
export function getTryOn(id: string): Promise<TryOnResponse> {
  return apiFetch<TryOnResponse>(`/tryons/${id}`)
}

/** POST /api/tryons/:id/retry — "Not right? Try again", free once. */
export function retryTryOn(id: string): Promise<TryOnResponse> {
  return apiFetch<TryOnResponse>(`/tryons/${id}/retry`, { method: 'POST' })
}

/** POST /api/tryons/:id/report — not my clothes; the render is given back. */
export function reportTryOn(id: string): Promise<{ ok: true; refunded: boolean }> {
  return apiFetch<{ ok: true; refunded: boolean }>(`/tryons/${id}/report`, { method: 'POST' })
}

export interface Meter {
  used: number
  limit: number
  remaining?: number
}
export interface UsageSummary {
  plan: string
  label?: string
  lifetime?: boolean
  usage: { looks: Meter; tryons: Meter; catalog: Meter; items: Meter }
}
/** The plan's meters — how many renders are left. */
export function getUsage(): Promise<UsageSummary> {
  return apiFetch<UsageSummary>('/billing/summary')
}
