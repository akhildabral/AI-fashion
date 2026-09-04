import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { normalizeColorName } from '../lib/attributes';
import type { Lab } from '../lib/color';

// The taste layer: what a member's record says about how they actually
// dress, as opposed to what the fitting said they would. Derived from the
// last six months of wears, swaps, compositions and ratings against the
// closet, stored as one row per member, and read by the composer through the
// hooks at the bottom of this file. Everything above the DB wrapper is pure,
// so the derivations are tested on fixtures without a database behind them.

export const TASTE_WINDOW_DAYS = 180;
/** Below this many wears the stylist goes by the fitting, not the record. */
export const TASTE_MIN_WEARS = 5;
/** A fact needs this many observations behind it before it is said out loud. */
export const FACT_MIN_OBS = 3;
/** A colour on the rail with this many chances and no wears is "avoided". */
export const AVOID_MIN_OPPORTUNITIES = 8;
const MAX_FACTS = 8;
const MAX_ITEM_PAIRS = 200;
const MAX_NEGATIVE_PAIRS = 100;
const MAX_FAVOURITES = 12;

// ---- Inputs ----------------------------------------------------------------

export interface TasteItem {
  id: string;
  category: string;
  subtype?: string | null;
  primaryColor?: string | null;
  /** Dominant-first palette: [{ hex, lab: { L, a, b }, share }]. */
  colorPalette?: unknown;
  formalityScore?: number | null;
  layerRole?: string | null;
  fit?: string | null;
  length?: string | null;
  createdAt?: Date | string | null;
}

export interface TasteWear {
  itemIds: string[];
  suggestedItemIds?: string[];
  woreInstead?: boolean;
  eventType?: string | null;
  wornOn: Date | string;
  rating?: number | null;
  /** { temperatureC, description, location } as snapshotted at log time. */
  weather?: unknown;
  outfitId?: string | null;
}

export interface TasteEvent {
  kind: string;
  eventType?: string | null;
  slot?: string | null;
  outId?: string | null;
  inId?: string | null;
  itemIds?: string[];
  outfitId?: string | null;
  rating?: number | null;
  occurredOn: Date | string;
  meta?: unknown;
}

export interface TasteOutfit {
  id: string;
  itemIds: string[];
  eventType: string;
  rating?: number | null;
  wearCount: number;
  rationale?: string | null;
}

export interface TasteInput {
  items: TasteItem[];
  wears: TasteWear[];
  events?: TasteEvent[];
  outfits?: TasteOutfit[];
  dismissedFacts?: string[];
  now?: Date;
}

// ---- The profile -----------------------------------------------------------

export interface ColourFamilyStat {
  /** Share of the closet in this family, 0–1. */
  closetShare: number;
  /** Share of item-wears in this family, 0–1. */
  wornShare: number;
  /** (worn − closet) / (worn + closet): −1 never worn, +1 worn without being owned (from a photo). */
  affinity: number;
  wears: number;
  items: number;
  /** Wear days on which a piece of this family was on the rail. */
  opportunities: number;
}

export interface ColourAffinity {
  families: Record<string, ColourFamilyStat>;
  /** The family reached for most, when there are enough wears to say. */
  favourite: string | null;
  /** On the rail, never worn, given enough chances. */
  avoids: string[];
}

export interface FormalityOffsetEntry {
  /** mean(worn formality) − mean(laid-out formality), clamped to ±2. */
  offset: number;
  /** Corrected days (and swaps) behind the number. */
  days: number;
}

/** Keyed by event type, plus 'all' and 'day:<weekday>' (e.g. 'day:friday'). */
export type FormalityOffset = Record<string, FormalityOffsetEntry>;

export interface PairCount {
  a: string;
  b: string;
  count: number;
}

export interface PairAffinity {
  /** Co-worn item pairs, unordered, most-worn first. */
  items: PairCount[];
  /** Co-worn subtype families: key 'famA|famB' (sorted), with the days by event type. */
  families: Record<string, { count: number; eventTypes: Record<string, number> }>;
  /** What a swapped-out piece was rejected next to, most often first. */
  negatives: PairCount[];
}

export interface ShareCount {
  count: number;
  share: number;
}

export interface Silhouette {
  /** 'fit/length' combos over worn pieces that carry either tag. */
  combos: Record<string, ShareCount>;
  fits: Record<string, ShareCount>;
  lengths: Record<string, ShareCount>;
}

/** Event type → shoe family → share of footwear wears. 'any' is every event type together. */
export type ShoeHabits = Record<string, Record<string, ShareCount>>;

/** Temperature band → event type → how often a mid/outer layer was worn. */
export type Layering = Record<string, Record<string, { days: number; layered: number; share: number }>>;

export interface FavouriteOutfit {
  id: string;
  itemIds: string[];
  eventType: string;
  wearCount: number;
  rating: number | null;
  lastWornOn: string | null;
  /** The temperature the last time it was worn, when the log knew it. */
  temperatureC: number | null;
  /** "navy blazer, white tee, jeans" — the pieces, named. */
  label: string;
}

export type TasteFactKind = 'colour' | 'colour-avoid' | 'formality' | 'pair' | 'pair-avoid' | 'shoes' | 'layering' | 'silhouette' | 'favourite';

export interface TasteFact {
  id: string;
  text: string;
  kind: TasteFactKind;
  /** 0–1: how sure the record is. */
  strength: number;
}

export interface TasteProfileData {
  computedAt: string;
  sampleSize: number;
  colourAffinity: ColourAffinity;
  formalityOffset: FormalityOffset;
  pairAffinity: PairAffinity;
  silhouette: Silhouette;
  shoeHabits: ShoeHabits;
  layering: Layering;
  favouriteOutfits: FavouriteOutfit[];
  facts: TasteFact[];
  dismissedFacts: string[];
}

// ---- Vocabulary ------------------------------------------------------------

export const COLOUR_FAMILIES = ['black', 'white', 'grey', 'navy', 'blue', 'green', 'olive', 'beige', 'brown', 'red', 'pink', 'orange', 'yellow', 'purple'] as const;
export type ColourFamily = (typeof COLOUR_FAMILIES)[number];

const FAMILY_BY_NAME: Record<string, ColourFamily> = {
  black: 'black',
  'jet black': 'black',
  white: 'white',
  'off white': 'white',
  'pure white': 'white',
  cream: 'white',
  ivory: 'white',
  ecru: 'white',
  grey: 'grey',
  gray: 'grey',
  charcoal: 'grey',
  'dark grey': 'grey',
  'dark gray': 'grey',
  'light grey': 'grey',
  'light gray': 'grey',
  silver: 'grey',
  navy: 'navy',
  'navy blue': 'navy',
  'midnight blue': 'navy',
  'dark blue': 'navy',
  blue: 'blue',
  'baby blue': 'blue',
  'light blue': 'blue',
  'powder blue': 'blue',
  'sky blue': 'blue',
  denim: 'blue',
  cobalt: 'blue',
  'royal blue': 'blue',
  teal: 'blue',
  green: 'green',
  'forest green': 'green',
  'dark green': 'green',
  emerald: 'green',
  sage: 'green',
  mint: 'green',
  olive: 'olive',
  'olive green': 'olive',
  'army green': 'olive',
  khaki: 'olive',
  beige: 'beige',
  tan: 'beige',
  camel: 'beige',
  sand: 'beige',
  stone: 'beige',
  taupe: 'beige',
  oatmeal: 'beige',
  brown: 'brown',
  chocolate: 'brown',
  cognac: 'brown',
  chestnut: 'brown',
  red: 'red',
  'dark red': 'red',
  'wine red': 'red',
  burgundy: 'red',
  maroon: 'red',
  crimson: 'red',
  pink: 'pink',
  'hot pink': 'pink',
  'light pink': 'pink',
  blush: 'pink',
  rose: 'pink',
  orange: 'orange',
  rust: 'orange',
  terracotta: 'orange',
  coral: 'orange',
  yellow: 'yellow',
  mustard: 'yellow',
  gold: 'yellow',
  purple: 'purple',
  lavender: 'purple',
  lilac: 'purple',
  violet: 'purple',
  plum: 'purple',
};

const FAMILY_WORDS: [RegExp, ColourFamily][] = [
  [/navy|midnight/, 'navy'],
  [/olive|khaki|army/, 'olive'],
  [/gr[ae]y|charcoal|slate/, 'grey'],
  [/black/, 'black'],
  [/white|cream|ivory/, 'white'],
  [/blue|denim|teal|indigo/, 'blue'],
  [/green|sage|mint/, 'green'],
  [/beige|tan\b|camel|sand|stone|taupe/, 'beige'],
  [/brown|chocolate|cognac/, 'brown'],
  [/burgundy|maroon|wine|red|crimson/, 'red'],
  [/pink|blush|rose/, 'pink'],
  [/orange|rust|terracotta|coral/, 'orange'],
  [/yellow|mustard|gold/, 'yellow'],
  [/purple|lavender|lilac|violet|plum/, 'purple'],
];

/** LCh hue family from a LAB colour — the fallback when the tag is missing. */
export function labFamily(lab: Lab): ColourFamily {
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  if (chroma < 12) {
    if (lab.L >= 85) return 'white';
    if (lab.L <= 22) return 'black';
    return 'grey';
  }
  // CIELAB hue: +a red, +b yellow, −a green, −b blue. Red sits near 0–45°,
  // yellow near 90°, green 105–200°, blue 200–300°, purple and magenta beyond.
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  if (h < 45 || h >= 345) return lab.L > 62 && chroma < 45 ? 'pink' : 'red';
  if (h < 75) {
    if (lab.L < 45 && chroma < 40) return 'brown';
    if (lab.L > 65 && chroma < 30) return 'beige';
    return 'orange';
  }
  if (h < 105) return chroma < 30 ? 'beige' : 'yellow';
  if (h < 200) return chroma < 30 && h < 150 ? 'olive' : 'green';
  if (h < 300) return lab.L < 35 ? 'navy' : 'blue';
  if (h < 330) return 'purple';
  return lab.L > 62 ? 'pink' : 'purple';
}

/** The colour family a piece belongs to: its tag first, its palette second. */
export function colourFamilyOf(item: Pick<TasteItem, 'primaryColor' | 'colorPalette'>): ColourFamily | null {
  const name = normalizeColorName(item.primaryColor);
  if (name) {
    const direct = FAMILY_BY_NAME[name];
    if (direct) return direct;
    for (const [re, fam] of FAMILY_WORDS) if (re.test(name)) return fam;
  }
  const palette = item.colorPalette;
  if (Array.isArray(palette) && palette.length > 0) {
    const first = palette[0] as { lab?: Lab } | null;
    if (first?.lab && typeof first.lab.L === 'number') return labFamily(first.lab);
  }
  return null;
}

const SUBTYPE_FAMILIES: [RegExp, string][] = [
  [/sneaker|trainer|running shoe|plimsoll/, 'sneaker'],
  [/boot/, 'boot'],
  [/loafer|moccasin|driver/, 'loafer'],
  [/heel|pump|stiletto/, 'heel'],
  [/sandal|slide|flip[- ]?flop|espadrille/, 'sandal'],
  [/oxford|derby|brogue|monk/, 'dress-shoe'],
  [/\bflat|ballet|mule/, 'flat'],
  [/blazer|suit jacket|sport coat|sports coat/, 'blazer'],
  [/tailored|trouser|slacks|dress pant|suit pant|pleated pant/, 'tailored-trouser'],
  [/jean|denim/, 'jeans'],
  [/chino/, 'chino'],
  [/cargo|jogger|sweatpant|track pant/, 'casual-trouser'],
  [/short/, 'shorts'],
  [/skirt/, 'skirt'],
  [/dress|gown|jumpsuit/, 'dress'],
  [/shirt|blouse|button/, 'shirt'],
  [/polo/, 'polo'],
  [/tee|t-shirt|tank|camisole|vest top/, 'tee'],
  [/sweater|jumper|knit|cardigan|pullover|turtleneck|roll neck/, 'knit'],
  [/hoodie|sweatshirt|fleece/, 'sweatshirt'],
  [/overcoat|parka|puffer|trench|\bcoat/, 'coat'],
  [/jacket|bomber|windbreaker|anorak|gilet/, 'jacket'],
];

const CATEGORY_FAMILY: Record<string, string> = { top: 'tee', bottom: 'tailored-trouser', footwear: 'sneaker', outerwear: 'jacket', dress: 'dress', accessory: 'accessory' };

/** The family a piece composes as: 'sneaker', 'tailored-trouser', 'blazer'… */
export function subtypeFamilyOf(item: Pick<TasteItem, 'category' | 'subtype'>): string {
  const sub = (item.subtype ?? '').toLowerCase();
  if (sub) for (const [re, fam] of SUBTYPE_FAMILIES) if (re.test(sub)) return fam;
  return CATEGORY_FAMILY[item.category] ?? item.category;
}

const FAMILY_LABEL: Record<string, string> = {
  sneaker: 'sneakers',
  boot: 'boots',
  loafer: 'loafers',
  heel: 'heels',
  sandal: 'sandals',
  'dress-shoe': 'dress shoes',
  flat: 'flats',
  blazer: 'a blazer',
  'tailored-trouser': 'tailored trousers',
  jeans: 'jeans',
  chino: 'chinos',
  'casual-trouser': 'joggers',
  shorts: 'shorts',
  skirt: 'a skirt',
  dress: 'a dress',
  shirt: 'a shirt',
  polo: 'a polo',
  tee: 'a tee',
  knit: 'a knit',
  sweatshirt: 'a sweatshirt',
  coat: 'a coat',
  jacket: 'a jacket',
  accessory: 'an accessory',
};

export function familyLabel(family: string): string {
  return FAMILY_LABEL[family] ?? family.replace(/-/g, ' ');
}

const EVENT_PHRASE: Record<string, string> = {
  work: 'on work days',
  casual: 'at the weekend',
  evening: 'on evenings out',
  occasion: 'for occasions',
  athletic: 'for training',
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const SHOE_FAMILIES = new Set(['sneaker', 'boot', 'loafer', 'heel', 'sandal', 'dress-shoe', 'flat']);

/** Cold below 10, cool to 18, mild to 25, warm above. */
export function temperatureBand(tempC: number | null | undefined): 'cold' | 'cool' | 'mild' | 'warm' | 'unknown' {
  if (tempC === null || tempC === undefined || Number.isNaN(tempC)) return 'unknown';
  if (tempC < 10) return 'cold';
  if (tempC < 18) return 'cool';
  if (tempC < 25) return 'mild';
  return 'warm';
}

/** "navy blazer", "white tee": how a piece is named in a fact. */
export function pieceName(item: Pick<TasteItem, 'category' | 'subtype' | 'primaryColor'>): string {
  const colour = normalizeColorName(item.primaryColor);
  const what = (item.subtype ?? item.category).toLowerCase();
  return colour ? `${colour} ${what}` : what;
}

// ---- Small helpers ---------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;
const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

function temperatureOf(weather: unknown): number | null {
  if (!weather || typeof weather !== 'object') return null;
  const t = (weather as { temperatureC?: unknown }).temperatureC;
  return typeof t === 'number' && Number.isFinite(t) ? t : null;
}

function shares(counts: Map<string, number>): Record<string, ShareCount> {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const out: Record<string, ShareCount> = {};
  for (const [k, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) out[k] = { count, share: total ? round2(count / total) : 0 };
  return out;
}

function topShare(map: Record<string, ShareCount> | undefined): { key: string; count: number; share: number; total: number } | null {
  if (!map) return null;
  let total = 0;
  let best: { key: string; count: number; share: number } | null = null;
  for (const [key, v] of Object.entries(map)) {
    total += v.count;
    if (!best || v.count > best.count) best = { key, ...v };
  }
  return best ? { ...best, total } : null;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Derivations (pure) ----------------------------------------------------

export function deriveColourAffinity(items: TasteItem[], wears: TasteWear[]): ColourAffinity {
  const byId = new Map(items.map((i) => [i.id, i]));
  const closet = new Map<string, number>();
  const earliest = new Map<string, number>();
  for (const item of items) {
    const fam = colourFamilyOf(item);
    if (!fam) continue;
    bump(closet, fam);
    const created = item.createdAt ? toDate(item.createdAt).getTime() : 0;
    earliest.set(fam, Math.min(earliest.get(fam) ?? Infinity, Number.isFinite(created) ? created : 0));
  }
  const worn = new Map<string, number>();
  let wornTotal = 0;
  for (const wear of wears) {
    for (const id of wear.itemIds) {
      const item = byId.get(id);
      const fam = item ? colourFamilyOf(item) : null;
      if (!fam) continue;
      bump(worn, fam);
      wornTotal++;
    }
  }
  const closetTotal = [...closet.values()].reduce((a, b) => a + b, 0);
  const families: Record<string, ColourFamilyStat> = {};
  const names = new Set([...closet.keys(), ...worn.keys()]);
  for (const fam of names) {
    const items = closet.get(fam) ?? 0;
    const wearsN = worn.get(fam) ?? 0;
    const closetShare = closetTotal ? items / closetTotal : 0;
    const wornShare = wornTotal ? wearsN / wornTotal : 0;
    const affinity = closetShare + wornShare > 0 ? (wornShare - closetShare) / (wornShare + closetShare) : 0;
    const since = earliest.get(fam) ?? 0;
    const opportunities = items > 0 ? wears.filter((w) => toDate(w.wornOn).getTime() >= since).length : 0;
    families[fam] = { closetShare: round2(closetShare), wornShare: round2(wornShare), affinity: round2(affinity), wears: wearsN, items, opportunities };
  }
  const ranked = Object.entries(families).sort((a, b) => b[1].wears - a[1].wears);
  const favourite = ranked[0] && ranked[0][1].wears >= FACT_MIN_OBS ? ranked[0][0] : null;
  const avoids = Object.entries(families)
    .filter(([, s]) => s.items > 0 && s.wears === 0 && s.opportunities >= AVOID_MIN_OPPORTUNITIES)
    .map(([fam]) => fam)
    .sort();
  return { families, favourite, avoids };
}

export function deriveFormalityOffset(items: TasteItem[], wears: TasteWear[], events: TasteEvent[]): FormalityOffset {
  const byId = new Map(items.map((i) => [i.id, i]));
  const formality = (ids: string[]) => mean(ids.map((id) => byId.get(id)?.formalityScore).filter((f): f is number => typeof f === 'number'));
  const deltas = new Map<string, number[]>();
  const add = (keys: (string | null | undefined)[], delta: number) => {
    for (const k of keys) {
      if (!k) continue;
      const list = deltas.get(k) ?? [];
      list.push(delta);
      deltas.set(k, list);
    }
  };
  const keysFor = (eventType: string | null | undefined, when: Date | string) => ['all', eventType ?? null, `day:${WEEKDAYS[toDate(when).getUTCDay()]}`];
  for (const wear of wears) {
    if (!wear.woreInstead || !wear.suggestedItemIds?.length) continue;
    const wornF = formality(wear.itemIds);
    const laidF = formality(wear.suggestedItemIds);
    if (wornF === null || laidF === null) continue;
    add(keysFor(wear.eventType, wear.wornOn), wornF - laidF);
  }
  for (const ev of events) {
    if (ev.kind !== 'swap' || !ev.outId || !ev.inId) continue;
    const out = byId.get(ev.outId)?.formalityScore;
    const inn = byId.get(ev.inId)?.formalityScore;
    if (typeof out !== 'number' || typeof inn !== 'number') continue;
    add(keysFor(ev.eventType, ev.occurredOn), inn - out);
  }
  const out: FormalityOffset = {};
  for (const [k, list] of deltas) out[k] = { offset: round2(clamp(mean(list) ?? 0, -2, 2)), days: list.length };
  return out;
}

export function derivePairAffinity(items: TasteItem[], wears: TasteWear[], events: TasteEvent[]): PairAffinity {
  const byId = new Map(items.map((i) => [i.id, i]));
  const itemPairs = new Map<string, number>();
  const familyPairs = new Map<string, { count: number; eventTypes: Map<string, number> }>();
  const negatives = new Map<string, number>();

  const countSet = (ids: string[], eventType: string | null | undefined) => {
    const uniq = [...new Set(ids)];
    for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) bump(itemPairs, pairKey(uniq[i], uniq[j]));
    const fams = [...new Set(uniq.map((id) => byId.get(id)).filter((x): x is TasteItem => !!x).map(subtypeFamilyOf))].sort();
    for (let i = 0; i < fams.length; i++) {
      for (let j = i + 1; j < fams.length; j++) {
        const key = `${fams[i]}|${fams[j]}`;
        const entry = familyPairs.get(key) ?? { count: 0, eventTypes: new Map<string, number>() };
        entry.count++;
        if (eventType) bump(entry.eventTypes, eventType);
        familyPairs.set(key, entry);
      }
    }
  };
  for (const wear of wears) countSet(wear.itemIds, wear.eventType);
  for (const ev of events) {
    if (ev.kind === 'composed' && ev.itemIds?.length) countSet(ev.itemIds, ev.eventType);
    if (ev.kind === 'swap' && ev.outId) for (const id of ev.itemIds ?? []) if (id !== ev.outId) bump(negatives, pairKey(ev.outId, id));
  }
  const toList = (m: Map<string, number>, max: number): PairCount[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([k, count]) => {
        const [a, b] = k.split('|');
        return { a, b, count };
      });
  const families: PairAffinity['families'] = {};
  for (const [k, v] of [...familyPairs.entries()].sort((a, b) => b[1].count - a[1].count)) families[k] = { count: v.count, eventTypes: Object.fromEntries(v.eventTypes) };
  return { items: toList(itemPairs, MAX_ITEM_PAIRS), families, negatives: toList(negatives, MAX_NEGATIVE_PAIRS) };
}

export function deriveSilhouette(items: TasteItem[], wears: TasteWear[]): Silhouette {
  const byId = new Map(items.map((i) => [i.id, i]));
  const combos = new Map<string, number>();
  const fits = new Map<string, number>();
  const lengths = new Map<string, number>();
  for (const wear of wears) {
    for (const id of wear.itemIds) {
      const item = byId.get(id);
      if (!item) continue;
      const fit = item.fit?.toLowerCase() || null;
      const length = item.length?.toLowerCase() || null;
      if (!fit && !length) continue;
      bump(combos, `${fit ?? 'any'}/${length ?? 'any'}`);
      if (fit) bump(fits, fit);
      if (length) bump(lengths, length);
    }
  }
  return { combos: shares(combos), fits: shares(fits), lengths: shares(lengths) };
}

export function deriveShoeHabits(items: TasteItem[], wears: TasteWear[]): ShoeHabits {
  const byId = new Map(items.map((i) => [i.id, i]));
  const per = new Map<string, Map<string, number>>();
  for (const wear of wears) {
    for (const id of wear.itemIds) {
      const item = byId.get(id);
      if (!item || item.category !== 'footwear') continue;
      const fam = subtypeFamilyOf(item);
      const family = SHOE_FAMILIES.has(fam) ? fam : 'other';
      for (const key of ['any', wear.eventType ?? null]) {
        if (!key) continue;
        const m = per.get(key) ?? new Map<string, number>();
        bump(m, family);
        per.set(key, m);
      }
    }
  }
  const out: ShoeHabits = {};
  for (const [k, m] of per) out[k] = shares(m);
  return out;
}

export function deriveLayering(items: TasteItem[], wears: TasteWear[]): Layering {
  const byId = new Map(items.map((i) => [i.id, i]));
  const per = new Map<string, Map<string, { days: number; layered: number }>>();
  for (const wear of wears) {
    const band = temperatureBand(temperatureOf(wear.weather));
    const layered = wear.itemIds.some((id) => {
      const item = byId.get(id);
      return !!item && (item.layerRole === 'mid' || item.layerRole === 'outer' || item.category === 'outerwear');
    });
    for (const key of ['any', wear.eventType ?? null]) {
      if (!key) continue;
      const m = per.get(band) ?? new Map<string, { days: number; layered: number }>();
      const e = m.get(key) ?? { days: 0, layered: 0 };
      e.days++;
      if (layered) e.layered++;
      m.set(key, e);
      per.set(band, m);
    }
  }
  const out: Layering = {};
  for (const [band, m] of per) {
    out[band] = {};
    for (const [k, e] of m) out[band][k] = { ...e, share: round2(e.layered / e.days) };
  }
  return out;
}

export function deriveFavouriteOutfits(items: TasteItem[], wears: TasteWear[], outfits: TasteOutfit[]): FavouriteOutfit[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const keyOf = (ids: string[]) => [...ids].sort().join('|');
  const lastByOutfit = new Map<string, TasteWear>();
  const lastByKey = new Map<string, TasteWear>();
  for (const wear of wears) {
    const t = toDate(wear.wornOn).getTime();
    if (wear.outfitId) {
      const prev = lastByOutfit.get(wear.outfitId);
      if (!prev || toDate(prev.wornOn).getTime() < t) lastByOutfit.set(wear.outfitId, wear);
    }
    const k = keyOf(wear.itemIds);
    const prev = lastByKey.get(k);
    if (!prev || toDate(prev.wornOn).getTime() < t) lastByKey.set(k, wear);
  }
  return outfits
    .filter((o) => o.wearCount >= 2 || (o.rating ?? 0) >= 4)
    .map((o) => {
      const last = lastByOutfit.get(o.id) ?? lastByKey.get(keyOf(o.itemIds)) ?? null;
      const named = o.itemIds.map((id) => byId.get(id)).filter((x): x is TasteItem => !!x);
      return {
        id: o.id,
        itemIds: o.itemIds,
        eventType: o.eventType,
        wearCount: o.wearCount,
        rating: o.rating ?? null,
        lastWornOn: last ? toDate(last.wornOn).toISOString().slice(0, 10) : null,
        temperatureC: last ? temperatureOf(last.weather) : null,
        label: named
          .slice(0, 3)
          .map(pieceName)
          .join(', ') + (named.length > 3 ? '…' : ''),
      };
    })
    .sort((a, b) => b.wearCount - a.wearCount || (b.rating ?? 0) - (a.rating ?? 0) || (b.lastWornOn ?? '').localeCompare(a.lastWornOn ?? ''))
    .slice(0, MAX_FAVOURITES);
}

interface FactCandidate extends TasteFact {
  /** Observations behind it — a fact under FACT_MIN_OBS is never said. */
  n: number;
}

/**
 * Up to eight plain sentences in the stylist's voice. Each stands on at least
 * three observations, the profile on at least five wears; the ones the member
 * said "not quite" to are never said again.
 */
export function deriveFacts(
  p: Pick<TasteProfileData, 'sampleSize' | 'colourAffinity' | 'formalityOffset' | 'pairAffinity' | 'silhouette' | 'shoeHabits' | 'layering' | 'favouriteOutfits'>,
  items: TasteItem[],
  dismissed: string[] = [],
): TasteFact[] {
  if (p.sampleSize < TASTE_MIN_WEARS) return [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: FactCandidate[] = [];

  // Colour: reached for beyond its share of the rail, or left on it.
  for (const [fam, s] of Object.entries(p.colourAffinity.families)) {
    if (s.wears >= FACT_MIN_OBS && s.items > 0 && s.affinity >= 0.35) {
      out.push({ id: `colour:${fam}`, kind: 'colour', n: s.wears, strength: round2(clamp(s.affinity, 0, 1)), text: `You reach for ${fam} ${s.affinity >= 0.6 ? 'far more' : 'more'} than the closet suggests.` });
    }
  }
  for (const fam of p.colourAffinity.avoids) {
    const s = p.colourAffinity.families[fam];
    out.push({ id: `avoid:${fam}`, kind: 'colour-avoid', n: s?.opportunities ?? 0, strength: 0.5, text: `There’s ${fam} on the rail, but you never reach for it.` });
  }

  // Formality: a step off what was laid out, by kind of day, then by weekday when it differs.
  const allOffset = p.formalityOffset.all?.offset ?? 0;
  for (const [key, e] of Object.entries(p.formalityOffset)) {
    if (key === 'all' || e.days < FACT_MIN_OBS || Math.abs(e.offset) < 0.5) continue;
    const weekday = key.startsWith('day:') ? key.slice(4) : null;
    if (weekday && Math.abs(e.offset - allOffset) < 0.5) continue;
    if (!weekday && !EVENT_PHRASE[key]) continue;
    const when = weekday ? `on ${capitalise(weekday)}s` : EVENT_PHRASE[key];
    const steps = Math.abs(e.offset) >= 1.5 ? 'two steps' : 'a step';
    out.push({
      id: `formality:${key}`,
      kind: 'formality',
      n: e.days,
      strength: round2(clamp(Math.abs(e.offset) / 2, 0, 1)),
      text: e.offset < 0 ? `You dress ${steps} more casual than I lay out ${when}.` : `You dress ${steps} sharper than I lay out ${when}.`,
    });
  }

  // Pairs: the combinations the record keeps coming back to. On a tie the
  // surprising one wins: a pair that crosses formality says more than a tee
  // with jeans.
  const familyFormality = new Map<string, number[]>();
  for (const item of items) {
    if (typeof item.formalityScore !== 'number') continue;
    const fam = subtypeFamilyOf(item);
    familyFormality.set(fam, [...(familyFormality.get(fam) ?? []), item.formalityScore]);
  }
  const contrast = (key: string) => {
    const [a, b] = key.split('|').map((f) => mean(familyFormality.get(f) ?? []));
    return a === null || b === null ? 0 : Math.abs(a - b);
  };
  const pairs = Object.entries(p.pairAffinity.families)
    .filter(([, v]) => v.count >= FACT_MIN_OBS)
    .sort((a, b) => b[1].count - a[1].count || contrast(b[0]) - contrast(a[0]) || a[0].localeCompare(b[0]))
    .slice(0, 2);
  for (const [key, v] of pairs) {
    const [a, b] = key.split('|');
    const dominant = Object.entries(v.eventTypes).sort((x, y) => y[1] - x[1])[0];
    const when = dominant && dominant[1] / v.count >= 0.6 && EVENT_PHRASE[dominant[0]] ? ` ${EVENT_PHRASE[dominant[0]]}` : '';
    out.push({ id: `pair:${key}`, kind: 'pair', n: v.count, strength: round2(clamp(v.count / 8, 0, 1)), text: `You wear ${familyLabel(a)} with ${familyLabel(b)}${when}.` });
  }
  for (const neg of p.pairAffinity.negatives.slice(0, 2)) {
    if (neg.count < FACT_MIN_OBS) continue;
    const a = byId.get(neg.a);
    const b = byId.get(neg.b);
    if (!a || !b) continue;
    out.push({ id: `pair-avoid:${neg.a}|${neg.b}`, kind: 'pair-avoid', n: neg.count, strength: round2(clamp(neg.count / 5, 0, 1)), text: `You take the ${pieceName(a)} off when I pair it with the ${pieceName(b)}.` });
  }

  // Shoes: one family nearly every time, per kind of day.
  for (const [eventType, phrase] of Object.entries(EVENT_PHRASE)) {
    const top = topShare(p.shoeHabits[eventType]);
    if (!top || top.total < FACT_MIN_OBS || top.share < 0.6 || top.key === 'other') continue;
    out.push({ id: `shoes:${eventType}`, kind: 'shoes', n: top.total, strength: round2(top.share), text: `${capitalise(familyLabel(top.key))} ${phrase}, almost every time.` });
  }

  // Layering on mild days: the habit the forecast can't explain.
  const mild = p.layering.mild?.any;
  if (mild && mild.days >= FACT_MIN_OBS) {
    if (mild.share >= 0.7) out.push({ id: 'layering:mild', kind: 'layering', n: mild.days, strength: round2(mild.share), text: 'You add a layer even on mild days.' });
    else if (mild.share <= 0.2) out.push({ id: 'layering:mild', kind: 'layering', n: mild.days, strength: round2(1 - mild.share), text: 'You go without a layer until it’s properly cold.' });
  }

  // Silhouette: one cut, most of the time.
  const fit = topShare(p.silhouette.fits);
  if (fit && fit.total >= TASTE_MIN_WEARS && fit.share >= 0.6) {
    out.push({ id: `fit:${fit.key}`, kind: 'silhouette', n: fit.total, strength: round2(fit.share), text: `Most of what you wear is cut ${fit.key}.` });
  }

  // The look that keeps coming back.
  const fav = p.favouriteOutfits[0];
  if (fav && fav.wearCount >= FACT_MIN_OBS && fav.label) {
    out.push({ id: `favourite:${fav.id}`, kind: 'favourite', n: fav.wearCount, strength: round2(clamp(fav.wearCount / 6, 0, 1)), text: `Your most-worn look: the ${fav.label}, worn ${fav.wearCount} times.` });
  }

  const gone = new Set(dismissed);
  return out
    .filter((f) => f.n >= FACT_MIN_OBS && !gone.has(f.id))
    .sort((a, b) => b.strength - a.strength || b.n - a.n || a.id.localeCompare(b.id))
    .slice(0, MAX_FACTS)
    .map(({ id, text, kind, strength }) => ({ id, text, kind, strength }));
}

/** The whole profile from a member's record and closet. Pure. */
export function deriveTasteProfile(input: TasteInput): TasteProfileData {
  const now = input.now ?? new Date();
  const since = now.getTime() - TASTE_WINDOW_DAYS * 86_400_000;
  const wears = input.wears.filter((w) => toDate(w.wornOn).getTime() >= since);
  const events = (input.events ?? []).filter((e) => toDate(e.occurredOn).getTime() >= since);
  const outfits = input.outfits ?? [];
  const dismissedFacts = [...new Set(input.dismissedFacts ?? [])];
  const items = input.items;

  const colourAffinity = deriveColourAffinity(items, wears);
  const formalityOffset = deriveFormalityOffset(items, wears, events);
  const pairAffinity = derivePairAffinity(items, wears, events);
  const silhouette = deriveSilhouette(items, wears);
  const shoeHabits = deriveShoeHabits(items, wears);
  const layering = deriveLayering(items, wears);
  const favouriteOutfits = deriveFavouriteOutfits(items, wears, outfits);
  const sampleSize = wears.length;
  const facts = deriveFacts({ sampleSize, colourAffinity, formalityOffset, pairAffinity, silhouette, shoeHabits, layering, favouriteOutfits }, items, dismissedFacts);

  return { computedAt: now.toISOString(), sampleSize, colourAffinity, formalityOffset, pairAffinity, silhouette, shoeHabits, layering, favouriteOutfits, facts, dismissedFacts };
}

// ---- Hooks for the composer -------------------------------------------------
// All of these accept a missing or cold profile and answer neutrally, so the
// caller never has to check first.

export const PAIR_BONUS_CAP = 1.5;
export const ITEM_BONUS_CAP = 2;

const warm = (p: TasteProfileData | null | undefined): p is TasteProfileData => !!p && p.sampleSize >= TASTE_MIN_WEARS;

/**
 * How the record feels about two pieces together: co-wears count for, a swap
 * of one out from next to the other counts against. Capped at ±1.5 so taste
 * shades the validator's own judgement rather than overruling it.
 */
export function tastePairBonus(profile: TasteProfileData | null | undefined, itemA: Pick<TasteItem, 'id' | 'category' | 'subtype'>, itemB: Pick<TasteItem, 'id' | 'category' | 'subtype'>): number {
  if (!warm(profile) || itemA.id === itemB.id) return 0;
  const key = pairKey(itemA.id, itemB.id);
  let bonus = 0;
  const pair = profile.pairAffinity.items.find((p) => pairKey(p.a, p.b) === key);
  if (pair) bonus += Math.min(pair.count, 4) * 0.35;
  const [fa, fb] = [subtypeFamilyOf(itemA), subtypeFamilyOf(itemB)].sort();
  if (fa !== fb) {
    const fam = profile.pairAffinity.families[`${fa}|${fb}`];
    if (fam) bonus += Math.min(fam.count, 6) * 0.1;
  }
  const neg = profile.pairAffinity.negatives.find((p) => pairKey(p.a, p.b) === key);
  if (neg) bonus -= Math.min(neg.count, 3) * 0.5;
  return round2(clamp(bonus, -PAIR_BONUS_CAP, PAIR_BONUS_CAP));
}

/**
 * How the record feels about one piece for this kind of day: its colour
 * family's affinity, the shoe habit when it is footwear, the cut. Capped ±2.
 */
export function tasteItemBonus(profile: TasteProfileData | null | undefined, item: Pick<TasteItem, 'id' | 'category' | 'subtype' | 'primaryColor' | 'colorPalette' | 'fit'>, eventType?: string | null): number {
  if (!warm(profile)) return 0;
  let bonus = 0;
  const fam = colourFamilyOf(item);
  if (fam) {
    const s = profile.colourAffinity.families[fam];
    if (s && s.wears + s.items >= FACT_MIN_OBS) bonus += s.affinity;
    if (profile.colourAffinity.avoids.includes(fam)) bonus -= 0.5;
  }
  if (item.category === 'footwear') {
    const habits = (eventType && profile.shoeHabits[eventType]) || profile.shoeHabits.any;
    const top = topShare(habits);
    if (top && top.total >= FACT_MIN_OBS) {
      const family = subtypeFamilyOf(item);
      const share = habits?.[SHOE_FAMILIES.has(family) ? family : 'other']?.share ?? 0;
      bonus += (share - 1 / 3) * 2;
    }
  }
  const fit = item.fit?.toLowerCase();
  if (fit) {
    const fits = topShare(profile.silhouette.fits);
    if (fits && fits.total >= TASTE_MIN_WEARS) bonus += ((profile.silhouette.fits[fit]?.share ?? 0) - 1 / 3) * 1;
  }
  return round2(clamp(bonus, -ITEM_BONUS_CAP, ITEM_BONUS_CAP));
}

/** The formality to aim for: the event's target, shifted by how they actually dress on those days. */
export function tasteFormalityTarget(profile: TasteProfileData | null | undefined, eventType: string, baseTarget: number): number {
  if (!warm(profile)) return baseTarget;
  const entry = profile.formalityOffset[eventType] ?? profile.formalityOffset.all;
  if (!entry || entry.days < FACT_MIN_OBS) return baseTarget;
  return round2(clamp(baseTarget + entry.offset, 1, 5));
}

/** A short block for the composer's prompt. Empty when there is nothing to say. */
export function tastePromptBlock(profile: TasteProfileData | null | undefined): string {
  if (!warm(profile) || profile.facts.length === 0) return '';
  const lines = profile.facts.slice(0, 5).map((f) => `- ${f.text.replace(/^You /, 'They ').replace(/\byou\b/g, 'they').replace(/\byour\b/g, 'their')}`);
  return ['How they actually dress:', ...lines].join('\n');
}

/** The look they keep coming back to for this kind of day and this weather, or null. */
export function favouriteOutfitFor(profile: TasteProfileData | null | undefined, ctx: { eventType: string; temperatureC?: number | null }): FavouriteOutfit | null {
  if (!warm(profile)) return null;
  const fits = profile.favouriteOutfits.filter((o) => {
    if (o.eventType !== ctx.eventType) return false;
    if (typeof ctx.temperatureC === 'number' && typeof o.temperatureC === 'number') return Math.abs(ctx.temperatureC - o.temperatureC) <= 8;
    return true;
  });
  return fits.sort((a, b) => b.wearCount - a.wearCount || (b.rating ?? 0) - (a.rating ?? 0))[0] ?? null;
}

// ---- The database ----------------------------------------------------------

const ITEM_SELECT = { id: true, category: true, subtype: true, primaryColor: true, colorPalette: true, formalityScore: true, layerRole: true, fit: true, length: true, createdAt: true } as const;
const WEAR_SELECT = { itemIds: true, suggestedItemIds: true, woreInstead: true, eventType: true, wornOn: true, rating: true, weather: true, outfitId: true } as const;
const EVENT_SELECT = { kind: true, eventType: true, slot: true, outId: true, inId: true, itemIds: true, outfitId: true, rating: true, occurredOn: true, meta: true } as const;
const OUTFIT_SELECT = { id: true, itemIds: true, eventType: true, rating: true, wearCount: true } as const;

function rowToProfile(row: {
  computedAt: Date;
  sampleSize: number;
  colourAffinity: unknown;
  formalityOffset: unknown;
  pairAffinity: unknown;
  silhouette: unknown;
  shoeHabits: unknown;
  layering: unknown;
  favouriteOutfits: unknown;
  facts: unknown;
  dismissedFacts: string[];
}): TasteProfileData {
  return {
    computedAt: row.computedAt.toISOString(),
    sampleSize: row.sampleSize,
    colourAffinity: (row.colourAffinity as ColourAffinity) ?? { families: {}, favourite: null, avoids: [] },
    formalityOffset: (row.formalityOffset as FormalityOffset) ?? {},
    pairAffinity: (row.pairAffinity as PairAffinity) ?? { items: [], families: {}, negatives: [] },
    silhouette: (row.silhouette as Silhouette) ?? { combos: {}, fits: {}, lengths: {} },
    shoeHabits: (row.shoeHabits as ShoeHabits) ?? {},
    layering: (row.layering as Layering) ?? {},
    favouriteOutfits: (row.favouriteOutfits as FavouriteOutfit[]) ?? [],
    facts: (row.facts as TasteFact[]) ?? [],
    dismissedFacts: row.dismissedFacts ?? [],
  };
}

/** The stored profile, or null when it has never been computed. Cheap: one row. */
export async function loadTasteProfile(userId: string): Promise<TasteProfileData | null> {
  const row = await prisma.tasteProfile.findUnique({ where: { userId } });
  return row ? rowToProfile(row) : null;
}

/** Derive and store the member's profile from the last six months. */
export async function computeTasteProfile(userId: string, now = new Date()): Promise<TasteProfileData> {
  const since = new Date(now.getTime() - TASTE_WINDOW_DAYS * 86_400_000);
  const [items, wears, events, outfits, existing] = await Promise.all([
    prisma.wardrobeItem.findMany({ where: { userId, owned: true, state: { not: 'retired' } }, select: ITEM_SELECT }),
    prisma.wearLog.findMany({ where: { userId, wornOn: { gte: since } }, select: WEAR_SELECT, orderBy: { wornOn: 'desc' }, take: 1000 }),
    prisma.styleEvent.findMany({ where: { userId, occurredOn: { gte: since } }, select: EVENT_SELECT, orderBy: { occurredOn: 'desc' }, take: 2000 }),
    prisma.outfit.findMany({ where: { userId, OR: [{ wearCount: { gte: 2 } }, { rating: { gte: 4 } }] }, select: OUTFIT_SELECT, take: 200 }),
    prisma.tasteProfile.findUnique({ where: { userId }, select: { dismissedFacts: true } }),
  ]);
  const data = deriveTasteProfile({ items, wears, events, outfits, dismissedFacts: existing?.dismissedFacts ?? [], now });
  const json = (v: unknown) => v as Prisma.InputJsonValue;
  const columns = {
    computedAt: now,
    sampleSize: data.sampleSize,
    colourAffinity: json(data.colourAffinity),
    formalityOffset: json(data.formalityOffset),
    pairAffinity: json(data.pairAffinity),
    silhouette: json(data.silhouette),
    shoeHabits: json(data.shoeHabits),
    layering: json(data.layering),
    favouriteOutfits: json(data.favouriteOutfits),
    facts: json(data.facts),
    dismissedFacts: data.dismissedFacts,
  };
  await prisma.tasteProfile.upsert({ where: { userId }, create: { userId, ...columns }, update: columns });
  return data;
}

/** "Not quite": the fact is never said again, and the profile is redrawn without it. */
export async function dismissTasteFact(userId: string, factId: string): Promise<TasteProfileData> {
  const existing = await prisma.tasteProfile.findUnique({ where: { userId }, select: { dismissedFacts: true } });
  if (!existing) await computeTasteProfile(userId);
  const current = existing?.dismissedFacts ?? [];
  if (!current.includes(factId)) {
    await prisma.tasteProfile.update({ where: { userId }, data: { dismissedFacts: [...current, factId].slice(-100) } });
  }
  return computeTasteProfile(userId);
}

/** How long a profile stays fresh after a wear before the next wear redraws it. */
export const RECOMPUTE_DEBOUNCE_MS = 10 * 60_000;

/**
 * After a wear: redraw the profile unless it was drawn in the last ten
 * minutes. Fire-and-forget; never throws.
 */
export function recomputeTasteProfileSoon(userId: string, now = new Date()): Promise<boolean> {
  return (async () => {
    const row = await prisma.tasteProfile.findUnique({ where: { userId }, select: { computedAt: true } });
    if (row && now.getTime() - row.computedAt.getTime() < RECOMPUTE_DEBOUNCE_MS) return false;
    await computeTasteProfile(userId, now);
    return true;
  })().catch((err) => {
    logger.warn({ err, userId }, 'Taste profile not recomputed');
    return false;
  });
}

const USER_PAGE = 200;

/** Every member with a wear in the window, a page at a time. Returns how many were redrawn. */
export async function recomputeTasteProfiles(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - TASTE_WINDOW_DAYS * 86_400_000);
  let cursor: string | undefined;
  let done = 0;
  for (;;) {
    const page = await prisma.user.findMany({
      where: { wearLogs: { some: { wornOn: { gte: since } } } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: USER_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const u of page) {
      try {
        await computeTasteProfile(u.id, now);
        done++;
      } catch (err) {
        logger.warn({ err, userId: u.id }, 'Taste profile failed');
      }
    }
    if (page.length < USER_PAGE) return done;
    cursor = page[page.length - 1].id;
  }
}

/** The nightly pass runs once a day, in the small hours UTC. */
export const TASTE_NIGHTLY_HOUR_UTC = 3;
let lastNightlyOn: string | null = null;

/** Called on a clock: does the nightly redraw once per day at the nightly hour, else nothing. */
export async function runNightlyTaste(now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() !== TASTE_NIGHTLY_HOUR_UTC || lastNightlyOn === day) return 0;
  lastNightlyOn = day;
  return recomputeTasteProfiles(now);
}
