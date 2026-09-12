import { BRANDS, chartFor, findBrand, type BrandEntry, type FitCategory, type Gender, type Region, type SizeChart, type SizeRow } from '../lib/size-charts';

// Fit references: "I'm an M in Zara, a 32 in Levi's" read against the brands'
// own charts gives a body range without a tape measure. Pure functions; the
// profile controller and the verdict call them. Everything here is in cm.

export type Feel = 'snug' | 'right' | 'roomy';
export type Scale = 'EU' | 'UK' | 'US';
export type Measure = 'chest' | 'waist' | 'hips' | 'inseam' | 'foot';
export type Confidence = 'high' | 'medium' | 'low';

export interface FitReference {
  category: FitCategory;
  brand: string;
  size: string;
  feel?: Feel | null;
  scale?: Scale | null;
}

export interface Range {
  lo: number;
  hi: number;
}

export type Inferred = Partial<Record<Measure, Range | null>>;

export interface Inference {
  unit: 'cm';
  source: 'brand-fit';
  confidence: Confidence;
  chest?: Range | null;
  waist?: Range | null;
  hips?: Range | null;
  inseam?: Range | null;
  foot?: Range | null;
  references: FitReference[];
  preferredFit: 'slim' | 'regular' | 'relaxed' | null;
  /** Which references the charts could read; the rest are kept but say nothing. */
  read: number;
}

export interface FitContext {
  gender: Gender;
  region?: Region | null;
}

const MEASURES: Measure[] = ['chest', 'waist', 'hips', 'inseam', 'foot'];
// When a chart gives no neighbour to measure a step against.
const DEFAULT_HALF_STEP: Record<Measure, number> = { chest: 2, waist: 2, hips: 2, inseam: 1, foot: 0.35 };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The row for a size label; shoes match on the reference's scale (EU by default). */
export function rowFor(chart: SizeChart, size: string, scale?: Scale | null): { row: SizeRow; index: number } | null {
  const wanted = size.trim().toUpperCase();
  const key = chart.category === 'shoes' ? (scale ?? 'EU').toLowerCase() : null;
  const label = (r: SizeRow) => (key ? ((r as unknown as Record<string, string | undefined>)[key] ?? r.size) : r.size).toUpperCase();
  const index = chart.rows.findIndex((r) => label(r) === wanted);
  return index < 0 ? null : { row: chart.rows[index], index };
}

/**
 * The band a reference puts the member in, per measure. Snug means the piece
 * is tight, so the member sits at the upper end of the size and half a step
 * into the next; roomy is the mirror of that.
 */
export function bandFor(chart: SizeChart, index: number, feel: Feel | null | undefined, measure: Measure): Range | null {
  const row = chart.rows[index];
  const r = row[measure];
  if (!r) return null;
  const [lo, hi] = r;
  if (!feel || feel === 'right') return { lo, hi };
  const mid = (lo + hi) / 2;
  if (feel === 'snug') {
    const next = chart.rows[index + 1]?.[measure];
    const half = next ? (next[1] - hi) / 2 : DEFAULT_HALF_STEP[measure];
    return { lo: round1(mid), hi: round1(hi + Math.max(half, 0.5)) };
  }
  const prev = chart.rows[index - 1]?.[measure];
  const half = prev ? (lo - prev[0]) / 2 : DEFAULT_HALF_STEP[measure];
  return { lo: round1(lo - Math.max(half, 0.5)), hi: round1(mid) };
}

function intersect(a: Range, b: Range): Range | null {
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return lo <= hi ? { lo, hi } : null;
}

function union(a: Range, b: Range): Range {
  return { lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi) };
}

/** Mostly roomy reads as relaxed, mostly snug as slim; shoes don't vote. */
export function preferredFitFrom(refs: FitReference[]): Inference['preferredFit'] {
  let snug = 0;
  let roomy = 0;
  let voted = 0;
  for (const r of refs) {
    if (r.category === 'shoes' || !r.feel) continue;
    voted++;
    if (r.feel === 'snug') snug++;
    else if (r.feel === 'roomy') roomy++;
  }
  if (!voted) return null;
  if (roomy > voted / 2) return 'relaxed';
  if (snug > voted / 2) return 'slim';
  return 'regular';
}

/**
 * Read every reference against its chart and settle on one range per measure:
 * the intersection where the references agree, the union (and a lower
 * confidence) where they don't.
 */
export function inferMeasurements(refs: FitReference[], ctx: FitContext): Inference {
  const bands: Partial<Record<Measure, Range[]>> = {};
  let read = 0;
  for (const ref of refs) {
    const chart = chartFor(ref.brand, ref.category, ctx.gender, ctx.region ?? null);
    if (!chart) continue;
    const hit = rowFor(chart, ref.size, ref.scale);
    if (!hit) continue;
    read++;
    for (const m of MEASURES) {
      const band = bandFor(chart, hit.index, ref.feel, m);
      if (band) (bands[m] ??= []).push(band);
    }
  }

  const out: Inference = { unit: 'cm', source: 'brand-fit', confidence: 'low', references: refs, preferredFit: preferredFitFrom(refs), read };
  let widened = false;
  let agreed = 0;
  for (const m of MEASURES) {
    const list = bands[m];
    if (!list?.length) continue;
    let acc: Range | null = list[0];
    for (const b of list.slice(1)) {
      const both: Range | null = acc ? intersect(acc, b) : null;
      if (both) acc = both;
      else {
        widened = true;
        acc = union(acc ?? b, b);
      }
    }
    if (list.length > 1 && !widened) agreed++;
    out[m] = acc ? { lo: round1(acc.lo), hi: round1(acc.hi) } : null;
  }

  // Two references that agree on a measure are worth more than one; two that
  // disagree are worth less.
  if (read === 0 || widened) out.confidence = 'low';
  else if (agreed > 0) out.confidence = 'high';
  else out.confidence = 'medium';
  return out;
}

export interface SizeMatch {
  size: string;
  index: number;
  /** Every size in the chart, in order, for "try the L". */
  sizes: string[];
  /** true when every known measure sits inside the size's range. */
  inside: boolean;
  approx: boolean;
  brand: BrandEntry;
}

export interface BodyNumbers {
  unit?: 'cm' | 'in';
  chest?: number | null;
  waist?: number | null;
  hips?: number | null;
  inseam?: number | null;
  foot?: number | null;
}

function cm(v: number | null | undefined, unit: 'cm' | 'in' | undefined): number | null {
  if (v == null) return null;
  return unit === 'in' ? v * 2.54 : v;
}

/**
 * The size in a brand whose range best contains the numbers; nearest by
 * distance outside the range when nothing contains them all. Null when the
 * brand has no chart for the category or the numbers say nothing the chart
 * measures.
 */
export function sizeInBrand(body: BodyNumbers, brand: string, category: FitCategory, gender: Gender, region?: Region | null): SizeMatch | null {
  const entry = findBrand(brand);
  if (!entry) return null;
  const chart = chartFor(entry.id, category, gender, region ?? null);
  if (!chart) return null;
  const known: [Measure, number][] = [];
  for (const m of ['chest', 'waist', 'hips', 'inseam', 'foot'] as const) {
    const v = cm(body[m], body.unit);
    if (v != null && chart.rows.some((r) => r[m])) known.push([m, v]);
  }
  if (!known.length) return null;
  let best: { index: number; score: number } | null = null;
  chart.rows.forEach((row, index) => {
    let score = 0;
    let measured = 0;
    for (const [m, v] of known) {
      const r = row[m];
      if (!r) continue;
      measured++;
      const span = Math.max(r[1] - r[0], 1);
      if (v < r[0]) score += (r[0] - v) / span;
      else if (v > r[1]) score += (v - r[1]) / span;
    }
    if (!measured) return;
    if (!best || score < best.score - 1e-9) best = { index, score };
  });
  if (!best) return null;
  const { index, score } = best as { index: number; score: number };
  return { size: chart.rows[index].size, index, sizes: chart.rows.map((r) => r.size), inside: score === 0, approx: !!(chart.approx || chart.rows[index].approx), brand: entry };
}

/** The numbers the verdict should read: what the member typed, else the middle of what the charts implied. */
export function effectiveBody(m: { unit: 'cm' | 'in'; chest?: number | null; waist?: number | null; hips?: number | null; inseam?: number | null; inferred?: Inferred | null } | null | undefined): BodyNumbers | null {
  if (!m) return null;
  const out: BodyNumbers = { unit: 'cm' };
  let any = false;
  for (const k of ['chest', 'waist', 'hips', 'inseam'] as const) {
    const manual = cm(m[k], m.unit);
    const inf = m.inferred?.[k];
    const v = manual ?? (inf ? (inf.lo + inf.hi) / 2 : null);
    if (v != null) {
      out[k] = round1(v);
      any = true;
    }
  }
  const foot = m.inferred?.foot;
  if (foot) {
    out.foot = round1((foot.lo + foot.hi) / 2);
    any = true;
  }
  return any ? out : null;
}

/** The brand table as the UI needs it: one entry per brand with the sizes it offers this gender. */
export function fitBrandOptions(gender: Gender, region: Region | null) {
  return BRANDS.map((b) => {
    const top = chartFor(b.id, 'top', gender, region);
    const bottom = chartFor(b.id, 'bottom', gender, region);
    const shoes = chartFor(b.id, 'shoes', gender, region);
    const approxOf = (c: SizeChart) => !!(c.approx || c.rows.some((r) => r.approx));
    return {
      id: b.id,
      name: b.name,
      ...(top ? { top: { sizes: top.rows.map((r) => r.size), approx: approxOf(top) } } : {}),
      ...(bottom ? { bottom: { sizes: bottom.rows.map((r) => r.size), approx: approxOf(bottom) } } : {}),
      ...(shoes
        ? {
            shoes: {
              scales: {
                EU: shoes.rows.map((r) => r.eu ?? r.size),
                UK: shoes.rows.map((r) => r.uk ?? r.size),
                US: shoes.rows.map((r) => r.us ?? r.size),
              },
              approx: approxOf(shoes),
            },
          }
        : {}),
    };
  }).filter((b) => b.top || b.bottom || b.shoes);
}

/** A reference the table can read: a known brand, a chart for the category and gender, and a size on it. */
export function validReference(ref: FitReference, ctx: FitContext): boolean {
  const chart = chartFor(ref.brand, ref.category, ctx.gender, ctx.region ?? null);
  return !!chart && !!rowFor(chart, ref.size, ref.scale);
}

/** styleFor → the chart gender; 'unisex' charts fall back to men's where a brand has none. */
export function genderFor(styleFor: string | null | undefined): Gender {
  if (styleFor === 'female') return 'women';
  if (styleFor === 'male') return 'men';
  return 'unisex';
}

/** The member's currency says which of a brand's regional charts to read. */
export function regionFor(currency: string | null | undefined): Region | null {
  switch (currency) {
    case 'INR':
      return 'IN';
    case 'AED':
      return 'AE';
    case 'GBP':
      return 'UK';
    case 'USD':
      return 'US';
    case 'EUR':
      return 'EU';
    default:
      return null;
  }
}
