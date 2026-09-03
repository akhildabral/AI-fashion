// A piece's facts, in order, each with its source: the same table the web's
// PiecePage keeps, so a fact edited on either app reads the same on both.
import { money } from '@zauq/shared/money'
import type { WardrobeItem } from '@zauq/shared/types'
import { title } from './data'

export type FactKind = 'chips' | 'multi' | 'text' | 'money' | 'note'
export type FactGroup = 'Core' | 'Make' | 'Cut and fit' | 'When' | 'Yours'

export interface Fact {
  key: string
  group: FactGroup
  label: string
  kind: FactKind
  options?: [string, string][]
  /** A per-type detail, stored under details.<key>. */
  detail?: boolean
  /** Only shown for these categories. */
  only?: string[]
  /** Never read from the photo: no source shown until you set it. */
  yours?: boolean
}

export const CATEGORIES: [string, string][] = [['top', 'Top'], ['bottom', 'Bottom'], ['outerwear', 'Outerwear'], ['dress', 'Dress'], ['footwear', 'Footwear'], ['accessory', 'Accessory'], ['other', 'Other']]
export const CUT_FOR: [string, string][] = [['womens', 'Her'], ['mens', 'Him'], ['unisex', 'Anyone']]
const MATERIALS: [string, string][] = [['cotton', 'Cotton'], ['linen', 'Linen'], ['wool', 'Wool'], ['silk', 'Silk'], ['denim', 'Denim'], ['leather', 'Leather'], ['synthetic', 'Synthetic'], ['blend', 'Blend'], ['other', 'Other']]
const PATTERNS: [string, string][] = [['solid', 'Solid'], ['striped', 'Striped'], ['plaid', 'Plaid'], ['checked', 'Checked'], ['floral', 'Floral'], ['graphic', 'Graphic'], ['other', 'Other']]
const TEXTURES: [string, string][] = [['smooth', 'Smooth'], ['woven', 'Woven'], ['knit', 'Knit'], ['ribbed', 'Ribbed'], ['fuzzy', 'Fuzzy'], ['glossy', 'Glossy'], ['other', 'Other']]
const WEIGHTS: [string, string][] = [['light', 'Light'], ['mid', 'Mid'], ['heavy', 'Heavy']]
const FITS: [string, string][] = [['slim', 'Slim'], ['regular', 'Regular'], ['relaxed', 'Relaxed'], ['oversized', 'Oversized']]
const LENGTHS: [string, string][] = [['cropped', 'Cropped'], ['regular', 'Regular'], ['long', 'Long']]
const FORMALITY: [string, string][] = [['casual', 'Casual'], ['smart-casual', 'Smart casual'], ['business', 'Business'], ['formal', 'Formal'], ['athletic', 'Athletic']]
const SEASONS: [string, string][] = [['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Autumn'], ['winter', 'Winter']]
export const OCCASIONS: [string, string][] = [['work', 'Work'], ['casual', 'Weekend'], ['evening', 'Evening'], ['occasion', 'Occasion'], ['athletic', 'Training']]
const CARE: [string, string][] = [['machine', 'Machine wash'], ['hand', 'Hand wash'], ['dry-clean', 'Dry clean'], ['none', 'No washing']]

export const FACTS: Fact[] = [
  { key: 'category', group: 'Core', label: 'Category', kind: 'chips', options: CATEGORIES },
  { key: 'subtype', group: 'Core', label: 'Type', kind: 'text' },
  { key: 'cutFor', group: 'Core', label: 'Cut for', kind: 'chips', options: CUT_FOR },
  { key: 'primaryColor', group: 'Core', label: 'Colour', kind: 'text' },
  { key: 'secondaryColor', group: 'Core', label: 'Second colour', kind: 'text' },
  { key: 'material', group: 'Make', label: 'Material', kind: 'chips', options: MATERIALS },
  { key: 'materialNote', group: 'Make', label: 'Material, in detail', kind: 'text', detail: true },
  { key: 'pattern', group: 'Make', label: 'Pattern', kind: 'chips', options: PATTERNS },
  { key: 'texture', group: 'Make', label: 'Texture', kind: 'chips', options: TEXTURES },
  { key: 'renderNotes', group: 'Make', label: 'For the Mirror', kind: 'note' },
  { key: 'weight', group: 'Make', label: 'Weight', kind: 'chips', options: WEIGHTS },
  { key: 'fit', group: 'Cut and fit', label: 'Fit', kind: 'chips', options: FITS },
  { key: 'length', group: 'Cut and fit', label: 'Length', kind: 'chips', options: LENGTHS },
  { key: 'neckline', group: 'Cut and fit', label: 'Neckline', kind: 'text', detail: true, only: ['top', 'dress', 'outerwear'] },
  { key: 'sleeve', group: 'Cut and fit', label: 'Sleeve', kind: 'text', detail: true, only: ['top', 'dress', 'outerwear'] },
  { key: 'rise', group: 'Cut and fit', label: 'Rise', kind: 'text', detail: true, only: ['bottom'] },
  { key: 'leg', group: 'Cut and fit', label: 'Leg', kind: 'text', detail: true, only: ['bottom'] },
  { key: 'heel', group: 'Cut and fit', label: 'Heel', kind: 'text', detail: true, only: ['footwear'] },
  { key: 'toe', group: 'Cut and fit', label: 'Toe', kind: 'text', detail: true, only: ['footwear'] },
  { key: 'closure', group: 'Cut and fit', label: 'Closure', kind: 'text', detail: true, only: ['top', 'outerwear', 'dress', 'bottom', 'footwear', 'accessory'] },
  { key: 'formality', group: 'When', label: 'Formality', kind: 'chips', options: FORMALITY },
  { key: 'season', group: 'When', label: 'Seasons', kind: 'multi', options: SEASONS },
  { key: 'occasions', group: 'When', label: 'Occasions', kind: 'multi', options: OCCASIONS },
  { key: 'brand', group: 'Yours', label: 'Brand', kind: 'text', yours: true },
  { key: 'size', group: 'Yours', label: 'Size', kind: 'text', yours: true },
  { key: 'price', group: 'Yours', label: 'Paid', kind: 'money', yours: true },
  { key: 'care', group: 'Yours', label: 'Care', kind: 'chips', options: CARE, yours: true },
  { key: 'note', group: 'Yours', label: 'Note', kind: 'note', yours: true },
]
export const GROUPS: FactGroup[] = ['Core', 'Make', 'Cut and fit', 'When', 'Yours']
export const STATES: Record<string, string> = { clean: 'Clean', 'in-wash': 'In the wash', packed: 'Packed', 'lent-out': 'Lent out', retired: 'Let go' }

export type Source = 'read' | 'guess' | 'you' | 'none'
export const SOURCE_WORD: Record<Source, string> = { read: 'read from the photo', guess: 'a guess, tap to confirm', you: 'you set it', none: '' }
export const SOURCE_TAG: Record<Source, string> = { read: 'read', guess: 'a guess', you: 'you set it', none: '' }

export function labelFor(fact: Fact, value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => fact.options?.find(([k]) => k === v)?.[1] ?? title(String(v))).join(', ')
  if (fact.kind === 'money' && typeof value === 'number') return money(value)
  const opt = fact.options?.find(([k]) => k === value)
  return opt ? opt[1] : title(String(value))
}

export function valueOf(item: WardrobeItem, fact: Fact): unknown {
  if (fact.detail) return item.details?.[fact.key] ?? null
  const v = (item as unknown as Record<string, unknown>)[fact.key]
  if (Array.isArray(v)) return v.length ? v : null
  return v ?? null
}

/** Where a fact came from: read from the photo, a guess, set by you, or not known. */
export function sourceOf(item: WardrobeItem, fact: Fact, value: unknown): Source {
  if (value == null || value === '') return 'none'
  if (fact.yours || fact.detail) return item.attrConfidence?.[fact.key] != null && item.attrConfidence[fact.key] < 1 ? 'read' : fact.yours ? 'you' : 'read'
  const c = item.attrConfidence?.[fact.key]
  if (c == null) return 'read'
  if (c >= 1) return 'you'
  if (c < 0.5) return 'guess'
  return 'read'
}

/** The facts that apply to a piece, by its category. */
export function factsFor(item: WardrobeItem): Fact[] {
  return FACTS.filter((f) => !f.only || f.only.includes(item.category))
}
