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

/**
 * The outfit object shape is intentionally loose — the backend may return
 * different structures. UI code should render it defensively.
 */
export type Outfit = Record<string, unknown>

export interface Look {
  id?: string
  occasion?: string
  gender?: string
  outfit?: Outfit
  rationale?: string
  imageUrl?: string
}

export interface GenerateResponse {
  look: Look
}

export interface GenerateRequest {
  occasion: string
  gender: string
}
