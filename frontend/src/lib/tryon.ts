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
export function uploadPhoto(file: File): Promise<PhotoUploadResponse> {
  const form = new FormData()
  form.append('photo', file)
  return apiUpload<PhotoUploadResponse>('/photo', form)
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
