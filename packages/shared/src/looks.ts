import { apiFetch } from './api'
import type { TryOn, WardrobeItem } from './types'

// Inspiration: looks you don't own, for the fun of it.

export interface LookPiece {
  category: 'top' | 'bottom' | 'outerwear' | 'footwear' | 'accessory' | 'dress'
  subtype: string
  color: string
  material: string | null
  pattern: string | null
  render: string
}

export interface InspirationLook {
  id: string
  occasion: string
  gender: string
  outfit: {
    title?: string
    pieces?: LookPiece[]
    palette?: string[]
    items?: { top?: string; bottom?: string; outerwear?: string; footwear?: string; accessories?: string[] }
  }
  rationale: string
  imageUrl: string | null
  favorite: boolean
  verdict: 'keep' | 'no' | null
  createdAt: string
}

export interface RecreateLookResponse {
  pairs: { piece: LookPiece; item: WardrobeItem; band: 'sure' | 'near' | 'new'; score: number; reasons: string[] }[]
  missing: LookPiece[]
  itemIds: string[]
}

export function generateLooks(body: { occasion?: string; surprise?: boolean }) {
  return apiFetch<{ looks: InspirationLook[] }>('/generate', { method: 'POST', body })
}
export function getLooks(kept = false) {
  return apiFetch<{ looks: InspirationLook[] }>(`/looks${kept ? '?kept=1' : ''}`)
}
export function setLookVerdict(id: string, verdict: 'keep' | 'no' | null) {
  return apiFetch<{ look: InspirationLook }>(`/looks/${id}/verdict`, { method: 'POST', body: { verdict } })
}
export function recreateLook(id: string) {
  return apiFetch<RecreateLookResponse>(`/looks/${id}/recreate`, { method: 'POST' })
}
export function tryOnLook(id: string) {
  return apiFetch<{ tryOn: TryOn; cached: boolean }>(`/looks/${id}/tryon`, { method: 'POST' })
}
export function deleteLook(id: string) {
  return apiFetch<void>(`/looks/${id}`, { method: 'DELETE' })
}
