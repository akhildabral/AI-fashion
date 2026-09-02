import { apiFetch, apiUpload } from './api'
import type {
  EventType,
  FeedbackSignal,
  PackingResponse,
  ResaleDraftResponse,
  TryOnResponse,
  WardrobeItem,
  WardrobeItemEdit,
  WardrobeItemResponse,
  WardrobeListResponse,
  WardrobeOutfitResponse,
  WardrobeTodayResponse,
} from './types'

/** GET /api/wardrobe — the user's owned garments, newest first. */
export interface BasketResponse {
  items: WardrobeItem[]
  counts: { inWash: number; packed: number; lentOut: number }
  worthALoad: boolean
  loadWorth: number
  oneMoreWear: { id: string; category: string; subtype: string | null; wearsSinceWash: number; imageUrl: string }[]
  lastWashedAt: string | null
}

/** GET /api/wardrobe/basket — what's out of rotation and why. */
export function getBasket(): Promise<BasketResponse> {
  return apiFetch<BasketResponse>('/wardrobe/basket')
}

/** POST /api/wardrobe/basket/clean — back from the wash (everything, or some). */
export function basketClean(itemIds?: string[]): Promise<{ ok: true; count: number }> {
  return apiFetch<{ ok: true; count: number }>('/wardrobe/basket/clean', { method: 'POST', body: itemIds ? { itemIds } : {} })
}

export interface VerdictResponse {
  status: 'ready' | 'processing' | 'failed'
  piece: WardrobeItem
  verdict: { outfits: number; pairs: number; closetSize: number; computedAt: string }
  outfits: { items: WardrobeItem[]; score: number }[]
  closest: { item: WardrobeItem; wears: number; likeness: number } | null
  unlockLine: string | null
}

/** POST /api/wardrobe with owned=false — a piece seen in a store, not owned yet. */
export function addCandidate(file: File, meta: { store?: string; seenPrice?: number } = {}): Promise<WardrobeItemResponse> {
  const form = new FormData()
  form.append('image', file)
  form.append('owned', 'false')
  if (meta.store) form.append('store', meta.store)
  if (meta.seenPrice != null) form.append('seenPrice', String(meta.seenPrice))
  return apiUpload<WardrobeItemResponse>('/wardrobe', form)
}

/** GET /api/wardrobe/:id/verdict — how a piece fits the closet. */
export function getVerdict(id: string): Promise<VerdictResponse> {
  return apiFetch<VerdictResponse>(`/wardrobe/${id}/verdict`)
}

/** GET /api/wardrobe?owned=false — pieces you don't own yet. */
export function getWishlist(): Promise<WardrobeListResponse> {
  return apiFetch<WardrobeListResponse>('/wardrobe?owned=false')
}

export function getWardrobe(): Promise<WardrobeListResponse> {
  return apiFetch<WardrobeListResponse>('/wardrobe')
}

/**
 * POST /api/wardrobe — upload a garment photo (multipart, field name `image`).
 * Returns immediately with status 'processing'; cutout + tagging run in the
 * background, so poll the list until the item flips to 'ready'.
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
export function suggestOutfits(
  occasion: string,
  eventType: EventType = 'work',
): Promise<WardrobeOutfitResponse> {
  return apiFetch<WardrobeOutfitResponse>('/wardrobe/outfit', {
    method: 'POST',
    body: { occasion, eventType },
  })
}

/** POST /api/wardrobe/today — weather-aware outfits for a city. */
export function whatToWearToday(
  location: string,
  eventType: EventType = 'work',
): Promise<WardrobeTodayResponse> {
  return apiFetch<WardrobeTodayResponse>('/wardrobe/today', {
    method: 'POST',
    body: { location, eventType },
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

/** POST /api/wardrobe/pack — capsule + day plan + essentials for a trip. */
export function packForTrip(params: {
  destination: string
  startDate: string
  endDate: string
  activities?: string
}): Promise<PackingResponse> {
  return apiFetch<PackingResponse>('/wardrobe/pack', { method: 'POST', body: params })
}

/**
 * POST /api/wardrobe/:id/feedback — inline correction ("too formal",
 * "don't suggest this", …). Adjustments, not overwrites.
 */
export function sendItemFeedback(
  id: string,
  signal: FeedbackSignal,
): Promise<{ item: WardrobeItem; adjusted: boolean }> {
  return apiFetch<{ item: WardrobeItem; adjusted: boolean }>(`/wardrobe/${id}/feedback`, {
    method: 'POST',
    body: { signal },
  })
}

/** POST /api/wardrobe/:id/resale-draft — a listing draft for reselling. */
export function getResaleDraft(id: string): Promise<ResaleDraftResponse> {
  return apiFetch<ResaleDraftResponse>(`/wardrobe/${id}/resale-draft`, { method: 'POST' })
}
