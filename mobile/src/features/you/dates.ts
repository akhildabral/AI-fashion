// Date helpers shared by the record and the trips: local day keys, month
// keys, and the short human forms the web uses.
import type { EventType } from '@zauq/shared/types'

export const pad = (n: number) => String(n).padStart(2, '0')

/** Local YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
/** Noon on a day key, so the weekday never slips across a timezone. */
export function atNoon(key: string): Date {
  return new Date(`${key}T12:00:00`)
}
/** "Tue 3 Sep" from an ISO date-time or a day key. */
export function formatDay(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? atNoon(iso) : new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
/** "September 2026" from a month key. */
export function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + by, 1))
}
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
/** Inclusive day count between two day keys. */
export function nights(a: string, b: string): number {
  return Math.round((atNoon(b).getTime() - atNoon(a).getTime()) / 86_400_000) + 1
}
export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(atNoon(s).getTime())

export const OCCASIONS: { key: EventType; label: string }[] = [
  { key: 'work', label: 'Work' },
  { key: 'casual', label: 'Weekend' },
  { key: 'evening', label: 'Evening' },
  { key: 'occasion', label: 'Occasion' },
  { key: 'athletic', label: 'Athletic' },
]
export const occasionLabel = (k: string | null | undefined): string | null =>
  OCCASIONS.find((o) => o.key === k)?.label ?? (k ? k[0].toUpperCase() + k.slice(1) : null)
