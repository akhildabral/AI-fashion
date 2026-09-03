// The Closet's reads, all through the query cache so every room renders its
// last data at once and revalidates behind it; and the small helpers every
// room shares (a piece's name, its cost-per-wear line, what counts as new).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getClosetGaps, getRitualStats } from '@zauq/shared/brief'
import { money } from '@zauq/shared/money'
import { getOutfits, getPairs, getStory } from '@zauq/shared/outfits'
import type { WardrobeItem, WearInsightItem } from '@zauq/shared/types'
import { getBasket, getVerdict, getWardrobe, getWardrobeItem, getWishlist } from '@zauq/shared/wardrobe'
import { getWearInsights } from '@zauq/shared/wearlog'
import { qk } from '@/src/lib/query'
import { ck } from './keys'

const MONTH_MS = 30 * 86_400_000
const PROCESSING_POLL_MS = 3000

export type Insights = Map<string, WearInsightItem>

/** The verdict a wishlist row carries (the API attaches it to `owned=false` pieces). */
export interface Verdict {
  outfits: number
  pairs: number
  closetSize: number
  computedAt: string
}
export type WishItem = WardrobeItem & { verdict?: Verdict | null }

// ---- words ----

export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** "shirt", "trousers": the type, or the category when the photo gave no type. */
export const nameOf = (it: Pick<WardrobeItem, 'subtype' | 'category'>) => it.subtype?.trim() || it.category
/** "navy shirt": colour and type, as the stylist says it. */
export const labelOf = (it: Pick<WardrobeItem, 'subtype' | 'category' | 'primaryColor'>) => [it.primaryColor, nameOf(it)].filter(Boolean).join(' ')

export function isNew(it: Pick<WardrobeItem, 'createdAt'>): boolean {
  return new Date(it.createdAt ?? 0).getTime() >= Date.now() - MONTH_MS
}

/** The line under a tile: where it is, or what each wear has cost. */
export function cpwLabel(it: WardrobeItem, ins: WearInsightItem | undefined): string {
  if (it.state === 'in-wash') return 'in the wash'
  if (it.state === 'packed') return 'packed'
  if (it.state === 'lent-out') return 'lent out'
  const worn = ins?.wearCount ?? 0
  if (worn > 0 && ins?.costPerWear != null) return `${money(ins.costPerWear)} / wear`
  if (worn > 0) return `${worn} ${worn === 1 ? 'wear' : 'wears'}`
  if (isNew(it)) return 'New this month'
  if (ins?.orphan) return 'Sitting idle'
  return 'Not worn yet'
}

export function daysAgo(iso: string | null | undefined): string {
  if (!iso) return 'not yet'
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

export function ago(iso: string | null): string {
  if (!iso) return 'never'
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} days ago`
  if (d < 365) return `${Math.round(d / 30)} months ago`
  return `${Math.round(d / 365)} years ago`
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// ---- reads ----

const EMPTY: WardrobeItem[] = []

/** The owned pieces, newest first; polls while any is still developing. */
export function useWardrobe() {
  return useQuery({
    queryKey: qk.wardrobe,
    queryFn: getWardrobe,
    select: (r) => r.items ?? EMPTY,
    refetchInterval: (q) => (q.state.data?.items?.some((i) => i.status === 'processing') ? PROCESSING_POLL_MS : false),
  })
}

export function usePiece(id: string) {
  return useQuery({
    queryKey: qk.piece(id),
    queryFn: () => getWardrobeItem(id),
    enabled: !!id,
    select: (r) => r.item,
    refetchInterval: (q) => (q.state.data?.item.status === 'processing' ? PROCESSING_POLL_MS : false),
  })
}

export function useInsights() {
  return useQuery({
    queryKey: qk.insights,
    queryFn: getWearInsights,
    select: (r): Insights => new Map(r.items.map((i) => [i.itemId, i])),
  })
}

export function useRitual() {
  return useQuery({ queryKey: qk.ritual, queryFn: getRitualStats })
}

export function useGaps() {
  return useQuery({ queryKey: qk.gaps, queryFn: getClosetGaps, select: (r) => r.suggestions })
}

export function useBasket() {
  return useQuery({ queryKey: qk.basket, queryFn: getBasket })
}

export function useWishlist() {
  return useQuery({
    queryKey: qk.wishlist,
    queryFn: getWishlist,
    select: (r): WishItem[] => [...(r.items as WishItem[])].sort((a, b) => (b.verdict?.outfits ?? -1) - (a.verdict?.outfits ?? -1)),
  })
}

export function useOutfits() {
  return useQuery({ queryKey: qk.outfits, queryFn: getOutfits, select: (r) => r.outfits.filter((o) => o.items.length > 0) })
}

export function useStory(id: string) {
  return useQuery({ queryKey: ck.story(id), queryFn: () => getStory(id), enabled: !!id })
}

export function usePairs(id: string) {
  return useQuery({ queryKey: ck.pairs(id), queryFn: () => getPairs(id), enabled: !!id })
}

/** A candidate's verdict; polls until the cut-out and tags are in. */
export function useVerdict(id: string | null) {
  return useQuery({
    queryKey: ck.verdict(id ?? ''),
    queryFn: () => getVerdict(id ?? ''),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'processing' || (!q.state.data && q.state.status !== 'error') ? 2500 : false),
    retry: 3,
  })
}

/** Everything a wardrobe mutation can touch. Cheap to over-invalidate; wrong to under. */
export function useInvalidateCloset() {
  const qc = useQueryClient()
  return useCallback(
    (pieceId?: string) => {
      void qc.invalidateQueries({ queryKey: qk.wardrobe })
      void qc.invalidateQueries({ queryKey: qk.basket })
      void qc.invalidateQueries({ queryKey: qk.wishlist })
      void qc.invalidateQueries({ queryKey: qk.outfits })
      void qc.invalidateQueries({ queryKey: qk.insights })
      void qc.invalidateQueries({ queryKey: qk.ritual })
      void qc.invalidateQueries({ queryKey: qk.gaps })
      if (pieceId) void qc.invalidateQueries({ queryKey: qk.piece(pieceId) })
    },
    [qc],
  )
}

/** Column geometry for every garment grid: two tiles across, 12px between. */
export const GRID_GAP = 12
export function tileWidth(screenWidth: number, gutter: number, columns = 2): number {
  return Math.floor((screenWidth - gutter * 2 - GRID_GAP * (columns - 1)) / columns)
}
