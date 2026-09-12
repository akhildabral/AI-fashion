import type { StyleProfile, WardrobeItem } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { avoidsColour } from '../lib/occasion';
import { EVENT_TYPES, currentSeason, isHeavyBoot, isOpenToe, seasonAllows, type Season } from '../lib/attributes';
import { closestOwned, outfitsAround, pairsFor, subtypeFamily, unlockAround, type EnumeratedOutfit, type PairingPiece, type Unlock } from './pairing.service';
import { colourOf } from './validator.service';
import { ITEM_BONUS_CAP, PAIR_BONUS_CAP, TASTE_MIN_WEARS, colourFamilyOf, familyLabel, loadTasteProfile, tasteItemBonus, tastePairBonus, type TasteProfileData } from './taste.service';
import { getTripForecast, getWeather, type Weather } from './weather.service';
import { loadStyleableWardrobe } from '../controllers/wardrobe.controller';

// Verdict v2: the Fitting Room's answer to "should I buy it, will I wear it,
// does it flatter me". Pure functions over the candidate, the styleable
// closet, the fitting profile, the taste record, today's weather and the
// wear log; one DB wrapper loads those. The voice is the stylist's:
// suggestive, first person, British spelling, never "don't buy".

export const VERDICT_VERSION = 2;

export type VerdictHeadline = 'earns' | 'could' | 'wait';

export interface VerdictPlaqueLine {
  line: string;
  tone: 'good' | 'note' | 'flag';
}

export interface VerdictV2 {
  headline: VerdictHeadline;
  line: string;
  eventTypes: string[];
  closet: {
    outfits: number;
    pairs: number;
    closetSize: number;
    closest: { id: string; label: string; wears: number; likeness: number } | null;
    duplicate: boolean;
    unlock: { slot: string; colour: string | null; formality: string | null; gain: number } | null;
    lines: VerdictPlaqueLine[];
  };
  taste: { score: number; lines: VerdictPlaqueLine[] } | null;
  build: { lines: VerdictPlaqueLine[]; flags: string[] } | null;
  money: {
    price: number | null;
    currency: string | null;
    asOf: string | null;
    budget: 'within' | 'above' | 'far' | 'unknown';
    costPerWear: number | null;
    projectedWearsPerYear: number | null;
    lines: VerdictPlaqueLine[];
  };
  climate: { lines: VerdictPlaqueLine[] } | null;
  computedAt: string;
  version: number;
}

export interface Measurements {
  unit: 'cm' | 'in';
  chest?: number | null;
  waist?: number | null;
  hips?: number | null;
  shoulder?: number | null;
  inseam?: number | null;
  preferredFit?: 'slim' | 'regular' | 'relaxed' | null;
}

/** The candidate: a pairing piece plus what the shop (or the member) said about it. */
export type VerdictPiece = PairingPiece &
  Partial<Pick<WardrobeItem, 'currency' | 'listPrice' | 'salePrice' | 'seenPrice' | 'price' | 'seenAt' | 'lastCheckedAt' | 'createdAt' | 'fit' | 'length' | 'details' | 'weight' | 'colourVividness'>>;

/** An owned piece in the pool; wear counts ride along from `loadStyleableWardrobe`. */
export type VerdictClosetPiece = PairingPiece & { wearCount?: number; createdAt?: Date | null };

export type VerdictProfile = Partial<Pick<StyleProfile, 'bodyType' | 'heightCm' | 'skinTone' | 'avoidColors' | 'budgetBand' | 'currency' | 'city'>> & {
  measurements?: Measurements | null;
};

export interface VerdictWear {
  itemIds: string[];
  wornOn: Date;
  eventType?: string | null;
}

export interface VerdictInputs {
  piece: VerdictPiece;
  closet: VerdictClosetPiece[];
  profile: VerdictProfile | null;
  taste: TasteProfileData | null;
  /** Today's weather for the member's city; null without a city. */
  weather: Weather | null;
  /** Wear logs, the last 180 days is plenty. */
  wears: VerdictWear[];
  season?: Season;
  now?: Date;
}

export interface VerdictResult {
  v2: VerdictV2;
  /** The best few validated outfits, for the boards. */
  top: EnumeratedOutfit[];
  /** The legacy fields older clients still read. */
  legacy: { outfits: number; pairs: number; closetSize: number; closest: { id: string; likeness: number } | null; unlock: Unlock | null; computedAt: string };
}

// ---- Words -----------------------------------------------------------------

export const FORMALITY_WORD: Record<number, string> = { 1: 'athletic', 2: 'casual', 3: 'smart-casual', 4: 'business', 5: 'formal' };
// The ghost's noun by slot and band: the same ladder the gap finder names.
const SLOT_NOUN: Record<string, (f: number | undefined) => string> = {
  top: (f) => (f != null && f <= 2 ? 'tee' : 'shirt'),
  bottom: (f) => (f != null && f <= 2 ? 'pair of jeans' : 'trouser'),
  shoes: (f) => (f == null ? 'pair of shoes' : f <= 2 ? 'sneaker' : f === 3 ? 'loafer' : 'shoe'),
  outer: (f) => (f == null ? 'jacket' : f <= 2 ? 'jacket' : f === 3 ? 'blazer' : 'coat'),
  dress: () => 'dress',
};

/** "a navy smart-casual trouser" — the best ghost, in words. */
export function unlockWords(u: Unlock): string {
  const noun = SLOT_NOUN[u.slot]?.(u.formality) ?? 'piece';
  const words = [u.colour, u.formality != null ? FORMALITY_WORD[u.formality] : null, noun].filter(Boolean).join(' ');
  return `${/^[aeiou]/.test(words) ? 'an' : 'a'} ${words}`;
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const times = (n: number) => (n === 0 ? 'never worn' : n === 1 ? 'worn once' : n === 2 ? 'worn twice' : `worn ${n} times`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function pieceLabel(p: Pick<PairingPiece, 'primaryColor' | 'subtype' | 'category'>): string {
  return [p.primaryColor, p.subtype ?? p.category].filter(Boolean).join(' ');
}

const SYMBOL: Record<string, string> = { INR: '₹', USD: '$', GBP: '£', EUR: '€' };
export function money(currency: string | null, amount: number): string {
  const n = Number.isInteger(amount) ? amount.toLocaleString('en-IN') : amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!currency) return n;
  const sym = SYMBOL[currency];
  return sym ? `${sym}${n}` : `${currency} ${n}`;
}

// ---- Event types -------------------------------------------------------------

/** The member's top two kinds of day from the last 90 days, else work and casual. */
export function topEventTypes(wears: VerdictWear[], now = new Date()): string[] {
  const since = now.getTime() - 90 * 86_400_000;
  const counts = new Map<string, number>();
  for (const w of wears) {
    if (w.wornOn.getTime() < since || !w.eventType) continue;
    if (!(EVENT_TYPES as readonly string[]).includes(w.eventType)) continue;
    counts.set(w.eventType, (counts.get(w.eventType) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  const out = top.slice(0, 2);
  for (const fallback of ['work', 'casual']) if (out.length < 2 && !out.includes(fallback)) out.push(fallback);
  return out;
}

// ---- The closet ----------------------------------------------------------------

export const DUPLICATE_AT = 6;

function closetPlaque(piece: VerdictPiece, closet: VerdictClosetPiece[], eventTypes: string[], wears: VerdictWear[], season: Season | undefined) {
  const seen = new Set<string>();
  const outfits: EnumeratedOutfit[] = [];
  for (const eventType of eventTypes) {
    for (const o of outfitsAround(piece, closet, { limit: 80, eventType: eventType as (typeof EVENT_TYPES)[number], season })) {
      const key = [...o.itemIds].sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      outfits.push(o);
    }
  }
  outfits.sort((a, b) => b.score - a.score);
  const pairs = pairsFor(piece, closet);
  const closestRaw = closestOwned(piece, closet);
  const closestPiece = closestRaw ? closet.find((c) => c.id === closestRaw.id) ?? null : null;
  const closestWears = closestPiece ? closestPiece.wearCount ?? wears.filter((w) => w.itemIds.includes(closestPiece.id)).length : 0;
  const closest = closestRaw && closestPiece ? { id: closestRaw.id, label: pieceLabel(closestPiece), wears: closestWears, likeness: closestRaw.likeness } : null;
  const duplicate = !!closest && closest.likeness >= DUPLICATE_AT;
  const unlockRaw = unlockAround(piece, closet);
  const unlock = unlockRaw ? { slot: unlockRaw.slot, colour: unlockRaw.colour ?? null, formality: unlockRaw.formality != null ? FORMALITY_WORD[unlockRaw.formality] ?? null : null, gain: unlockRaw.gain } : null;

  const lines: VerdictPlaqueLine[] = [];
  const days = eventTypes.map((e) => (e === 'casual' ? 'weekends' : e === 'work' ? 'work days' : e === 'evening' ? 'evenings' : e === 'occasion' ? 'occasions' : 'training')).join(' and ');
  if (outfits.length === 0) lines.push({ line: pairs.length ? `Goes with ${plural(pairs.length, 'piece')} but nothing you own completes it yet.` : 'Goes with nothing you own yet.', tone: 'flag' });
  else lines.push({ line: `${plural(outfits.length, 'outfit')} from what you own, for ${days}.`, tone: outfits.length >= 3 ? 'good' : 'note' });
  if (pairs.length) lines.push({ line: `Pairs with ${pairs.length} of your ${closet.length} pieces.`, tone: 'note' });
  if (closest) {
    lines.push(
      duplicate
        ? { line: `Close to the ${closest.label} you own, ${times(closest.wears)}.`, tone: 'flag' }
        : { line: `Closest thing you own: the ${closest.label}, ${times(closest.wears)}; not a duplicate.`, tone: 'note' },
    );
  }
  if (unlockRaw && unlockRaw.gain > 0) lines.push({ line: `${cap(unlockWords(unlockRaw))} would take it to ${outfits.length + unlockRaw.gain}.`, tone: 'note' });

  return { outfits, pairs, closest, duplicate, unlock, unlockRaw, closestRaw, lines };
}

// ---- Taste -----------------------------------------------------------------------

export const TASTE_COLD_BELOW = TASTE_MIN_WEARS;
const LOUD_NAME = /red|orange|yellow|fuchsia|magenta|neon|lime|cobalt|emerald|purple|pink|turquoise|scarlet|crimson|saffron|electric/i;

function tastePlaque(piece: VerdictPiece, closet: VerdictClosetPiece[], pairs: { id: string }[], taste: TasteProfileData | null, eventType: string) {
  if (!taste || taste.sampleSize < TASTE_COLD_BELOW) return null;
  const item = tasteItemBonus(taste, piece, eventType) / ITEM_BONUS_CAP;
  const byId = new Map(closet.map((c) => [c.id, c]));
  const partners = pairs.slice(0, 5).map((p) => byId.get(p.id)).filter((c): c is VerdictClosetPiece => !!c);
  const pairAvg = partners.length ? partners.reduce((a, c) => a + tastePairBonus(taste, piece, c), 0) / partners.length / PAIR_BONUS_CAP : 0;
  const score = round2(clamp(0.7 * item + 0.3 * pairAvg, -1, 1));

  const lines: VerdictPlaqueLine[] = [];
  const fam = colourFamilyOf(piece);
  const colour = colourOf(piece);
  // A loud name counts as loud when no palette says otherwise.
  const vivid = colour?.band === 'vivid' || (!colour && LOUD_NAME.test(piece.primaryColor ?? ''));
  if (score >= 0.25) {
    const parts = [fam ? familyLabel(fam) : null, piece.fit ? `${piece.fit} cuts` : null, vivid ? null : 'quiet'].filter(Boolean);
    lines.push({ line: `Sits with what you reach for: ${parts.length ? parts.join(', ') : 'the same shades and cuts'}.`, tone: 'good' });
  } else if (score <= -0.25) {
    const colourOff = fam ? (taste.colourAffinity.avoids.includes(fam) || (taste.colourAffinity.families[fam]?.affinity ?? 0) < 0) : false;
    const line = colourOff ? (vivid ? 'Louder than what you usually wear.' : `${cap(familyLabel(fam!))} is a shade you rarely reach for.`) : 'A cut you rarely reach for.';
    lines.push({ line, tone: score <= -0.3 ? 'flag' : 'note' });
  } else {
    lines.push({ line: 'Neither your usual nor a stretch; the record has no strong view.', tone: 'note' });
  }
  if (partners.length && pairAvg >= 0.2) lines.push({ line: 'Next to pieces you already wear together.', tone: 'good' });
  else if (partners.length && pairAvg <= -0.2) lines.push({ line: 'Next to pieces you tend to swap out.', tone: 'note' });
  return { score, lines: lines.slice(0, 2) };
}

// ---- The build -----------------------------------------------------------------------

const PALE = /white|cream|ivory|ecru|beige|nude|blush|pastel|pale|baby|powder|oat|stone/;
const RICH = /red|emerald|cobalt|royal|mustard|orange|fuchsia|magenta|yellow|teal|burgundy|crimson|purple|saffron/;
const EARTH = /olive|rust|camel|terracotta|tan|khaki|chocolate|bronze|ochre|brown/;
const LOWER = new Set(['bottom', 'dress', 'outerwear']);

function detail(p: VerdictPiece, key: string): string {
  const d = p.details;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return '';
  const v = (d as Record<string, unknown>)[key];
  return typeof v === 'string' ? v.toLowerCase() : '';
}

function buildPlaque(piece: VerdictPiece, profile: VerdictProfile | null): { lines: VerdictPlaqueLine[]; flags: string[] } | null {
  if (!profile) return null;
  const m = profile.measurements ?? null;
  const known = !!(profile.bodyType || profile.heightCm || profile.skinTone || profile.avoidColors?.length || m);
  if (!known) return null;
  const lines: VerdictPlaqueLine[] = [];
  const flags: string[] = [];
  const fit = piece.fit?.toLowerCase() ?? null;
  const length = piece.length?.toLowerCase() ?? null;
  const body = profile.bodyType?.toLowerCase() ?? null;
  const height = profile.heightCm ?? null;
  const colour = (piece.primaryColor ?? '').toLowerCase();

  if (avoidsColour({ avoidColors: profile.avoidColors ?? [] }, piece.primaryColor ?? null)) {
    flags.push('avoid-colour');
    lines.push({ line: `${cap(colour)} is a shade you've asked me to avoid.`, tone: 'flag' });
  }

  const preferred = m?.preferredFit ?? null;
  if (preferred && fit && fit !== 'regular') {
    if (preferred === 'slim' && (fit === 'relaxed' || fit === 'oversized')) {
      flags.push('fit');
      lines.push({ line: `Cut ${fit}; you've told me you prefer a slim line.`, tone: 'flag' });
    } else if (preferred === 'relaxed' && fit === 'slim') {
      flags.push('fit');
      lines.push({ line: `Cut slim; you've told me you prefer room to move.`, tone: 'flag' });
    } else if (preferred === fit || (preferred === 'relaxed' && fit === 'oversized')) {
      lines.push({ line: `Cut ${fit}, the line you asked for.`, tone: 'good' });
    }
  } else if (preferred && fit === 'regular') {
    lines.push({ line: `A regular cut; it will sit ${preferred === 'slim' ? 'a touch looser' : preferred === 'relaxed' ? 'a touch closer' : 'as you like it'} than your usual.`, tone: 'note' });
  }

  if (fit === 'oversized' && (body === 'curvy' || body === 'plus')) lines.push({ line: 'Oversized on a curvier frame hides the waist; belt it or size down.', tone: 'note' });
  else if (fit === 'oversized' && body === 'slim') lines.push({ line: 'Oversized on a slim frame swallows the shoulders; keep the bottom narrow.', tone: 'note' });
  else if (fit === 'slim' && body === 'athletic' && piece.category === 'top') lines.push({ line: 'Slim through the chest on an athletic build; check the shoulder before the size.', tone: 'note' });

  if (length === 'cropped' && height != null && height >= 178) lines.push({ line: `Cropped${fit ? ` and ${fit}` : ''}; on a taller frame it will sit above the waistband.`, tone: 'note' });
  else if (length === 'long' && height != null && height <= 160 && LOWER.has(piece.category)) lines.push({ line: 'Long; on your height it will want taking up.', tone: 'note' });
  else if (length === 'cropped' && height != null && height <= 160) lines.push({ line: 'Cropped; on a shorter frame it lengthens the leg.', tone: 'good' });

  const rise = detail(piece, 'rise');
  if (/low/.test(rise) && (body === 'curvy' || body === 'plus')) lines.push({ line: 'A low rise; a high or mid rise sits better on a curvier frame.', tone: 'note' });
  if (m?.inseam != null && piece.category === 'bottom' && length === 'regular') {
    const inseamCm = m.unit === 'in' ? m.inseam * 2.54 : m.inseam;
    if (inseamCm >= 84) lines.push({ line: 'A long inseam; check the leg length, most regular cuts stop short.', tone: 'note' });
  }

  const tone = profile.skinTone?.toLowerCase() ?? null;
  if (tone && colour) {
    if ((tone === 'fair' || tone === 'light') && PALE.test(colour)) lines.push({ line: `${cap(colour)} on a fair complexion washes out under office light; wear it with something darker.`, tone: 'note' });
    else if ((tone === 'deep' || tone === 'tan') && RICH.test(colour)) lines.push({ line: `${cap(colour)} lifts a deeper complexion.`, tone: 'good' });
    else if ((tone === 'medium' || tone === 'tan') && EARTH.test(colour)) lines.push({ line: `${cap(colour)} sits with your colouring.`, tone: 'good' });
  }

  if (lines.length === 0) lines.push({ line: 'Nothing in the cut argues with your build.', tone: 'note' });
  return { lines: lines.slice(0, 4), flags };
}

// ---- The money -----------------------------------------------------------------------

// What a band comfortably spends on one ordinary piece; a coat costs more
// than a tee, so the ceiling scales by category. 'above' is a stretch, 'far'
// is well past it.
const BAND_CEILING: Record<string, Record<string, number>> = {
  INR: { budget: 2500, mid: 7000, premium: 20000, luxury: Infinity },
  AED: { budget: 150, mid: 450, premium: 1500, luxury: Infinity },
  USD: { budget: 40, mid: 120, premium: 400, luxury: Infinity },
};
const CATEGORY_FACTOR: Record<string, number> = { outerwear: 2, footwear: 1.5, dress: 1.5, accessory: 0.6 };
const FAR_AT = 1.75;

export function budgetFor(price: number | null, currency: string | null, band: string | null | undefined, category: string): VerdictV2['money']['budget'] {
  if (price == null || !currency || !band) return 'unknown';
  const table = BAND_CEILING[currency.toUpperCase()];
  const ceiling = table?.[band.toLowerCase()];
  if (ceiling == null) return 'unknown';
  if (ceiling === Infinity) return 'within';
  const limit = ceiling * (CATEGORY_FACTOR[category] ?? 1);
  if (price <= limit) return 'within';
  if (price <= limit * FAR_AT) return 'above';
  return 'far';
}

/**
 * How often a piece like this gets worn: the median annual rate of the owned
 * pieces in the same family over the last 180 days, else the category's
 * average, else a dozen times a year.
 */
export function projectedWears(piece: VerdictPiece, closet: VerdictClosetPiece[], wears: VerdictWear[], now = new Date()): { perYear: number; basis: 'family' | 'category' | 'default' } {
  const windowDays = 180;
  const since = now.getTime() - windowDays * 86_400_000;
  const counts = new Map<string, number>();
  for (const w of wears) {
    if (w.wornOn.getTime() < since) continue;
    for (const id of w.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const rate = (c: VerdictClosetPiece) => {
    const owned = c.createdAt ? clamp((now.getTime() - new Date(c.createdAt).getTime()) / 86_400_000, 30, windowDays) : windowDays;
    return ((counts.get(c.id) ?? 0) * 365) / owned;
  };
  const fam = subtypeFamily(piece.subtype, piece.category);
  const family = closet.filter((c) => c.id !== piece.id && c.category === piece.category && subtypeFamily(c.subtype, c.category) === fam);
  if (family.length) {
    const sorted = family.map(rate).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    if (median > 0) return { perYear: round1(median), basis: 'family' };
  }
  const category = closet.filter((c) => c.id !== piece.id && c.category === piece.category);
  if (category.length) {
    const mean = category.reduce((a, c) => a + rate(c), 0) / category.length;
    if (mean > 0) return { perYear: round1(mean), basis: 'category' };
  }
  return { perYear: 12, basis: 'default' };
}

function moneyPlaque(piece: VerdictPiece, closet: VerdictClosetPiece[], wears: VerdictWear[], profile: VerdictProfile | null, closest: VerdictV2['closet']['closest'], duplicate: boolean, now: Date): VerdictV2['money'] {
  const price = piece.salePrice ?? piece.listPrice ?? piece.seenPrice ?? piece.price ?? null;
  const currency = piece.currency ?? profile?.currency ?? null;
  const asOfDate = piece.lastCheckedAt ?? piece.seenAt ?? piece.createdAt ?? null;
  const asOf = asOfDate ? new Date(asOfDate).toISOString() : null;
  const budget = budgetFor(price, currency, profile?.budgetBand, piece.category);
  const projection = projectedWears(piece, closet, wears, now);
  const costPerWear = price != null ? round2(price / projection.perYear) : null;
  const fam = subtypeFamily(piece.subtype, piece.category) || piece.category;

  const lines: VerdictPlaqueLine[] = [];
  if (price == null) lines.push({ line: 'No price on record yet; add one and I can say what a wear would cost.', tone: 'note' });
  else {
    const when = asOfDate ? ` as of ${new Date(asOfDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
    lines.push({ line: `${money(currency, price)}${piece.salePrice != null && piece.listPrice != null && piece.salePrice < piece.listPrice ? ` down from ${money(currency, piece.listPrice)}` : ''}${when}.`, tone: 'note' });
  }
  if (budget === 'within') lines.push({ line: 'Inside what you told me you spend.', tone: 'good' });
  else if (budget === 'above') lines.push({ line: 'A stretch on your budget; make it a piece you would wear weekly.', tone: 'note' });
  else if (budget === 'far') lines.push({ line: 'Well past what you told me you spend.', tone: 'flag' });
  if (costPerWear != null) {
    const basis = projection.basis === 'family' ? `your other ${fam}s` : projection.basis === 'category' ? `your ${piece.category === 'footwear' ? 'shoes' : `${piece.category}s`}` : 'a typical piece';
    lines.push({ line: `About ${money(currency, costPerWear)} a wear if it goes out as often as ${basis}, ${Math.round(projection.perYear)} times a year.`, tone: 'note' });
  }
  if (duplicate && closest) lines.push({ line: `You already own this in ${closest.label.split(' ')[0] || 'the same shade'}, ${times(closest.wears)}.`, tone: 'flag' });

  return { price, currency, asOf, budget, costPerWear, projectedWearsPerYear: projection.perYear, lines };
}

// ---- The climate -----------------------------------------------------------------------

function climatePlaque(piece: VerdictPiece, weather: Weather | null, season: Season, now: Date): { lines: VerdictPlaqueLine[]; violation: boolean } | null {
  if (!weather) return null;
  const temp = weather.highC ?? weather.temperatureC;
  const city = weather.location;
  const wet = /rain|drizzle|snow|shower|storm|sleet/i.test(weather.description ?? '');
  const lines: VerdictPlaqueLine[] = [];
  let violation = false;
  const warmth = piece.warmthValue;

  if (piece.category === 'footwear') {
    if (isOpenToe(piece.subtype, piece.details) && (temp < 12 || wet)) {
      violation = true;
      lines.push({ line: wet ? `Open-toe in ${city}'s wet spell; it would wait for a dry week.` : `Open-toe at ${temp}°C in ${city}; it would sit in the box until it warms.`, tone: 'flag' });
    } else if (temp > 28 && isHeavyBoot(piece.subtype, warmth)) lines.push({ line: `Heavy at ${temp}°C in ${city}; an evening or a colder trip.`, tone: 'note' });
  }
  if (warmth != null && piece.category !== 'footwear' && piece.category !== 'accessory') {
    if (warmth >= 5 && temp >= 28) {
      violation = true;
      lines.push({ line: `Heavy for ${temp}°C in ${city}; a few weeks a year at most.`, tone: 'flag' });
    } else if (warmth >= 4 && temp >= 26) lines.push({ line: `Warm for ${city} today; an air-conditioned or evening piece.`, tone: 'note' });
    else if (warmth <= 1 && temp < 8) lines.push({ line: `Light for ${temp}°C; it wants a layer over it.`, tone: 'note' });
  }
  if (piece.season?.length && !seasonAllows(piece.season, { date: now, season })) lines.push({ line: `Tagged for ${piece.season.join(' and ')}; it's ${season === 'fall' ? 'autumn' : season} now.`, tone: 'note' });
  if (lines.length === 0) lines.push({ line: `Fine for ${city} at ${temp}°C today.`, tone: 'good' });
  return { lines, violation };
}

// ---- The headline -----------------------------------------------------------------------

function headlineFor(v: {
  outfits: number;
  duplicate: boolean;
  closest: VerdictV2['closet']['closest'];
  unlock: Unlock | null;
  tasteScore: number | null;
  tasteLine: VerdictPlaqueLine | null;
  budget: VerdictV2['money']['budget'];
  buildFlags: string[];
  buildLines: VerdictPlaqueLine[];
  climateViolation: boolean;
  climateLine: VerdictPlaqueLine | null;
  piece: VerdictPiece;
}): { headline: VerdictHeadline; line: string } {
  const colour = (v.piece.primaryColor ?? '').toLowerCase();
  const avoid = v.buildFlags.includes('avoid-colour');
  if (v.duplicate && v.closest) return { headline: 'wait', line: `I'd wait on this one: you own it in ${v.closest.label.split(' ')[0] || 'this shade'}, ${times(v.closest.wears)}.` };
  if (v.outfits === 0) {
    const tail = v.unlock && v.unlock.gain > 0 ? `; ${unlockWords(v.unlock)} would change that.` : '.';
    return { headline: 'wait', line: `I'd wait on this one: nothing you own completes it yet${tail}` };
  }
  if (v.budget === 'far') return { headline: 'wait', line: "I'd wait on this one: it sits well past what you told me you spend." };
  if (avoid) return { headline: 'wait', line: `I'd wait on this one: ${colour || 'that'} is a shade you asked me to avoid.` };
  if (v.climateViolation && v.climateLine) return { headline: 'wait', line: `I'd wait on this one: ${lower(v.climateLine.line)}` };

  const tasteOff = v.tasteScore != null && v.tasteScore <= -0.3;
  const clean = v.outfits >= 3 && !tasteOff && (v.budget === 'within' || v.budget === 'unknown') && v.buildFlags.length === 0;
  if (clean) return { headline: 'earns', line: `It would earn its place: ${plural(v.outfits, 'outfit')} from what you own, and nothing like it in the closet.` };

  if (v.outfits < 3) {
    const tail = v.unlock && v.unlock.gain > 0 ? `; ${unlockWords(v.unlock)} would take it to ${v.outfits + v.unlock.gain}` : '';
    return { headline: 'could', line: `It could work: only ${plural(v.outfits, 'outfit')} so far${tail}.` };
  }
  if (v.buildFlags.length) {
    const flagged = v.buildLines.find((l) => l.tone === 'flag');
    return { headline: 'could', line: `It could work, though ${flagged ? lower(flagged.line) : 'the cut is not quite yours.'}` };
  }
  if (v.budget === 'above') return { headline: 'could', line: 'It could work: a stretch on your budget, so make it a piece you would wear weekly.' };
  if (tasteOff && v.tasteLine) return { headline: 'could', line: `It could work, though it's ${lower(v.tasteLine.line)}` };
  return { headline: 'could', line: 'It could work; nothing argues against it, nothing argues for it yet.' };
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---- Compute -----------------------------------------------------------------------

export function computeVerdictV2(input: VerdictInputs): VerdictResult {
  const now = input.now ?? new Date();
  const season = input.season ?? currentSeason(now);
  const eventTypes = topEventTypes(input.wears, now);
  const closet = closetPlaque(input.piece, input.closet, eventTypes, input.wears, season);
  const taste = tastePlaque(input.piece, input.closet, closet.pairs, input.taste, eventTypes[0]);
  const build = buildPlaque(input.piece, input.profile);
  const moneyPl = moneyPlaque(input.piece, input.closet, input.wears, input.profile, closet.closest, closet.duplicate, now);
  const climate = climatePlaque(input.piece, input.weather, season, now);

  const { headline, line } = headlineFor({
    outfits: closet.outfits.length,
    duplicate: closet.duplicate,
    closest: closet.closest,
    unlock: closet.unlockRaw,
    tasteScore: taste?.score ?? null,
    tasteLine: taste?.lines[0] ?? null,
    budget: moneyPl.budget,
    buildFlags: build?.flags ?? [],
    buildLines: build?.lines ?? [],
    climateViolation: climate?.violation ?? false,
    climateLine: climate?.lines.find((l) => l.tone === 'flag') ?? null,
    piece: input.piece,
  });

  const computedAt = now.toISOString();
  const v2: VerdictV2 = {
    headline,
    line,
    eventTypes,
    closet: {
      outfits: closet.outfits.length,
      pairs: closet.pairs.length,
      closetSize: input.closet.length,
      closest: closet.closest,
      duplicate: closet.duplicate,
      unlock: closet.unlock,
      lines: closet.lines,
    },
    taste,
    build,
    money: moneyPl,
    climate: climate ? { lines: climate.lines } : null,
    computedAt,
    version: VERDICT_VERSION,
  };
  return {
    v2,
    top: closet.outfits.slice(0, 3),
    legacy: { outfits: closet.outfits.length, pairs: closet.pairs.length, closetSize: input.closet.length, closest: closet.closestRaw, unlock: closet.unlockRaw, computedAt },
  };
}

// ---- The closet stamp -----------------------------------------------------------------------

/** FNV-1a over the parts, as a signed 32-bit int (the column is an Int). */
export function closetStamp(parts: { ownedIds: string[]; closetUpdatedAt: Date | string | null; profileUpdatedAt: Date | string | null; tasteComputedAt: Date | string | null }): number {
  const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : '');
  const s = [`v${VERDICT_VERSION}`, [...parts.ownedIds].sort().join(','), iso(parts.closetUpdatedAt), iso(parts.profileUpdatedAt), iso(parts.tasteComputedAt)].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

// ---- DB wrapper -----------------------------------------------------------------------

/** Today's weather for the city: the forecast's high when there is one, else live conditions. */
async function typicalWeather(city: string | null | undefined): Promise<Weather | null> {
  if (!city) return null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const f = await getTripForecast(city, today, today);
    const d = f.days[0];
    if (d) return { location: f.location ?? city, temperatureC: Math.round((d.minC + d.maxC) / 2), description: d.rainChance ? `${d.description}, rain likely` : d.description, highC: Math.round(d.maxC), lowC: Math.round(d.minC) };
  } catch {
    // live conditions below
  }
  try {
    return await getWeather(city);
  } catch {
    return null;
  }
}

/** The stamp the cached verdict must match: owned pieces, their last edit, the profile's, the taste record's. */
export async function stampFor(userId: string): Promise<number> {
  const [owned, profile, taste] = await Promise.all([
    prisma.wardrobeItem.findMany({ where: { userId, owned: true }, select: { id: true, updatedAt: true } }),
    prisma.styleProfile.findUnique({ where: { userId }, select: { updatedAt: true } }),
    prisma.tasteProfile.findUnique({ where: { userId }, select: { computedAt: true } }),
  ]);
  let latest: Date | null = null;
  for (const o of owned) if (!latest || o.updatedAt > latest) latest = o.updatedAt;
  return closetStamp({ ownedIds: owned.map((o) => o.id), closetUpdatedAt: latest, profileUpdatedAt: profile?.updatedAt ?? null, tasteComputedAt: taste?.computedAt ?? null });
}

/** Load everything the verdict reads and compute it. */
export async function verdictFor(userId: string, piece: WardrobeItem): Promise<VerdictResult> {
  const since = new Date(Date.now() - 180 * 86_400_000);
  const [closet, profile, taste, wears] = await Promise.all([
    loadStyleableWardrobe(userId).catch(() => []),
    prisma.styleProfile.findUnique({ where: { userId } }),
    loadTasteProfile(userId).catch(() => null),
    prisma.wearLog.findMany({ where: { userId, wornOn: { gte: since } }, select: { itemIds: true, wornOn: true, eventType: true }, orderBy: { wornOn: 'desc' }, take: 1000 }),
  ]);
  const weather = await typicalWeather(profile?.city);
  return computeVerdictV2({
    piece,
    closet: closet.filter((c) => c.id !== piece.id),
    profile: profile ? { ...profile, measurements: (profile.measurements as Measurements | null) ?? null } : null,
    taste,
    weather,
    wears,
  });
}
