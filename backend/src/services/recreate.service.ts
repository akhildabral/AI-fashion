// Recreate-from-my-closet: map someone else's outfit — a friend's shared
// look, or a look the Mirror generated from words — onto the viewer's own
// wardrobe. Matching is per slot role (a blazer stands in for a blazer, not
// for a shirt), scored by family likeness, colour closeness and formality
// closeness, gated by a minimum, and the recreated set is judged by the same
// validator the brief uses. Deterministic and free — no AI call.

import { deltaE, type Lab, type PaletteEntry } from '../lib/color';
import { normalizeColorName, type EventType, type Season } from '../lib/attributes';
import { likeness, subtypeFamily } from './pairing.service';
import { roleOf, validateOutfit, type ValidatorItem, type ValidatorWeather } from './validator.service';
import type { Verdict } from './compose.service';

export interface RecreateSource {
  id: string;
  category: string;
  subtype: string | null;
  primaryColor: string | null;
  formalityScore: number | null;
  warmthValue: number | null;
  pattern: string | null;
}

export interface RecreateCandidate extends RecreateSource {
  wearCount: number;
}

/**
 * Similarity score between a source garment and a closet candidate.
 * Category is a hard gate (checked by the caller); everything else is a
 * weighted vote. Range roughly 0–8. Kept for the twin matcher.
 */
export function matchScore(source: RecreateSource, candidate: RecreateSource): number {
  let score = 0;
  if (source.subtype && candidate.subtype) {
    if (source.subtype === candidate.subtype) score += 3;
    else if (
      source.subtype.includes(candidate.subtype) ||
      candidate.subtype.includes(source.subtype)
    )
      score += 1.5;
  }
  if (source.primaryColor && candidate.primaryColor) {
    if (source.primaryColor === candidate.primaryColor) score += 2;
  }
  if (source.formalityScore != null && candidate.formalityScore != null) {
    score += Math.max(0, 2 - Math.abs(source.formalityScore - candidate.formalityScore));
  }
  if (source.warmthValue != null && candidate.warmthValue != null) {
    score += Math.max(0, 1 - Math.abs(source.warmthValue - candidate.warmthValue) * 0.5);
  }
  if (source.pattern && candidate.pattern && source.pattern === candidate.pattern) {
    score += 0.5;
  }
  return score;
}

// ---- Slot-role matching ---------------------------------------------------------

/** A piece to recreate: the friend's garment, or a generated look's piece with derived attributes. */
export interface SlotSource extends RecreateSource {
  layerRole?: string | null;
  colorPalette?: unknown;
  material?: string | null;
}

/** A closet piece that can stand in; carries what the validator reads when present. */
export interface SlotCandidate extends SlotSource {
  state?: string | null;
  wearCount?: number | null;
  cutFor?: string | null;
  season?: string[] | null;
  texture?: string | null;
  details?: unknown;
  needsLayer?: boolean | null;
}

export interface SlotMatch<T extends SlotCandidate> {
  sourceId: string;
  /** The slot role both pieces fill: base | mid | outer | bottom | one-piece | footwear | accessory. */
  slot: string;
  match: T;
  score: number;
  /** Why, in words a person can read. */
  reasons: string[];
}

export interface MissingSlot {
  sourceId: string;
  slot: string;
  /** The piece in a phrase: "black loafers". */
  wanted: string;
  /** Why the slot is empty: "no clean footwear near black loafers". */
  reason: string;
}

export interface RecreateOptions {
  eventType?: EventType;
  weather?: ValidatorWeather | null;
  season?: Season;
  now?: Date;
  /** Item states that count as available for the verdict; default clean only. */
  availableStates?: readonly string[];
}

export interface RecreateOutcome<T extends SlotCandidate> {
  pairs: SlotMatch<T>[];
  /** The matched pieces, in source order — the recreated outfit. */
  outfit: T[];
  /** The validator's word on the recreated set; null when nothing matched. */
  verdict: Verdict | null;
  missing: MissingSlot[];
}

/** Colour closeness is Lab when both palettes exist; else the canonical name. */
const CLOSE_DELTA_E = 20;

function dominant(p: unknown): Lab | null {
  const pal = p as PaletteEntry[] | null | undefined;
  const first = Array.isArray(pal) && pal.length ? pal[0] : null;
  return first && first.lab ? (first.lab as Lab) : null;
}

/** 0–3 by ΔE when both palettes are known; 2 for the same canonical colour name; 0 otherwise. */
export function colourCloseness(a: SlotSource, b: SlotSource): { score: number; deltaE: number | null; sameName: boolean } {
  const la = dominant(a.colorPalette);
  const lb = dominant(b.colorPalette);
  const na = normalizeColorName(a.primaryColor);
  const nb = normalizeColorName(b.primaryColor);
  const sameName = !!na && na === nb;
  if (la && lb) {
    const d = deltaE(la, lb);
    return { score: Math.max(0, 3 - d / 10), deltaE: d, sameName };
  }
  return { score: sameName ? 2 : 0, deltaE: null, sameName };
}

/** −1 to 1.5 by formality gap; unknown on either side is neither for nor against. */
export function formalityCloseness(a: SlotSource, b: SlotSource): { score: number; gap: number | null } {
  if (a.formalityScore == null || b.formalityScore == null) return { score: 0, gap: null };
  const gap = Math.abs(a.formalityScore - b.formalityScore);
  return { score: gap === 0 ? 1.5 : gap === 1 ? 1 : gap === 2 ? 0 : -1, gap };
}

function asPairingPiece(p: SlotSource | SlotCandidate) {
  return {
    id: p.id,
    category: p.category,
    subtype: p.subtype,
    primaryColor: p.primaryColor,
    pattern: p.pattern,
    formalityScore: p.formalityScore,
    warmthValue: p.warmthValue,
    layerRole: p.layerRole ?? null,
    colorPalette: (p.colorPalette ?? null) as never,
    state: (p as SlotCandidate).state ?? 'clean',
    imageUrl: '',
    cutFor: (p as SlotCandidate).cutFor ?? null,
  };
}

export interface SlotScore {
  score: number;
  acceptable: boolean;
  reasons: string[];
}

/**
 * How well a closet piece stands in for a source piece in the same slot.
 * Score = likeness (same family, 0–8) + colour closeness + formality
 * closeness + a clean bonus + a small revealed-preference tiebreak. Colour
 * counts inside likeness and again on its own by design: a recreation is
 * colour-led. Acceptable when the families match and the formality is within
 * a step, or the colours sit within ΔE 20 in the same category.
 */
export function slotScore(source: SlotSource, cand: SlotCandidate): SlotScore {
  const reasons: string[] = [];
  const family = subtypeFamily(source.subtype, source.category) === subtypeFamily(cand.subtype, cand.category);
  const like = likeness(asPairingPiece(source), asPairingPiece(cand));
  const colour = colourCloseness(source, cand);
  const formality = formalityCloseness(source, cand);
  const clean = (cand.state ?? 'clean') === 'clean';

  let score = like + colour.score + formality.score + (clean ? 0.5 : 0) + Math.min(0.4, (cand.wearCount ?? 0) * 0.05);
  // Likeness is zero across categories; the family still counts when it
  // matches there (a blazer filed under top, another under outerwear).
  if (family && like === 0) score += 2;

  if (family) reasons.push((source.subtype ?? '').toLowerCase() === (cand.subtype ?? '').toLowerCase() ? 'the same type' : 'the same kind of piece');
  if (colour.deltaE != null && colour.deltaE < 12) reasons.push('colours that match closely');
  else if (colour.sameName) reasons.push(`the same ${normalizeColorName(source.primaryColor)}`);
  else if (colour.deltaE != null && colour.deltaE < CLOSE_DELTA_E) reasons.push('a close colour');
  if (formality.gap != null && formality.gap <= 1) reasons.push(formality.gap === 0 ? 'the same formality' : 'formality within a step');
  if (!clean) reasons.push('not clean today');

  const formalityOk = formality.gap == null || formality.gap <= 1;
  const closeColour = colour.deltaE != null && colour.deltaE < CLOSE_DELTA_E && cand.category === source.category;
  const acceptable = (family && formalityOk) || closeColour;
  return { score: Math.round(score * 10) / 10, acceptable, reasons };
}

const SLOT_WORD: Record<string, string> = {
  base: 'top',
  mid: 'mid layer',
  outer: 'outer layer',
  bottom: 'bottom',
  'one-piece': 'one-piece',
  footwear: 'footwear',
  accessory: 'accessory',
};

export function slotWord(slot: string): string {
  return SLOT_WORD[slot] ?? slot;
}

/** "black loafers" — the source in a phrase. */
export function wantedPhrase(source: SlotSource): string {
  const noun = (source.subtype ?? source.category).toLowerCase();
  const colour = normalizeColorName(source.primaryColor);
  // "black loafers" already names its colour; "loafers" does not.
  return colour && !noun.includes(colour) ? `${colour} ${noun}` : noun;
}

function toValidatorItem(p: SlotCandidate): ValidatorItem {
  return {
    id: p.id,
    category: p.category,
    layerRole: p.layerRole ?? null,
    warmthValue: p.warmthValue,
    formalityScore: p.formalityScore,
    state: p.state ?? 'clean',
    cutFor: p.cutFor,
    subtype: p.subtype,
    season: p.season,
    pattern: p.pattern,
    material: p.material,
    texture: p.texture,
    details: p.details,
    needsLayer: p.needsLayer,
  };
}

/**
 * Rebuild a set of pieces from a closet, slot by slot. Greedy per source in
 * the order given; each closet piece stands in at most once; a slot with no
 * acceptable candidate is reported as missing, in words. The matched set is
 * then judged by the validator for the event and the day.
 */
export function recreateFromPieces<T extends SlotCandidate>(sources: SlotSource[], closet: T[], opts: RecreateOptions = {}): RecreateOutcome<T> {
  const used = new Set<string>();
  const pairs: SlotMatch<T>[] = [];
  const missing: MissingSlot[] = [];
  const cleanOnly = (opts.availableStates ?? ['clean']).every((s) => s === 'clean');

  for (const source of sources) {
    const slot = roleOf({ category: source.category, layerRole: source.layerRole ?? null, subtype: source.subtype });
    let best: { cand: T; scored: SlotScore } | null = null;
    for (const cand of closet) {
      if (used.has(cand.id)) continue;
      if (roleOf({ category: cand.category, layerRole: cand.layerRole ?? null, subtype: cand.subtype }) !== slot) continue;
      const scored = slotScore(source, cand);
      if (!scored.acceptable) continue;
      if (!best || scored.score > best.scored.score) best = { cand, scored };
    }
    if (best) {
      used.add(best.cand.id);
      pairs.push({ sourceId: source.id, slot, match: best.cand, score: best.scored.score, reasons: best.scored.reasons });
    } else {
      const wanted = wantedPhrase(source);
      missing.push({ sourceId: source.id, slot, wanted, reason: `no ${cleanOnly ? 'clean ' : ''}${slotWord(slot)} near ${wanted}` });
    }
  }

  const outfit = pairs.map((p) => p.match);
  let verdict: Verdict | null = null;
  if (outfit.length > 0) {
    const hasCleanFootwear = closet.some((c) => roleOf({ category: c.category, layerRole: c.layerRole ?? null, subtype: c.subtype }) === 'footwear' && (c.state ?? 'clean') === 'clean');
    const v = validateOutfit(outfit.map(toValidatorItem), {
      eventType: opts.eventType,
      weather: opts.weather ?? undefined,
      season: opts.season,
      now: opts.now,
      availableStates: opts.availableStates,
      hasCleanFootwear,
    });
    verdict = { ok: v.ok, violations: v.violations, warnings: v.warnings };
  }
  return { pairs, outfit, verdict, missing };
}
