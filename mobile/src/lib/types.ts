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
  /** Taste-quiz output; null until the quiz has been taken. */
  styleSignals?: { signals: string[]; takenAt: string } | null
}

// ---- Taste quiz (cold-start personalization) ----

export interface QuizSide {
  label: string
  imageUrl: string
}

export interface QuizPair {
  id: string
  question: string
  left: QuizSide
  right: QuizSide
}

export interface QuizResponse {
  pairs: QuizPair[]
}

export interface ProfileResponse {
  profile: StyleProfile | null
}

/**
 * The outfit object shape is intentionally loose — the backend may return
 * different structures. UI code renders it defensively. The current contract is
 * `{ items: { top, bottom, outerwear, footwear, accessories[] }, palette[] }`.
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
  /** The untouched upload; present when it differs from the cleaned display image. */
  originalUrl: string | null
  /** Cataloging pipeline state: uploads start as 'processing' and flip to 'ready' (or 'failed'). */
  status: 'processing' | 'ready' | 'failed'
  category: string
  subtype: string | null
  primaryColor: string | null
  pattern: string | null
  formality: string | null
  season: string[]
  material: string | null
  description: string | null
  /** Availability: clean | in-wash | packed | lent-out | retired. */
  state: string
  /** Hidden from suggestion pools ("don't suggest this"). */
  suppressed: boolean
  /** What the item cost — powers cost-per-wear. */
  price: number | null
  layerRole: string | null
  warmthValue: number | null
  formalityScore: number | null
  createdAt: string
}

export type EventType = 'work' | 'casual' | 'evening' | 'occasion' | 'athletic'

/** Result of the deterministic outfit validation attached to each suggestion. */
export interface OutfitValidation {
  ok: boolean
  score: number
  violations: { rule: string; message: string }[]
  warnings: { rule: string; message: string }[]
}

/** Fields the user is allowed to correct via PATCH /api/wardrobe/:id. */
export interface WardrobeItemEdit {
  suppressed?: boolean
  price?: number | null
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
  validation?: OutfitValidation
}

export interface WardrobeItemResponse {
  item: WardrobeItem
  /** POST /api/wardrobe can detect several garments in one photo — one entry each. */
  items?: WardrobeItem[]
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

/** Shape of a file picked from the camera/library, ready for FormData upload. */
export interface PickedImage {
  uri: string
  name: string
  type: string
}

// ---- Wear log (the core dataset: what was actually worn, when) ----

export interface WearLogEntry {
  id: string
  itemIds: string[]
  /** Items resolved server-side; deleted items simply drop out. */
  items: WardrobeItem[]
  outfitId: string | null
  wornOn: string
  eventType: EventType | null
  weather: WardrobeWeather | null
  rating: number | null
  createdAt: string
}

export interface WearLogListResponse {
  logs: WearLogEntry[]
}

export interface WearInsightItem {
  itemId: string
  imageUrl: string
  category: string
  subtype: string | null
  wearCount: number
  lastWorn: string | null
  /** Not worn (or never worn since adding) for 90+ days. */
  orphan: boolean
  price: number | null
  /** price / wears so far; equals price while unworn; null without a price. */
  costPerWear: number | null
}

export interface WearInsightsResponse {
  items: WearInsightItem[]
  totals: {
    items: number
    logged: number
    orphans: number
  }
}

// ---- Travel packing ----

export interface ForecastDay {
  date: string
  minC: number
  maxC: number
  description: string
  rainChance: boolean
}

export interface TripForecast {
  location: string
  days: ForecastDay[]
  partial: boolean
}

export interface PackedDay {
  label: string
  items: WardrobeItem[]
  note: string
}

export interface PackingPlan {
  capsule: WardrobeItem[]
  rationale: string
  days: PackedDay[]
  essentials: string[]
}

export interface PackingResponse {
  forecast: TripForecast
  plan: PackingPlan
}

/** Inline correction signals on a suggested item (plan §4.3). */
export type FeedbackSignal =
  | 'too-formal'
  | 'too-casual'
  | 'too-warm'
  | 'not-warm-enough'
  | 'wrong-color'
  | 'dont-suggest'
