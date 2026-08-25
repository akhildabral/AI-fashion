import { apiFetch, apiUpload } from './api'
import type {
  TryOnResponse,
  WardrobeItemEdit,
  WardrobeItemResponse,
  WardrobeListResponse,
  WardrobeOutfitResponse,
  WardrobeTodayResponse,
} from './types'

/** GET /api/wardrobe — the user's owned garments, newest first. */
export function getWardrobe(): Promise<WardrobeListResponse> {
  return apiFetch<WardrobeListResponse>('/wardrobe')
}

/**
 * POST /api/wardrobe — upload a garment photo (multipart, field name `image`).
 * The server auto-tags it with a vision model, which can take ~5-15s.
 */
export function addWardrobeItem(file: File): Promise<WardrobeItemResponse> {
  const form = new FormData()
  form.append('image', file)
  return apiUpload<WardrobeItemResponse>('/wardrobe', form)
}

/** PATCH /api/wardrobe/:id — correct the auto-generated tags. */
export function updateWardrobeItem(
  id: string,
  edits: WardrobeItemEdit,
): Promise<WardrobeItemResponse> {
  return apiFetch<WardrobeItemResponse>(`/wardrobe/${id}`, {
    method: 'PATCH',
    body: edits,
  })
}

/** DELETE /api/wardrobe/:id — remove a garment (204 No Content). */
export function deleteWardrobeItem(id: string): Promise<void> {
  return apiFetch<void>(`/wardrobe/${id}`, { method: 'DELETE' })
}

/** POST /api/wardrobe/outfit — mix & match outfits for an occasion. */
export function suggestOutfits(occasion: string): Promise<WardrobeOutfitResponse> {
  return apiFetch<WardrobeOutfitResponse>('/wardrobe/outfit', {
    method: 'POST',
    body: { occasion },
  })
}

/** POST /api/wardrobe/today — weather-aware outfits for a city. */
export function whatToWearToday(location: string): Promise<WardrobeTodayResponse> {
  return apiFetch<WardrobeTodayResponse>('/wardrobe/today', {
    method: 'POST',
    body: { location },
  })
}

/**
 * POST /api/wardrobe/tryon — render the user's photo wearing a set of wardrobe
 * items (slow, ~30-40s). 400s if the user has no photo uploaded yet.
 */
export function tryOnWardrobeOutfit(itemIds: string[]): Promise<TryOnResponse> {
  return apiFetch<TryOnResponse>('/wardrobe/tryon', {
    method: 'POST',
    body: { itemIds },
  })
}
