import { apiFetch } from './api'
import type { OutfitVerdict } from './types'

export interface BriefItem {
  id: string
  category: string
  subtype: string | null
  imageUrl: string
  primaryColor: string | null
  description: string | null
  /** Wear-ledger facts for the day's tiles (present only on brief items). */
  wears?: number
  costPerWear?: number | null
  isNew?: boolean
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
  /** The stylist's verdict on the look; absent on older responses. */
  verdict?: OutfitVerdict
  /** One line on the member's own picks (POST /brief/plan). */
  opinion?: string
}

export interface EveningLook {
  title: string
  rationale: string
  itemIds: string[]
  items: BriefItem[]
  wornLogId?: string | null
  verdict?: OutfitVerdict
}

export type LookSlotKind = 'morning' | 'afternoon' | 'evening' | 'custom'

/** One look in the day's timeline — a time-of-day slot or a custom ritual. */
export interface LookSlot {
  id: string
  slot: LookSlotKind
  label: string | null
  time: string | null
  occasion: string | null
  rationale: string
  weather: BriefWeather | null
  itemIds: string[]
  items: BriefItem[]
  worn: boolean
  wornLook: { items: BriefItem[]; photoUrl: string | null; instead: boolean } | null
  verdict?: OutfitVerdict
}

export interface BriefResponse {
  mode: 'brief' | 'starter' | 'rest' | 'unplanned'
  brief?: Brief
  worn?: boolean
  evening?: EveningLook | null
  /** The day's ordered looks (morning → …). The first is the main brief. */
  looks?: LookSlot[]
  canUndo?: boolean
  weatherNote?: string | null
  /** The piece from today's look worn most recently before today. */
  lastWorn?: { label: string; days: number } | null
  plannedAt?: string | null
  /** Logged from a photo, and not what was laid out: the truth, with the suggestion kept. */
  wornLook?: { items: BriefItem[]; photoUrl: string | null; instead: boolean } | null
}

export interface WeekDay {
  date: string
  past: boolean
  today: boolean
  rest: boolean
  eventType: string | null
  occasion: string | null
  planned: boolean
  worn: boolean
  wearLogId: string | null
  shared: boolean
  photoUrl: string | null
  /** How many looks the day holds (worn for past days, planned otherwise). */
  lookCount?: number
  itemIds: string[]
  items: BriefItem[]
}

export interface RitualStats {
  streak: number
  /** Lifetime count of wear logs — "128 wears logged". */
  wearsLogged: number
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

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dateKey(new Date(y, m - 1, d + days))
}

export function getBrief(opts: { occasion?: string; refresh?: boolean; eventType?: string; date?: string; peek?: boolean } = {}) {
  const params = new URLSearchParams({ date: opts.date ?? todayKey() })
  if (opts.peek) params.set('peek', '1')
  if (opts.occasion) params.set('occasion', opts.occasion)
  if (opts.eventType) params.set('eventType', opts.eventType)
  if (opts.refresh) params.set('refresh', '1')
  return apiFetch<BriefResponse>(`/brief?${params.toString()}`)
}

/** GET /brief/week — seven days from `from`: what you wore, what's planned. */
export function getWeek(from: string) {
  return apiFetch<{ days: WeekDay[] }>(`/brief/week?from=${from}&today=${todayKey()}`)
}

/** POST /brief/plan — name a day: an event type, an occasion, or a home day. */
export function planDay(body: { date: string; eventType?: string; occasion?: string; rest?: boolean; itemIds?: string[]; title?: string }) {
  return apiFetch<BriefResponse>('/brief/plan', { method: 'POST', body })
}

export function undoBrief(date = todayKey()) {
  return apiFetch<BriefResponse>('/brief/undo', { method: 'POST', body: { date } })
}

export function composeEvening(occasion?: string, date = todayKey()) {
  return apiFetch<BriefResponse>('/brief/evening', { method: 'POST', body: { date, ...(occasion ? { occasion } : {}) } })
}

/** POST /brief/look — add another look to the day's timeline. */
export function composeLook(
  body: { slot?: LookSlotKind; label?: string; time?: string; occasion?: string },
  date = todayKey(),
) {
  return apiFetch<BriefResponse>('/brief/look', { method: 'POST', body: { date, ...body } })
}

/** DELETE /brief/look — remove an unworn look from the day. */
export function removeLook(lookId: string, date = todayKey()) {
  return apiFetch<BriefResponse>('/brief/look', { method: 'DELETE', body: { date, lookId } })
}

export function weatherCheck(date = todayKey()) {
  return apiFetch<{ note: string | null }>('/brief/weather', { method: 'POST', body: { date } })
}

/** Log a look as worn. Pass a `lookId` for the timeline model; `act` is the
 *  legacy two-act fallback. Defaults to the first (morning) look. */
export function wearBrief(
  itemIds?: string[],
  target: { lookId?: string; act?: 'morning' | 'evening' } = {},
  date = todayKey(),
) {
  return apiFetch<{ log: { id: string }; alreadyLogged: boolean }>('/brief/wear', {
    method: 'POST',
    body: {
      date,
      ...(target.lookId ? { lookId: target.lookId } : {}),
      ...(target.act ? { act: target.act } : {}),
      ...(itemIds ? { itemIds } : {}),
    },
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

/** The plan as composed, stored with the trip. */
export interface TripPlan {
  rationale: string
  essentials: string[]
  /** The traveller's own checklist items. */
  custom?: string[]
  forecast: import('./types').TripForecast
  days: {
    label: string
    note: string
    itemIds: string[]
    looks?: { id: string; label?: string | null; time?: string | null; occasion?: string | null; itemIds: string[] }[]
    verdict?: OutfitVerdict
  }[]
}

export interface Trip {
  id: string
  destination: string
  startDate: string
  endDate: string
  activities: string | null
  packedItemIds: string[]
  /** Checklist ticks: "item-<id>" and "extra-<text>". */
  checked: string[]
  plan: TripPlan | null
}

export interface TripDayLook {
  id: string
  label: string | null
  time: string | null
  occasion: string | null
  items: import('./types').WardrobeItem[]
}

export interface TripPage {
  trip: Trip
  capsule: import('./types').WardrobeItem[]
  days: { label: string; note: string; items: import('./types').WardrobeItem[]; looks: TripDayLook[]; verdict?: OutfitVerdict }[]
  /** Once the trip is over: what was packed and never worn. */
  recap: { packed: number; worn: number; unworn: import('./types').WardrobeItem[] } | null
}

/** Upcoming (and current) trips, and the last few that ended. */
export function getTrips() {
  return apiFetch<{ trips: Trip[]; past: Trip[] }>('/trips')
}
export function getTrip(id: string) {
  return apiFetch<TripPage>(`/trips/${id}`)
}
export function createTrip(data: {
  destination: string
  startDate: string
  endDate: string
  activities?: string | null
  packedItemIds: string[]
  plan?: TripPlan
}) {
  return apiFetch<{ trip: Trip }>('/trips', { method: 'POST', body: data })
}
export function updateTrip(id: string, data: { checked?: string[]; packedItemIds?: string[]; activities?: string | null }) {
  return apiFetch<{ trip: Trip }>(`/trips/${id}`, { method: 'PATCH', body: data })
}
/** "Not this": swap a packed piece for the closest thing you own. */
export function swapTripItem(id: string, itemId: string) {
  return apiFetch<{ trip: Trip; swappedFor: import('./types').WardrobeItem }>(`/trips/${id}/swap`, { method: 'POST', body: { itemId } })
}
/** Replan one look of a day from the capsule (the day's first look by default). */
export function replanTripDay(id: string, index: number, lookId?: string) {
  return apiFetch<{ trip: Trip }>(`/trips/${id}/days/${index}/replan`, { method: 'POST', body: lookId ? { lookId } : {} })
}
/** Add another look to a trip day (a flight outfit then a dinner, a ritual). */
export function addTripLook(id: string, index: number, body: { label?: string; time?: string; occasion?: string; eventType?: string } = {}) {
  return apiFetch<{ trip: Trip }>(`/trips/${id}/days/${index}/looks`, { method: 'POST', body })
}
/** Remove a look from a trip day (keeps at least one). */
export function removeTripLook(id: string, index: number, lookId: string) {
  return apiFetch<{ trip: Trip }>(`/trips/${id}/days/${index}/looks/${lookId}`, { method: 'DELETE' })
}
/** Build a look by hand: set its pieces from the packed capsule. */
export function setTripLookItems(id: string, index: number, lookId: string, itemIds: string[]) {
  return apiFetch<{ trip: Trip }>(`/trips/${id}/days/${index}/looks/${lookId}/items`, { method: 'POST', body: { itemIds } })
}
/** Add / remove a traveller's own checklist item. */
export function addChecklistItem(id: string, text: string) {
  return apiFetch<{ trip: Trip }>(`/trips/${id}/checklist`, { method: 'POST', body: { add: text } })
}
export function removeChecklistItem(id: string, text: string) {
  return apiFetch<{ trip: Trip }>(`/trips/${id}/checklist`, { method: 'POST', body: { remove: text } })
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
