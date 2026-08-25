export interface User {
  id: string
  email: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface MeResponse {
  user: User
}

export interface ProfileSizes {
  top?: string
  bottom?: string
  shoe?: string
}

export interface StyleProfile {
  bodyType: string
  heightCm: number
  sizes: ProfileSizes
  skinTone: string
  styleVibe: string
  budgetBand: string
  avoidColors: string[]
}

export interface ProfileResponse {
  profile: StyleProfile | null
}

/**
 * The outfit object shape is intentionally loose — the backend may return
 * different structures. UI code should render it defensively. The current
 * contract is `{ items: { top, bottom, outerwear, footwear, accessories[] }, palette[] }`.
 */
export type Outfit = Record<string, unknown>

export interface Look {
  id?: string
  occasion?: string
  gender?: string
  outfit?: Outfit
  rationale?: string
  imageUrl?: string | null
  favorite?: boolean
  createdAt?: string
}

/** POST /api/generate now returns multiple looks (was `{ look }` in Phase 0). */
export interface GenerateResponse {
  looks: Look[]
}

export interface LooksResponse {
  looks: Look[]
}

export interface FavoriteResponse {
  look: Look
}

export interface GenerateRequest {
  occasion: string
  gender: string
}

/** The user's uploaded photo used to render try-on images. */
export interface PhotoResponse {
  photoUrl: string | null
}

/** Response from a successful photo upload. */
export interface PhotoUploadResponse {
  photoUrl: string
}

/**
 * A single rendered try-on: the user's photo wearing a saved look, or a set of
 * wardrobe items (in which case `lookId` is null).
 */
export interface TryOn {
  id: string
  lookId: string | null
  imageUrl: string
  createdAt: string
}

export interface TryOnResponse {
  tryOn: TryOn
}

export interface TryOnsResponse {
  tryOns: TryOn[]
}

/** A single owned garment, auto-tagged by a vision model on upload. */
export interface WardrobeItem {
  id: string
  imageUrl: string
  category: string
  subtype: string | null
  primaryColor: string | null
  pattern: string | null
  formality: string | null
  season: string[]
  material: string | null
  description: string | null
  createdAt: string
}

/** Fields the user is allowed to correct via PATCH /api/wardrobe/:id. */
export interface WardrobeItemEdit {
  category?: string
  subtype?: string
  primaryColor?: string
  pattern?: string
  formality?: string
  season?: string[]
  material?: string
  description?: string
}

/** An outfit assembled from the user's owned wardrobe items. */
export interface WardrobeOutfit {
  items: WardrobeItem[]
  rationale: string
}

export interface WardrobeItemResponse {
  item: WardrobeItem
}

export interface WardrobeListResponse {
  items: WardrobeItem[]
}

export interface WardrobeOutfitResponse {
  outfits: WardrobeOutfit[]
}

export interface WardrobeWeather {
  location: string
  temperatureC: number
  description: string
}

export interface WardrobeTodayResponse {
  weather: WardrobeWeather
  outfits: WardrobeOutfit[]
}
