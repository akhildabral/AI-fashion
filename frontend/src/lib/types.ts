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
