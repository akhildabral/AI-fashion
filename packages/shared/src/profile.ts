import { apiFetch } from './api'
import type { Measurements, StyleProfile } from './types'

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
