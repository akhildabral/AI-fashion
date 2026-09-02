import { apiFetch } from './api'

export interface BriefItem {
  id: string
  category: string
  subtype: string | null
  imageUrl: string
  primaryColor: string | null
  description: string | null
}

export interface BriefWeather {
  temperatureC: number
  description: string
  location: string
}

export interface Brief {
  title: string
  rationale: string
  itemIds: string[]
  eventType: string
  occasion: string | null
  weather: BriefWeather | null
  trip?: { destination: string; endDate: string } | null
  items: BriefItem[]
}

export interface BriefResponse {
  mode: 'brief' | 'starter'
  brief?: Brief
  worn?: boolean
}

export interface RitualStats {
  streak: number
  monthlyPayback: number
  rotationPct: number
  activeItems: number
  wornThisQuarter: number
  priceBreaks: { itemId: string; label: string; cpw: number; threshold: number }[]
  outfitsThisWeek: number
}

export interface FeedCard {
  type: 'ootd' | 'pick_received' | 'poll_result' | 'poll_open' | 'new_follower' | 'style_a_friend'
  at: string
  [key: string]: unknown
}

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getBrief(opts: { occasion?: string; refresh?: boolean } = {}) {
  const params = new URLSearchParams({ date: todayKey() })
  if (opts.occasion) params.set('occasion', opts.occasion)
  if (opts.refresh) params.set('refresh', '1')
  return apiFetch<BriefResponse>(`/brief?${params.toString()}`)
}

export function wearBrief(itemIds?: string[]) {
  return apiFetch<{ log: { id: string }; alreadyLogged: boolean }>('/brief/wear', {
    method: 'POST',
    body: { date: todayKey(), ...(itemIds ? { itemIds } : {}) },
  })
}

export function swapBriefItem(outId: string, inId: string) {
  return apiFetch<{ brief: Brief }>('/brief/swap', {
    method: 'POST',
    body: { date: todayKey(), outId, inId },
  })
}

export function getBriefAlternatives(slot: string, excludeIds: string[]) {
  const params = new URLSearchParams({ slot, exclude: excludeIds.join(',') })
  return apiFetch<{ alternatives: BriefItem[] }>(`/brief/alternatives?${params.toString()}`)
}

export function getRitualStats() {
  return apiFetch<RitualStats>('/stats/ritual')
}

export function getFeed() {
  return apiFetch<{ cards: FeedCard[] }>('/feed')
}

export function shareBrief() {
  return apiFetch<{ shared: boolean; wearLogId?: string }>('/brief/share', {
    method: 'POST',
    body: { date: todayKey() },
  })
}

export interface RecreatePair {
  source: { id: string; imageUrl: string; label: string }
  match: { id: string; imageUrl: string; label: string }
}
export interface RecreateMissing {
  source: { id: string; imageUrl: string; label: string }
  wanted: string
}
export interface RecreateResponse {
  pairs: RecreatePair[]
  missing: RecreateMissing[]
  closetSize: number
}

export function recreateFromCloset(itemIds: string[]) {
  return apiFetch<RecreateResponse>('/recreate', { method: 'POST', body: { itemIds } })
}

export interface GapSuggestion {
  category: string
  wanted: string
  unlocks: number
}

export function getClosetGaps() {
  return apiFetch<{ suggestions: GapSuggestion[]; outfitsPossible: number }>('/stats/gaps')
}

export interface Trip {
  id: string
  destination: string
  startDate: string
  endDate: string
  activities: string | null
  packedItemIds: string[]
}

export function getTrips() {
  return apiFetch<{ trips: Trip[] }>('/trips')
}
export function createTrip(data: {
  destination: string
  startDate: string
  endDate: string
  activities?: string | null
  packedItemIds: string[]
}) {
  return apiFetch<{ trip: Trip }>('/trips', { method: 'POST', body: data })
}
export function deleteTrip(id: string) {
  return apiFetch<void>(`/trips/${id}`, { method: 'DELETE' })
}

export interface Lookbook {
  id: string
  name: string
  tryOnIds: string[]
}

export function getLookbooks() {
  return apiFetch<{ lookbooks: Lookbook[] }>('/lookbooks')
}
export function createLookbook(name: string) {
  return apiFetch<{ lookbook: Lookbook }>('/lookbooks', { method: 'POST', body: { name } })
}
export function toggleLookbookItem(id: string, tryOnId: string) {
  return apiFetch<{ lookbook: Lookbook; added: boolean }>(`/lookbooks/${id}/toggle`, {
    method: 'POST',
    body: { tryOnId },
  })
}
export function deleteLookbook(id: string) {
  return apiFetch<void>(`/lookbooks/${id}`, { method: 'DELETE' })
}

export interface ExploreCard {
  type: 'ootd'
  wearLogId: string
  at: string
  handle: string | null
  eventType: string | null
  featured: boolean
  items: { id: string; imageUrl: string; subtype: string | null; category: string }[]
}

export function getExplore() {
  return apiFetch<{ cards: ExploreCard[] }>('/explore')
}
export function toggleFeature(wearLogId: string) {
  return apiFetch<{ featured: boolean }>(`/explore/${wearLogId}/feature`, { method: 'POST' })
}
