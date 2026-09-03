// The Mirror's reads and small helpers: every query keyed from `qk` so other
// rooms invalidating the same keys refresh this room too, and every mutation
// in a screen invalidates what it touched.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getLookbooks } from '@zauq/shared/brief'
import { getPhoto, getTryOn, getTryOns, getUsage } from '@zauq/shared/tryon'
import type { PhotoResponse, PhotoUploadResponse, TryOn } from '@zauq/shared/types'
import { getWardrobe } from '@zauq/shared/wardrobe'
import { useCallback } from 'react'
import { apiUpload } from '@/src/lib/api'
import { qk } from '@/src/lib/query'
import { imageForm, type PickedImage } from '@/src/lib/upload'

export function useReflections() {
  return useQuery({ queryKey: qk.reflections, queryFn: getPhoto })
}

export function useTryOns() {
  return useQuery({ queryKey: qk.tryons, queryFn: getTryOns })
}

export function useUsage() {
  return useQuery({ queryKey: qk.usage, queryFn: getUsage })
}

export function useLookbooks() {
  return useQuery({ queryKey: qk.lookbooks, queryFn: getLookbooks })
}

/** Pieces the Mirror can dress you in: catalogued, and yours. */
export function useCloset() {
  return useQuery({
    queryKey: qk.wardrobe,
    queryFn: getWardrobe,
    select: (r) => (r.items ?? []).filter((i) => i.status === 'ready' && i.owned !== false),
  })
}

/** One render; polls every 2.5s while it is a job and `live` is true (the screen is focused). */
export function useTryOnQuery(id: string, live: boolean, placeholder?: TryOn) {
  return useQuery({
    queryKey: qk.tryon(id),
    queryFn: () => getTryOn(id),
    placeholderData: placeholder ? { tryOn: placeholder } : undefined,
    refetchInterval: (query) => (live && isLive(query.state.data?.tryOn) ? 2500 : false),
  })
}

/** Everything a render touches, after any mutation on it. */
export function useInvalidateMirror() {
  const qc = useQueryClient()
  return useCallback(
    (...extra: readonly (readonly unknown[])[]) => {
      void qc.invalidateQueries({ queryKey: qk.tryons })
      void qc.invalidateQueries({ queryKey: qk.usage })
      void qc.invalidateQueries({ queryKey: qk.lookbooks })
      for (const key of extra) void qc.invalidateQueries({ queryKey: key })
    },
    [qc],
  )
}

/** POST /photo with the consent that travels with it (the web's `uploadPhoto`, for a picked image). */
export function uploadReflection(image: PickedImage): Promise<PhotoUploadResponse & PhotoResponse> {
  return apiUpload<PhotoUploadResponse & PhotoResponse>('/photo', imageForm('photo', image, { consent: 'true' }))
}

export function pieceLabel(p: { category: string; subtype: string | null }): string {
  return p.subtype ?? p.category
}

export function renderLabel(t: TryOn): string {
  const pieces = (t.items ?? []).map(pieceLabel).join(' · ')
  if (pieces) return pieces
  return new Date(t.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function isLive(t?: TryOn | null): boolean {
  return t?.status === 'queued' || t?.status === 'rendering'
}

export function isReady(t?: TryOn | null): boolean {
  return !!t && (t.status === 'ready' || !t.status)
}

/** The atelier's lines while a render is a job. */
export const DRESSING_LINES = ['Taking your measure…', 'Cutting the pieces…', 'Fitting the shoulders…', 'Setting the light…', 'Checking the proportions…']

/** The consent line, verbatim from the web's photo door. */
export const CONSENT_LINE = 'I agree my photo is stored to generate try-on images. It’s used only for this, never shared, and I can delete it anytime.'
