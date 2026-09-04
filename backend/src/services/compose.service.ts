import type { WardrobeItem } from '@prisma/client';
import {
  EVENT_FORMALITY,
  isHeavyBoot,
  isOpenToe,
  seasonAllows,
  type EventType,
  type Hemisphere,
  type Season,
} from '../lib/attributes';
import { wearSignalBonus } from '../lib/wear-signal';
import { pairScore } from './pairing.service';
import { tasteItemBonus, tastePairBonus, type TasteProfileData } from './taste.service';
import { roleOf, validateOutfit, warmthBand, type RecentWear, type SlotSummary, type ValidationResult, type Violation } from './validator.service';
import type { SuggestedOutfit } from './wardrobe.service';
import type { Weather } from './weather.service';

// The composition flow, as pure functions: the pool is narrowed before the
// model sees it, the model's candidates are validated and ranked (taste
// shading the score, never overruling the rules), a failing first pass is
// re-prompted once with the violations named, and what ships always carries
// a verdict and a rationale that was built from the rules, not from praise.

// ---- Verdict -----------------------------------------------------------------

export interface Verdict {
  ok: boolean;
  violations: Violation[];
  warnings: Violation[];
}

export function verdictOf(v: Pick<ValidationResult, 'ok' | 'violations' | 'warnings'>): Verdict {
  return { ok: v.ok, violations: v.violations, warnings: v.warnings };
}

// ---- Pre-filter ----------------------------------------------------------------

type PoolItem = Pick<WardrobeItem, 'id' | 'category' | 'subtype' | 'layerRole' | 'formalityScore' | 'warmthValue' | 'season' | 'details'>;

export interface PrefilterOptions {
  eventType: EventType;
  /** 1–5; defaults to the event's target. */
  formalityTarget?: number;
  weather?: Weather | null;
  season?: Season;
  hemisphere?: Hemisphere;
  now?: Date;
}

const WET = /rain|drizzle|snow|shower|storm|sleet/i;

function fitsWeather(item: PoolItem, weather: Weather | null | undefined): boolean {
  if (!weather) return true;
  const temp = weather.temperatureC;
  const high = weather.highC ?? temp;
  const low = weather.lowC ?? temp;
  const role = roleOf(item);
  if (role === 'accessory') return true;
  if (role === 'footwear') {
    const wet = WET.test(weather.description ?? '');
    if (isOpenToe(item.subtype, item.details) && (low < 12 || wet)) return false;
    if (high > 28 && isHeavyBoot(item.subtype, item.warmthValue)) return false;
    return true;
  }
  if (item.warmthValue == null) return true;
  // A single piece warmer than the whole day's band is out; a light piece can
  // always be layered, so there is no lower bound per item.
  const [, max] = warmthBand(high);
  return item.warmthValue <= max + 1;
}

function formalityLevel(item: PoolItem, target: number): 0 | 1 | 2 {
  if (item.formalityScore == null) return 0;
  const gap = Math.abs(item.formalityScore - target);
  return gap <= 1 ? 0 : gap <= 2 ? 1 : 2;
}

/**
 * Narrow the styleable pool before the model sees it: formality within the
 * event's band (target ±1), warmth that suits the day, footwear that suits the
 * weather, and pieces in season. Every essential slot (top or one-piece,
 * bottom or one-piece, footwear) keeps at least one candidate: the band
 * relaxes to ±2, then the formality filter drops for that slot. Layers relax
 * to ±2 only — a blazer never enters a gym pool just because it is the only
 * layer.
 */
export function prefilterPool<T extends PoolItem>(items: T[], opts: PrefilterOptions): T[] {
  const target = opts.formalityTarget ?? EVENT_FORMALITY[opts.eventType];
  const season = opts.season;
  const weatherOk = (i: T) => fitsWeather(i, opts.weather);
  const seasonOk = (i: T) => roleOf(i) === 'accessory' || seasonAllows(i.season, season ? { season } : { date: opts.now, hemisphere: opts.hemisphere });
  const byRole = new Map<string, T[]>();
  for (const i of items) {
    const r = roleOf(i);
    byRole.set(r, [...(byRole.get(r) ?? []), i]);
  }
  const ESSENTIAL: string[][] = [['base', 'one-piece'], ['bottom', 'one-piece'], ['footwear']];
  const OPTIONAL = ['mid', 'outer'];
  const keep = new Set<string>();

  const passesAt = (i: T, level: number) => {
    if (level >= 3) return true;
    if (!weatherOk(i) || !seasonOk(i)) return false;
    return formalityLevel(i, target) <= level;
  };
  const admit = (roles: string[], maxLevel: number) => {
    const pool = roles.flatMap((r) => byRole.get(r) ?? []);
    for (let level = 0; level <= maxLevel; level++) {
      const hits = pool.filter((i) => passesAt(i, level));
      if (hits.length > 0) {
        for (const h of hits) keep.add(h.id);
        return;
      }
    }
  };
  for (const roles of ESSENTIAL) admit(roles, 3);
  for (const role of OPTIONAL) admit([role], 1);
  for (const a of byRole.get('accessory') ?? []) if (passesAt(a, 1)) keep.add(a.id);
  return items.filter((i) => keep.has(i.id));
}

// ---- Validate and rank -------------------------------------------------------------

export interface ValidatedOutfit extends SuggestedOutfit {
  validation: ValidationResult;
}

export interface RankOptions {
  eventType?: EventType;
  weather?: Weather | null;
  recentWear: RecentWear[];
  wearCounts?: Map<string, number>;
  pollWins?: Map<string, number>;
  /** From days corrected by a photo: laid out but not worn, and worn instead. */
  wearSignals?: Map<string, { passedOver: number; chosenInstead: number }>;
  /** Whether the closet has clean shoes; read off the styleable items when not given. */
  hasCleanFootwear?: boolean;
  hemisphere?: Hemisphere;
  season?: Season;
  now?: Date;
  availableStates?: readonly string[];
  /** The taste layer: shades the score by how the person actually dresses. */
  taste?: TasteProfileData | null;
  /** 1–5; the event's target unless the taste layer moved it. */
  formalityTarget?: number;
}

// An outfit that is not an outfit (no shoes, no top, two bottoms, a swatch)
// is worse than one that is complete and wrong for the day.
const STRUCTURAL = new Set(['not-wearable', 'cut-for', 'availability', 'slots', 'completeness', 'footwear']);

export function violationWeight(violations: Violation[]): number {
  return violations.reduce((sum, v) => sum + (STRUCTURAL.has(v.rule) ? 2 : 1), 0);
}

/** Sum of the taste layer's opinion across an outfit, capped so it shades and never decides. */
export const TASTE_OUTFIT_CAP = 6;

export function tasteOutfitBonus(taste: TasteProfileData | null | undefined, items: WardrobeItem[], eventType?: EventType): number {
  if (!taste) return 0;
  let bonus = 0;
  for (const item of items) bonus += tasteItemBonus(taste, item, eventType);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) bonus += tastePairBonus(taste, items[i], items[j]);
  return Math.max(-TASTE_OUTFIT_CAP, Math.min(TASTE_OUTFIT_CAP, Math.round(bonus * 100) / 100));
}

// LLM proposes, rules validate: hard-failed candidates are dropped (unless
// nothing passes — then the least-bad ones are returned with their violations
// attached so the caller can say why they're a stretch), the rest are ranked
// by validator score plus a revealed-preference bonus for well-worn pieces
// and the taste layer's shading.
export function validateAndRank(outfits: SuggestedOutfit[], opts: RankOptions): ValidatedOutfit[] {
  const hasCleanFootwear =
    opts.hasCleanFootwear ??
    (outfits.some((o) => o.items.some((i) => (i as { closetHasFootwear?: boolean }).closetHasFootwear != null))
      ? outfits.some((o) => o.items.some((i) => (i as { closetHasFootwear?: boolean }).closetHasFootwear === true))
      : true);
  // The same set twice is one candidate.
  const seen = new Set<string>();
  const distinct = outfits.filter((o) => {
    const key = o.items.map((i) => i.id).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const validated = distinct.map((o) => {
    const validation = validateOutfit(o.items, {
      eventType: opts.eventType,
      weather: opts.weather ?? undefined,
      recentWear: opts.recentWear,
      hasCleanFootwear,
      hemisphere: opts.hemisphere,
      season: opts.season,
      now: opts.now,
      availableStates: opts.availableStates,
      formalityTarget: opts.formalityTarget,
    });
    const preferenceBonus = o.items.reduce(
      (sum, item) =>
        sum +
        Math.min(opts.wearCounts?.get(item.id) ?? 0, 5) * 2 +
        // Friend-approved pieces (clear poll wins) get an extra nudge.
        Math.min(opts.pollWins?.get(item.id) ?? 0, 3) * 3 +
        wearSignalBonus(opts.wearSignals?.get(item.id)),
      0,
    );
    const taste = tasteOutfitBonus(opts.taste, o.items, opts.eventType);
    return { ...o, validation: { ...validation, score: validation.score + preferenceBonus + taste } };
  });
  const passing = validated.filter((o) => o.validation.ok);
  if (passing.length > 0) return passing.sort((a, b) => b.validation.score - a.validation.score);
  // Least-bad first: fewest violations, then the set whose pieces sit closest
  // to the day's formality (sweatpants, not jeans, under the wrong shoes for
  // the gym), then fewest warnings, then score.
  const target = opts.formalityTarget ?? (opts.eventType ? EVENT_FORMALITY[opts.eventType] : null);
  const gap = (o: ValidatedOutfit) => {
    if (target == null) return 0;
    const scored = o.items.filter((i) => roleOf(i) !== 'accessory' && i.formalityScore != null);
    return scored.length ? scored.reduce((sum, i) => sum + Math.abs(i.formalityScore! - target), 0) / scored.length : 0;
  };
  return validated.sort(
    (a, b) =>
      violationWeight(a.validation.violations) - violationWeight(b.validation.violations) ||
      gap(a) - gap(b) ||
      a.validation.warnings.length - b.validation.warnings.length ||
      b.validation.score - a.validation.score,
  );
}

// ---- Compose with one retry ----------------------------------------------------------

export interface ComposeResult {
  top: ValidatedOutfit;
  verdict: Verdict;
  /** 1: the first pass passed; 2: the re-prompt did; 3: the pairer's fallback did; 0: nothing passed. */
  passedOn: 0 | 1 | 2 | 3;
  ranked: ValidatedOutfit[];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function nameOf(item: Pick<WardrobeItem, 'category' | 'subtype'>): string {
  return (item.subtype ?? item.category).toLowerCase();
}

/** "Do not: …" lines a re-prompt can obey, from the failing candidates. */
export function violationConstraints(ranked: ValidatedOutfit[]): string[] {
  const lines = new Set<string>();
  for (const o of ranked) {
    if (o.validation.ok) continue;
    const ids = o.items.map((i) => `${nameOf(i)} (id=${i.id})`).join(', ');
    for (const v of o.validation.violations) lines.add(`Do not: ${lower(v.message)}. (Rejected set: ${ids}.)`);
  }
  return [...lines].slice(0, 8);
}

/**
 * Ask, validate, and — when nothing passes — ask once more with the
 * violations named as constraints. If still nothing passes, the least-bad
 * candidate ships with an honest verdict. `exclude` are sets already shown
 * for the day ("Another"): a repeat is dropped whenever anything else remains.
 */
export async function composeWithRetry(
  suggest: (constraints: string[]) => Promise<SuggestedOutfit[]>,
  rank: RankOptions,
  opts: { exclude?: string[][]; fallback?: () => SuggestedOutfit[] } = {},
): Promise<ComposeResult | null> {
  const excluded = opts.exclude ?? [];
  const dropRepeats = (list: SuggestedOutfit[]) => {
    if (excluded.length === 0) return list;
    const fresh = list.filter((o) => !excluded.some((set) => sameSet(set, o.items.map((i) => i.id))));
    return fresh.length > 0 ? fresh : list;
  };
  const first = dropRepeats(await suggest([]));
  let ranked = validateAndRank(first, rank);
  if (ranked[0]?.validation.ok) return { top: ranked[0], verdict: verdictOf(ranked[0].validation), passedOn: 1, ranked };

  const constraints = violationConstraints(ranked);
  let second: SuggestedOutfit[] = [];
  try {
    second = dropRepeats(await suggest(constraints));
  } catch {
    second = [];
  }
  ranked = validateAndRank([...second, ...first], rank);
  if (ranked[0]?.validation.ok) return { top: ranked[0], verdict: verdictOf(ranked[0].validation), passedOn: 2, ranked };

  // The model failed twice: the pairer enumerates from the pool by the same
  // rules. Only when that finds nothing either does the least-bad ship.
  if (opts.fallback) {
    const det = dropRepeats(opts.fallback());
    if (det.length > 0) {
      const detRanked = validateAndRank(det, rank);
      if (detRanked[0]?.validation.ok) return { top: detRanked[0], verdict: verdictOf(detRanked[0].validation), passedOn: 3, ranked: [...detRanked.filter((o) => o.validation.ok), ...ranked] };
    }
  }
  if (!ranked[0]) return null;
  return { top: ranked[0], verdict: verdictOf(ranked[0].validation), passedOn: 0, ranked };
}

/**
 * Every rule-passing outfit a pool can make, enumerated slot by slot (top ×
 * bottom × shoes, with and without a layer; one-piece × shoes) and judged by
 * the validator — not by the pair threshold, which is a taste line, not a
 * rule. Best pair quality first. The deterministic fallback behind the model.
 */
export function enumerateFromPool<T extends WardrobeItem>(
  pool: T[],
  opts: { eventType?: EventType; weather?: Weather | null; season?: Season; limit?: number; pin?: T | null; hasCleanFootwear?: boolean },
): SuggestedOutfit[] {
  const byRole = (r: string) => pool.filter((i) => roleOf(i) === r);
  const cap = <U,>(list: U[], n: number) => list.slice(0, n);
  const tops = cap(byRole('base'), 8);
  const bottoms = cap(byRole('bottom'), 8);
  const onePieces = cap(byRole('one-piece'), 6);
  const shoes = cap(byRole('footwear'), 6);
  const layers = cap([...byRole('mid'), ...byRole('outer')], 6);
  const shoeOptions: (T | null)[] = shoes.length ? shoes : [null];
  const hasCleanFootwear = opts.hasCleanFootwear ?? shoes.length > 0;

  const combos: T[][] = [];
  for (const b of bottoms)
    for (const sh of shoeOptions) {
      for (const t of tops) {
        const core = sh ? [t, b, sh] : [t, b];
        combos.push(core);
        for (const l of layers) combos.push([...core, l]);
      }
      // A knit mid layer stands alone as the top.
      for (const l of layers) if (roleOf(l) === 'mid') combos.push(sh ? [l, b, sh] : [l, b]);
    }
  for (const d of onePieces)
    for (const sh of shoeOptions) {
      const core = sh ? [d, sh] : [d];
      combos.push(core);
      for (const l of layers) combos.push([...core, l]);
    }

  const seen = new Set<string>();
  const scored: { items: T[]; score: number }[] = [];
  for (const c of combos) {
    if (opts.pin && !c.some((i) => i.id === opts.pin!.id)) continue;
    const key = c.map((i) => i.id).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const v = validateOutfit(c, { eventType: opts.eventType, weather: opts.weather ?? undefined, season: opts.season, hasCleanFootwear });
    if (!v.ok) continue;
    let q = 0;
    let n = 0;
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) {
        q += pairScore(c[i], c[j]);
        n++;
      }
    scored.push({ items: c, score: v.score + (n ? (q / n) * 5 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 8)
    .map((o) => ({ items: o.items, rationale: '' }));
}

// ---- Rationales ---------------------------------------------------------------------

export interface CandidateWhy {
  fit?: string | null;
  colour?: string | null;
  formality?: string | null;
  weather?: string | null;
}

const EVENT_WORD: Record<EventType, string> = { work: 'work', casual: 'weekend', evening: 'evening', occasion: 'occasion', athletic: 'training' };

const BRITISH: [RegExp, string][] = [
  [/\bcolor(s?)\b/gi, 'colour$1'],
  [/\bgray\b/gi, 'grey'],
  [/\bfavorite\b/gi, 'favourite'],
  [/\bcenter\b/gi, 'centre'],
  [/\bcozy\b/gi, 'cosy'],
  [/\bpants\b/gi, 'trousers'],
  [/\bsneakers\b/gi, 'trainers'],
];

export function britishise(text: string): string {
  let out = text;
  for (const [re, rep] of BRITISH) out = out.replace(re, rep);
  return out;
}

const MAX_WORDS = 22;

export function clipWords(text: string, max = MAX_WORDS): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(' ');
  const cut = words.slice(0, max).join(' ').replace(/[,;:—-]+$/, '');
  return /[.!?]$/.test(cut) ? cut : `${cut}.`;
}

function sentence(text: string): string {
  const t = text.trim().replace(/\s*\(id:?\s*[a-f0-9-]+\)/gi, '').replace(/\bid=[a-f0-9-]+/gi, '');
  if (!t) return '';
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1).replace(/[.!?]$/, '');
}

// Garment nouns a reason might name; a reason about a jumpsuit is not a
// reason for an outfit with no jumpsuit in it.
const GARMENT_NOUNS = /\b(jumpsuit|romper|dress|gown|skirt|shorts|jeans|denim|chinos|trousers|sweatpants|joggers|leggings|sneakers|trainers|boots|sandals|heels|pumps|loafers|oxfords|coat|trench|parka|puffer|jacket|blazer|cardigan|sweater|jumper|hoodie|shirt|blouse|polo|tee|t-shirt|tank|camisole|scarf|belt|hat)\b/gi;

export function namesAbsentGarment(text: string, items: Pick<WardrobeItem, 'category' | 'subtype' | 'description'>[]): boolean {
  const have = items.map((i) => `${i.subtype ?? ''} ${i.category} ${i.description ?? ''}`.toLowerCase()).join(' ');
  const named = text.match(GARMENT_NOUNS) ?? [];
  return named.some((n) => {
    const w = n.toLowerCase();
    const stem = w.replace(/s$/, '');
    return !have.includes(stem) && !(w === 'tee' && /t-shirt/.test(have)) && !(w === 'trainers' && /sneaker/.test(have)) && !(w === 'denim' && /jean/.test(have));
  });
}

/** The best-matched pair in the outfit, named — what a stylist would point at first. */
function bestPair(items: WardrobeItem[]): { a: WardrobeItem; b: WardrobeItem; score: number } | null {
  let best: { a: WardrobeItem; b: WardrobeItem; score: number } | null = null;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const s = pairScore(items[i], items[j]);
      if (s > 0 && (!best || s > best.score)) best = { a: items[i], b: items[j], score: s };
    }
  return best;
}

/**
 * The line under a laid-out look, built after validation. A passing outfit
 * gets the model's reason only where it does not contradict a warning, else
 * a line from the pair scores; a warning rides along as a caveat. A failing
 * outfit gets the truth: what the closet could not do, and that this is the
 * closest. Never praise for its own sake.
 */
export function honestRationale(
  v: Pick<ValidationResult, 'ok' | 'violations' | 'warnings' | 'slots'>,
  items: WardrobeItem[],
  eventType: EventType,
  why?: CandidateWhy | null,
  weather?: Weather | null,
): string {
  const label = EVENT_WORD[eventType];
  if (!v.ok) {
    const reasons = v.violations.slice(0, 2).map((x) => lower(x.message)).join('; ');
    return britishise(`Nothing clean makes a complete ${label} outfit today: ${reasons}. Here is the closest.`);
  }
  const warned = new Set(v.warnings.map((w) => w.rule));
  const usable: [keyof CandidateWhy, string[]][] = [
    ['fit', ['pattern', 'slots']],
    ['colour', ['pattern']],
    ['formality', ['formality', 'shoe-formality']],
    ['weather', ['weather', 'season']],
  ];
  let lead = '';
  for (const [key, rules] of usable) {
    const text = why?.[key]?.trim();
    if (!text || rules.some((r) => warned.has(r))) continue;
    if (/\b(perfect|flawless|stunning|gorgeous|amazing|effortlessly chic)\b/i.test(text)) continue;
    if (namesAbsentGarment(text, items)) continue;
    lead = sentence(text);
    break;
  }
  if (!lead) {
    const pair = bestPair(items);
    if (pair) lead = `The ${nameOf(pair.a)} and the ${nameOf(pair.b)} sit together for ${label}`;
    else lead = `A complete ${label} look from what is clean`;
    if (weather && !warned.has('weather')) lead += ` at ${Math.round(weather.temperatureC)}°`;
    lead = sentence(lead);
  }
  const caveat = v.warnings[0] ? ` Mind: ${lower(v.warnings[0].message)}.` : '';
  return clipWords(britishise(`${lead}${caveat}`));
}

// ---- The user's own plan ---------------------------------------------------------------

function itemsInSlot(slots: SlotSummary, key: keyof SlotSummary, items: WardrobeItem[]): WardrobeItem[] {
  const ids = new Set(slots[key]);
  return items.filter((i) => ids.has(i.id));
}

/**
 * One line of opinion on pieces the person chose themselves. Honest, never
 * a block: says what pulls apart and offers the one swap that would fix it.
 */
export function planOpinion(v: ValidationResult, items: WardrobeItem[], eventType: EventType, target?: number): string {
  const label = EVENT_WORD[eventType];
  if (v.ok && v.warnings.length === 0) return `Your own choice, laid out ahead. It holds together for ${label}.`;
  if (v.ok) return britishise(clipWords(`Your own choice, laid out ahead. One note: ${lower(v.warnings[0].message)}.`, 26));

  const t = target ?? EVENT_FORMALITY[eventType];
  const scored = items.filter((i) => roleOf(i) !== 'accessory' && i.formalityScore != null);
  const furthest = [...scored].sort((a, b) => Math.abs(b.formalityScore! - t) - Math.abs(a.formalityScore! - t))[0];
  const rules = new Set(v.violations.map((x) => x.rule));
  const spans = v.warnings.some((w) => w.rule === 'formality' && /span/.test(w.message)) || rules.has('formality');
  const parts: string[] = [];
  if (spans && scored.length >= 2) {
    const sorted = [...scored].sort((a, b) => a.formalityScore! - b.formalityScore!);
    const low = sorted[0];
    const top = sorted[sorted.length - 1].formalityScore!;
    // The shoes get their own clause below; name a garment at the high end when one is there.
    const high = sorted.filter((i) => i.formalityScore === top && roleOf(i) !== 'footwear').pop() ?? sorted[sorted.length - 1];
    if (low.id !== high.id) parts.push(`${nameOf(low)} and ${nameOf(high)} pull in opposite directions for ${label}`);
  }
  const shoeV = v.violations.find((x) => x.rule === 'shoe-formality');
  const shoe = itemsInSlot(v.slots, 'footwear', items)[0];
  if (shoeV && shoe) parts.push(`the ${nameOf(shoe)} ${/not for an athletic/.test(shoeV.message) ? 'are not for training' : "don't help"}`);
  for (const x of v.violations) {
    if (x.rule === 'formality' || x.rule === 'shoe-formality') continue;
    if (x.rule === 'completeness' && v.slots.mid.length + v.slots.outer.length > 0 && v.slots.base.length === 0) {
      const layer = itemsInSlot(v.slots, v.slots.mid.length ? 'mid' : 'outer', items)[0];
      parts.push(layer ? `nothing under the ${nameOf(layer)}` : lower(x.message));
      continue;
    }
    parts.push(lower(x.message));
  }
  // One ask: the piece furthest from the day when it is two steps off (the
  // sweatpants under a blazer), else the top that is missing, else the shoes.
  const roleWord = (i: WardrobeItem) => {
    const r = roleOf(i);
    return r === 'base' ? 'top' : r === 'one-piece' ? 'dress' : r === 'footwear' ? 'shoes' : r === 'mid' || r === 'outer' ? 'layer' : r;
  };
  const missingTop = rules.has('completeness') && v.slots.base.length === 0 && v.slots.onePiece.length === 0;
  const ask =
    furthest && Math.abs(furthest.formalityScore! - t) >= 2
      ? `Want me to swap the ${roleWord(furthest)}?`
      : missingTop
        ? 'Want me to add a top?'
        : shoeV && shoe
          ? 'Want me to swap the shoes?'
          : furthest
            ? `Want me to swap the ${roleWord(furthest)}?`
            : 'Want me to rework it?';
  const first = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : `This does not hold together for ${label}`;
  const rest = parts.slice(1, 3).join('; ');
  return britishise(`${first}${rest ? `; ${rest}` : ''}. ${ask}`);
}

// ---- Wore instead: which slot changed --------------------------------------------------------

/**
 * When the worn set differs from the laid-out one, the slot that changed —
 * "footwear" when only the shoes moved — or null when several did.
 */
export function changedSlot(
  suggested: string[],
  worn: string[],
  byId: Map<string, Pick<WardrobeItem, 'id' | 'category' | 'subtype' | 'layerRole'>>,
): string | null {
  const s = new Set(suggested);
  const w = new Set(worn);
  const moved = [...suggested.filter((id) => !w.has(id)), ...worn.filter((id) => !s.has(id))];
  const roles = new Set(moved.map((id) => byId.get(id)).filter(Boolean).map((i) => roleOf(i!)));
  return roles.size === 1 ? [...roles][0] : null;
}
