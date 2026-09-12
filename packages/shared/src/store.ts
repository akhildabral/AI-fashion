import { ApiError, apiFetch } from './api'
import type {
  FromLinkResponse,
  IngestSource,
  LinkRead,
  LinkReadFailure,
  TryOn,
  VerdictV2,
  WardrobeItem,
  WardrobeItemEdit,
  WardrobeItemResponse,
} from './types'

// The Fitting Room: a piece from a link, a photo or a screenshot, read
// against the closet. Every call here is member-initiated; nothing fetches
// a shop page on its own.

/** A refusal the reader sends back, as data (422 on import, 200 on preview). */
function asReadFailure(body: unknown): LinkReadFailure | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Partial<LinkReadFailure>
  if (b.ok !== false || typeof b.reason !== 'string') return null
  return { ok: false, reason: b.reason, retailer: b.retailer ?? null, message: b.message ?? '' }
}

/** GET /api/link/preview?url= — what the shop says about the piece, before anything is kept. */
export async function previewLink(url: string): Promise<LinkRead | LinkReadFailure> {
  try {
    return await apiFetch<LinkRead | LinkReadFailure>(`/link/preview?url=${encodeURIComponent(url)}`)
  } catch (err) {
    const failure = err instanceof ApiError ? asReadFailure(err.body) : null
    if (failure) return failure
    throw err
  }
}

/**
 * POST /api/wardrobe/from-link — keep the piece as a candidate and start its
 * verdict. A shop the reader cannot open comes back as a `LinkReadFailure`
 * (the 422 body), never as a thrown error, so the screenshot door can open.
 */
export async function importFromLink(url: string, source: IngestSource = 'link'): Promise<FromLinkResponse | LinkReadFailure> {
  try {
    return await apiFetch<FromLinkResponse>('/wardrobe/from-link', { method: 'POST', body: { url, source } })
  } catch (err) {
    const failure = err instanceof ApiError && err.status === 422 ? asReadFailure(err.body) : null
    if (failure) return failure
    throw err
  }
}

/** POST /api/wardrobe/:id/reread — read the candidate again from its source (link or photo). */
export function rereadCandidate(id: string): Promise<{ item: WardrobeItem }> {
  return apiFetch<{ item: WardrobeItem }>(`/wardrobe/${id}/reread`, { method: 'POST' })
}

export type CandidateTryOnResult =
  | { ok: true; tryOn: Pick<TryOn, 'id' | 'status'> & Partial<TryOn> }
  | { ok: false; reason: 'no-reflection'; message: string }

/**
 * POST /api/wardrobe/:id/tryon — the candidate on your reflection. Without a
 * reflection the answer is `{ ok: false, reason: 'no-reflection' }` so the
 * page can point at the Mirror instead of failing.
 */
export async function candidateTryOn(id: string): Promise<CandidateTryOnResult> {
  try {
    const r = await apiFetch<{ tryOn: Pick<TryOn, 'id' | 'status'> & Partial<TryOn> }>(`/wardrobe/${id}/tryon`, { method: 'POST' })
    return { ok: true, tryOn: r.tryOn }
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      const b = err.body as { reason?: string; error?: string } | undefined
      if (b?.reason === 'no-reflection') return { ok: false, reason: 'no-reflection', message: b.error ?? err.message }
    }
    throw err
  }
}

/** One garment the reader found in a photo of several. */
export interface DetectedGarment {
  index: number
  label?: string | null
  category?: string | null
  /** A crop of just this garment, when the reader made one. */
  imageUrl?: string | null
}

/** POST /api/wardrobe with owned=false can find several garments; the member picks one. */
export type CandidateUploadResponse = WardrobeItemResponse & { detected?: DetectedGarment[] }

/** POST /api/wardrobe/:id/choose-garment — only the chosen one is catalogued. */
export function chooseGarment(id: string, index: number): Promise<{ item: WardrobeItem }> {
  return apiFetch<{ item: WardrobeItem }>(`/wardrobe/${id}/choose-garment`, { method: 'POST', body: { index } })
}

export interface OutboundLink {
  url: string
  /** True when the link is wrapped in an affiliate programme; label it. */
  affiliate: boolean
  retailer: string | null
}

/** GET /api/wardrobe/:id/outbound — the way back to the shop. */
export function outboundLink(id: string): Promise<OutboundLink> {
  return apiFetch<OutboundLink>(`/wardrobe/${id}/outbound`)
}

export type NudgeIn = 'fortnight' | 'month' | 'never'

/** The edits a candidate accepts beyond a piece's: the nudge as a choice, and the gap opt-out. */
export type CandidateEdit = WardrobeItemEdit & { nudgeIn?: NudgeIn; gapOptOut?: boolean }

/** PATCH /api/wardrobe/:id — send only what changed; store and price are never wiped by omission. */
export function updateCandidate(id: string, edits: CandidateEdit): Promise<WardrobeItemResponse> {
  return apiFetch<WardrobeItemResponse>(`/wardrobe/${id}`, { method: 'PATCH', body: edits })
}

/** The nudge: a fortnight, a month, or never (`null` cancels one already set). */
export function setNudge(id: string, nudgeIn: NudgeIn | null): Promise<WardrobeItemResponse> {
  return updateCandidate(id, nudgeIn === null || nudgeIn === 'never' ? { nudgeIn: 'never', nudgeAt: null } : { nudgeIn })
}

/** "Don't suggest this": keep the piece out of the Closet's gaps rail. */
export function setGapOptOut(id: string, gapOptOut = true): Promise<WardrobeItemResponse> {
  return updateCandidate(id, { gapOptOut })
}

// ---- Compare two --------------------------------------------------------------

export type CompareLean = 'a' | 'b' | 'tie'

/** Which side has the edge on each plaque, read deterministically off the two verdicts. */
export interface CompareEdge {
  outfits: CompareLean
  duplicate: CompareLean
  taste: CompareLean
  budget: CompareLean
  build: CompareLean
  overall: CompareLean
}

export interface CompareSide {
  item: WardrobeItem
  v2: VerdictV2
}

export interface CompareResponse {
  a: CompareSide
  b: CompareSide
  edge: CompareEdge
  /** One line in the stylist's voice: who earns its place, and why the other would wait. */
  line: string
}

/**
 * GET /api/wardrobe/compare?a=&b= — two candidates side by side. Both
 * verdicts come from the cache; a piece still developing answers 202 with
 * `{ status: 'processing' }`, so the page polls until both settle.
 */
export function compareCandidates(a: string, b: string): Promise<CompareResponse | { status: 'processing' }> {
  const q = new URLSearchParams({ a, b })
  return apiFetch<CompareResponse | { status: 'processing' }>(`/wardrobe/compare?${q.toString()}`)
}
