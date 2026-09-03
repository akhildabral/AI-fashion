// The room's lines and small formatters, ported from the web's TodayPage,
// LookAct and DayView so the two apps speak with one voice.
import { todayKey, type BriefItem, type LookSlot, type LookSlotKind, type Trip } from '@zauq/shared/brief'
import { money } from '@zauq/shared/money'
import type { FeedbackSignal } from '@zauq/shared/types'

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function dateLine(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "Wednesday 3 September" for any day key. */
export function longDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "Wed 3 Sep". */
export function shortDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function itemLabel(i: { subtype: string | null; category: string }): string {
  return i.subtype ?? i.category
}

// Small counts read spelled out, per the brand's literary voice ("All four").
const SMALL_NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const spellCount = (n: number): string => SMALL_NUMS[n] ?? String(n)
export const daysAgoPhrase = (n: number): string => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`)

/** The ledger fact under a brief tile: cost per wear, else wears, else new, else colour. */
export function itemSublabel(i: BriefItem): string | undefined {
  if (i.wears && i.wears > 0 && i.costPerWear != null) return `${money(i.costPerWear)} / wear`
  if (i.wears && i.wears > 0) return `${i.wears} ${i.wears === 1 ? 'wear' : 'wears'}`
  if (i.isNew) return 'New this month'
  if (i.primaryColor) return i.primaryColor.replace(/\b\w/g, (c) => c.toUpperCase())
  return undefined
}

export const EVENT_WORD: Record<string, string> = { work: 'work', casual: 'weekend', evening: 'evening', occasion: 'special-occasion', athletic: 'training' }

export const DAY_CHIPS: { key: string; label: string }[] = [
  { key: 'work', label: 'Work' },
  { key: 'casual', label: 'Weekend' },
  { key: 'evening', label: 'Evening' },
  { key: 'occasion', label: 'Occasion' },
  { key: 'athletic', label: 'Training' },
]

// Spoken-language complaints, mapped to the learning-loop signals. The
// backend says whether anything moved, so the note is honest.
export const FEEDBACK: { signal: FeedbackSignal; label: string; done: string }[] = [
  { signal: 'too-formal', label: 'Too formal', done: "Got it. I'll read this one more casual." },
  { signal: 'too-casual', label: 'Too casual', done: "Got it. I'll dress this up a little." },
  { signal: 'too-warm', label: 'Runs warm', done: "Got it. I'll save it for cooler days." },
  { signal: 'not-warm-enough', label: 'Not warm enough', done: "Got it. I'll lean on it when it's cold." },
  { signal: 'wrong-color', label: 'Wrong colour', done: "I'll stop trusting the colour on this one." },
  { signal: 'dont-suggest', label: 'Stop suggesting this', done: "Off the rail. I won't put it forward again." },
]

const SLOT_LABEL: Record<LookSlotKind, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  custom: 'A look',
}

/** The heading for a look: a custom label wins, else the slot's name. */
export function lookTitle(look: Pick<LookSlot, 'slot' | 'label'>): string {
  return look.label?.trim() || SLOT_LABEL[look.slot]
}

/** "7:30 PM" from "19:30". */
export function prettyTime(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

/** When a look begins, in minutes from midnight: its time, else its slot's habit. */
export function lookStart(look: Pick<LookSlot, 'slot' | 'time'>): number {
  if (look.time) {
    const [h, m] = look.time.split(':').map(Number)
    if (!Number.isNaN(h)) return h * 60 + (m || 0)
  }
  return look.slot === 'evening' ? 18 * 60 : look.slot === 'afternoon' ? 13 * 60 : look.slot === 'morning' ? 7 * 60 : 12 * 60
}

/**
 * Which act the clock is on: the last look that has begun, else the first.
 * Only today has a clock; another day's first look is its act.
 */
export function currentActIndex(looks: Pick<LookSlot, 'slot' | 'time'>[], date: string): number {
  if (looks.length === 0) return 0
  if (date !== todayKey()) return 0
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  let idx = 0
  looks.forEach((l, i) => {
    if (lookStart(l) <= minutes) idx = i
  })
  return idx
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function tripIsTomorrow(t: Trip): boolean {
  const tm = new Date()
  tm.setDate(tm.getDate() + 1)
  return t.startDate === localDay(tm)
}

export function tripIsOn(t: Trip): boolean {
  const today = localDay(new Date())
  return t.startDate <= today && t.endDate >= today
}

/** "3 Sep" from an ISO day. */
export function tripDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** The first name from whatever the account knows. */
export function firstName(user: { firstName?: string | null; name?: string; handle?: string | null; email?: string } | null): string {
  const raw = user?.firstName ?? user?.name?.split(' ')[0] ?? user?.handle ?? user?.email?.split('@')[0] ?? 'there'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/** A validated "HH:MM" from what someone typed, or null. */
export function normalizeTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? '0')
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}
