export interface User {
  id: string
  email: string
  role?: string
  status?: string
  handle?: string | null
  name?: string
  firstName?: string | null
  lastName?: string | null
}

/** Register no longer returns a token (waitlist) — except for bootstrap admins. */
export interface RegisterResponse {
  user: User
  token?: string
  message: string
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
  city?: string | null
  styleFor?: string | null
  /** ISO 4217 code the member keeps their books in. */
  currency?: string | null
  bodyType: string
  heightCm: number
  sizes: ProfileSizes
  skinTone: string
  styleVibe: string
  budgetBand: string
  avoidColors: string[]
  /** Taste-quiz output; null until the quiz has been taken. */
  styleSignals?: { signals: string[]; takenAt: string } | null
  /** The fitting: what matters most, the days they dress for, and progress. */
  intents?: string[]
  occasions?: string[]
  fittingStep?: number
  fittingCompletedAt?: string | null
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
export interface Reflection {
  id: string
  url: string
  active: boolean
  consentAt: string
  createdAt: string
}
export interface PhotoResponse {
  photoUrl: string | null
  photos?: Reflection[]
  max?: number
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
  /** A render is a job: queued → rendering → ready | failed. */
  status?: 'queued' | 'rendering' | 'ready' | 'failed'
  error?: string | null
  itemIds?: string[]
  items?: { id: string; imageUrl: string; category: string; subtype: string | null }[]
  mode?: string | null
  refunded?: boolean
  retryOf?: string | null
  reportedAt?: string | null
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
  wearsSinceWash?: number
  washedAt?: string | null
  owned?: boolean
  seenAt?: string | null
  seenPrice?: number | null
  store?: string | null
  nudgeAt?: string | null
  brand?: string | null
  size?: string | null
  /** Hidden from suggestion pools ("don't suggest this"). */
  suppressed: boolean
  /** What the item cost — powers cost-per-wear. */
  price: number | null
  /** Community visibility: private (default) or public (shown on your profile). */
  visibility: 'private' | 'public'
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
  visibility?: 'private' | 'public'
  price?: number | null
  category?: string
  subtype?: string
  primaryColor?: string
  pattern?: string
  formality?: string
  season?: string[]
  material?: string
  description?: string
  suppressed?: boolean
  state?: 'clean' | 'in-wash' | 'packed' | 'lent-out' | 'retired'
  brand?: string | null
  size?: string | null
  owned?: boolean
  store?: string | null
  seenPrice?: number | null
  nudgeAt?: string | null
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
  /** "Again?": 5 = again, 1 = not this one. */
  rating: number | null
  /** The day's photo (uploaded, or a Mirror render). */
  photoUrl: string | null
  /** Set while the day is on the circle. */
  sharedAt: string | null
  createdAt: string
}

export interface WearLogListResponse {
  logs: WearLogEntry[]
  /** Present when a month was asked for: the logged days as YYYY-MM-DD. */
  days?: string[]
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

/** A ready-to-post secondhand-marketplace listing draft. */
export interface ResaleDraft {
  title: string
  description: string
  suggestedPrice: string
  conditionChecklist: string[]
}

export interface ResaleDraftResponse {
  draft: ResaleDraft
  imageUrl: string
}
