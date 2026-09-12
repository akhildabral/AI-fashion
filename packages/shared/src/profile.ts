import { apiFetch } from './api'
import type { FitBrandsResponse, FitReference, InferredRange, Measurements, StyleProfile } from './types'

// The profile's small edits that are not part of the fitting's PUT.

/** PATCH /api/profile { measurements } — optional, used for fit and nothing else. `null` clears them. */
export function updateMeasurements(measurements: Measurements | null): Promise<{ profile: StyleProfile }> {
  return apiFetch<{ profile: StyleProfile }>('/profile', { method: 'PATCH', body: { measurements } })
}

const CM_PER_IN = 2.54

/** A measurement in the other unit, to one decimal. */
export function convertMeasurement(value: number, from: 'cm' | 'in', to: 'cm' | 'in'): number {
  if (from === to) return value
  const out = from === 'cm' ? value / CM_PER_IN : value * CM_PER_IN
  return Math.round(out * 10) / 10
}

/** The same measurements, re-expressed in another unit. */
export function convertMeasurements(m: Measurements, to: 'cm' | 'in'): Measurements {
  if (m.unit === to) return m
  const conv = (v: number | null | undefined) => (v == null ? v : convertMeasurement(v, m.unit, to))
  return { ...m, unit: to, chest: conv(m.chest), waist: conv(m.waist), hips: conv(m.hips), shoulder: conv(m.shoulder), inseam: conv(m.inseam) }
}

// ---- Fit references: "an M in Zara" instead of a tape measure --------------

/** GET /api/profile/fit-brands — the brands, sizes and shoe scales the "What fits you" card offers. */
export function getFitBrands(gender?: FitBrandsResponse['gender']): Promise<FitBrandsResponse> {
  return apiFetch<FitBrandsResponse>(`/profile/fit-brands${gender ? `?gender=${gender}` : ''}`)
}

/** PATCH /api/profile { fitReferences } — replaces the set on file; [] clears it. The server recomputes the inferred range. */
export function updateFitReferences(references: FitReference[]): Promise<{ profile: StyleProfile }> {
  return apiFetch<{ profile: StyleProfile }>('/profile', { method: 'PATCH', body: { fitReferences: references } })
}

/** "Zara M", "Levi's 32", "Nike UK 9" — a reference in words. */
export function referenceWords(ref: FitReference, names: Record<string, string> = {}): string {
  const brand = names[ref.brand] ?? ref.brand
  return ref.category === 'shoes' ? `${brand} ${ref.scale ?? 'EU'} ${ref.size}` : `${brand} ${ref.size}`
}

function span(r: InferredRange | null | undefined, unit: 'cm' | 'in'): string | null {
  if (!r) return null
  const lo = convertMeasurement(r.lo, 'cm', unit)
  const hi = convertMeasurement(r.hi, 'cm', unit)
  const f = (n: number) => (unit === 'cm' ? String(Math.round(n)) : String(Math.round(n * 2) / 2))
  return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`
}

/**
 * The inferred range in the stylist's voice: "From your Zara M and Levi's 32,
 * I'd put your chest at 96–100 cm and your waist at 81–84. Correct me if
 * that's off." Null until a reference has been read.
 */
export function inferredLine(m: Measurements | null | undefined, names: Record<string, string> = {}, unit: 'cm' | 'in' = 'cm'): string | null {
  const refs = m?.references ?? []
  const inf = m?.inferred
  if (!refs.length || !inf) return null
  const parts = [
    ['chest', inf.chest],
    ['waist', inf.waist],
    ['hips', inf.hips],
    ['inseam', inf.inseam],
  ] as const
  const said: [string, string][] = []
  for (const [k, r] of parts) {
    const v = span(r, unit)
    if (v) said.push([k, v])
  }
  const from = refs.map((r) => referenceWords(r, names))
  const fromWords = from.length > 1 ? `${from.slice(0, -1).join(', ')} and ${from[from.length - 1]}` : from[0]
  if (!said.length) {
    return `From your ${fromWords} I can size your shoes, but nothing about your build yet; add a top or a bottom.`
  }
  const measures = said.map(([k, v], i) => `your ${k} at ${v}${i === 0 ? ` ${unit}` : ''}`)
  const measureWords = measures.length > 1 ? `${measures.slice(0, -1).join(', ')} and ${measures[measures.length - 1]}` : measures[0]
  const hedge = m?.confidence === 'low' ? ' Those two brands disagree a little, so treat it as a guess.' : ' Correct me if that’s off.'
  return `From your ${fromWords}, I’d put ${measureWords}.${hedge}`
}
