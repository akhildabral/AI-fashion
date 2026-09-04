import type { WardrobeItem } from '@prisma/client';
import { deltaE, type Lab, type PaletteEntry } from '../lib/color';
import { validateOutfit, type ValidatorItem, type ValidatorWeather } from './validator.service';
import { deriveLayerRole, isStyleable, shoeFormalityOf, warmthFor, type EventType, type Hemisphere, type Season } from '../lib/attributes';

// Pairing: does this go with that? Complementary scoring (different role,
// colours that sit together, formality and warmth within reach, not two
// loud patterns), then whole outfits enumerated around a piece and passed
// through the same validator the brief uses. Deterministic, no model.

type Piece = Pick<
  WardrobeItem,
  'id' | 'category' | 'subtype' | 'primaryColor' | 'pattern' | 'formalityScore' | 'warmthValue' | 'layerRole' | 'colorPalette' | 'state' | 'imageUrl'
> & { cutFor?: string | null } & Partial<
    Pick<WardrobeItem, 'fit' | 'length' | 'details' | 'season' | 'material' | 'texture' | 'suppressed' | 'twinOfId' | 'twinResolvedAt' | 'status' | 'owned'>
  >;

export type PairingPiece = Piece;

export interface PoolOptions {
  /** Item states that count as available; default clean only. */
  availableStates?: readonly string[];
}

export interface AroundOptions extends PoolOptions {
  eventType?: EventType;
  limit?: number;
  weather?: ValidatorWeather | null;
  now?: Date;
  hemisphere?: Hemisphere;
  season?: Season;
}

/** Her pieces and his never pair; anyone's pair with both. */
function acrossTheLine(a: Piece, b: Piece): boolean {
  return (a.cutFor === 'womens' && b.cutFor === 'mens') || (a.cutFor === 'mens' && b.cutFor === 'womens');
}

const NEUTRALS = /black|white|grey|gray|navy|beige|cream|ivory|tan|camel|charcoal|khaki|denim|off-white|stone|sand|ecru|neutral/i;
const LOUD = /floral|animal|leopard|zebra|paisley|plaid|tartan|check|graphic|print|logo|stripe/i;

export function slot(p: Piece): string {
  const derived = p.subtype ? deriveLayerRole(p.category, p.subtype) : null;
  const r = derived && derived !== 'base' ? derived : p.layerRole ?? derived ?? '';
  if (r === 'one-piece' || p.category === 'dress') return 'dress';
  if (r === 'outer' || (p.category === 'outerwear' && r !== 'mid')) return 'outer';
  if (r === 'footwear' || p.category === 'footwear') return 'shoes';
  if (r === 'bottom' || p.category === 'bottom') return 'bottom';
  if (r === 'accessory' || p.category === 'accessory') return 'accessory';
  if (r === 'mid') return 'mid';
  if (p.category === 'other') return 'accessory';
  return 'top';
}

/** Pieces that may go into a pool: clean, catalogued, wearable, not suppressed, not an unanswered twin. */
export function usable(p: Piece, opts: PoolOptions = {}): boolean {
  return isStyleable(p, { states: opts.availableStates });
}

function dominant(p: Piece): Lab | null {
  const pal = p.colorPalette as unknown as PaletteEntry[] | null;
  const first = Array.isArray(pal) && pal.length ? pal[0] : null;
  return first && first.lab ? (first.lab as Lab) : null;
}

function detail(p: Piece, key: string): string {
  const d = p.details;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return '';
  const v = (d as Record<string, unknown>)[key];
  return typeof v === 'string' ? v.toLowerCase() : '';
}

/** Shoe formality against what it's worn with: −1 to +2 sits; outside that, the shoe is the wrong shoe. */
function shoeTerm(shoe: Piece, lower: Piece): number {
  const sf = shoeFormalityOf(shoe.subtype, shoe.formalityScore);
  const lf = lower.formalityScore;
  if (sf == null || lf == null) return 0;
  const delta = sf - lf;
  if (delta < -1 || delta > 2) return -2.5;
  if (delta === 2) return -0.5;
  return 0;
}

/** Proportion: two oversized pieces, a cropped top over a low rise, a relaxed leg under an oversized top. */
function silhouetteTerm(a: Piece, b: Piece): number {
  const sa = slot(a);
  const sb = slot(b);
  const isTop = (s: string) => s === 'top' || s === 'mid' || s === 'outer';
  let t = 0;
  if (a.fit === 'oversized' && b.fit === 'oversized') t -= 1.5;
  const [top, bottom] = isTop(sa) && sb === 'bottom' ? [a, b] : isTop(sb) && sa === 'bottom' ? [b, a] : [null, null];
  if (top && bottom) {
    if (top.length === 'cropped' && /low/.test(detail(bottom, 'rise'))) t -= 1;
    if (bottom.fit === 'relaxed' && top.fit === 'oversized') t -= 1;
  }
  return t;
}

/** 0–10: how well two pieces sit together. Same slot never pairs. */
export function pairScore(a: Piece, b: Piece): number {
  const sa = slot(a);
  const sb = slot(b);
  if (sa === sb) return 0;
  if (acrossTheLine(a, b)) return 0;
  if (a.category === 'other' || b.category === 'other') return 0;
  // A dress doesn't take a top or a bottom.
  if ((sa === 'dress' && (sb === 'top' || sb === 'bottom' || sb === 'mid')) || (sb === 'dress' && (sa === 'top' || sa === 'bottom' || sa === 'mid'))) return 0;

  let s = 5;

  // Colour: neutrals go with anything; otherwise reward either a clear
  // contrast or a close tonal match, and penalise the awkward middle.
  const na = NEUTRALS.test(a.primaryColor ?? '');
  const nb = NEUTRALS.test(b.primaryColor ?? '');
  if (na || nb) s += 2;
  else {
    const la = dominant(a);
    const lb = dominant(b);
    if (la && lb) {
      const d = deltaE(la, lb);
      if (d < 12) s += 1.5; // tonal
      else if (d > 40) s += 2; // contrast
      else s -= 1; // clashing middle
    }
  }

  // Formality within a step; two steps apart is a stretch.
  if (a.formalityScore != null && b.formalityScore != null) {
    const df = Math.abs(a.formalityScore - b.formalityScore);
    s += df === 0 ? 1.5 : df === 1 ? 1 : df === 2 ? -1 : -3;
  }

  // Warmth: layers should belong to the same season.
  if (a.warmthValue != null && b.warmthValue != null) {
    const dw = Math.abs(a.warmthValue - b.warmthValue);
    s += dw <= 2 ? 1 : dw <= 4 ? 0 : -1.5;
  }

  // Two loud patterns fight.
  if (LOUD.test(a.pattern ?? '') && LOUD.test(b.pattern ?? '')) s -= 2.5;

  // The shoe against the bottom (or the dress): sneakers under tailored
  // trousers and pumps over sweatpants both fall out here.
  if (sa === 'shoes' && (sb === 'bottom' || sb === 'dress')) s += shoeTerm(a, b);
  else if (sb === 'shoes' && (sa === 'bottom' || sa === 'dress')) s += shoeTerm(b, a);

  s += silhouetteTerm(a, b);

  return Math.max(0, Math.min(10, s));
}

export const PAIR_THRESHOLD = 6.5;

export interface PairResult {
  id: string;
  score: number;
}

/** Every owned piece that goes with this one, best first. Only clean, wearable pieces are in the pool. */
export function pairsFor(piece: Piece, closet: Piece[], opts: PoolOptions = {}): PairResult[] {
  return closet
    .filter((c) => c.id !== piece.id && usable(c, opts))
    .map((c) => ({ id: c.id, score: pairScore(piece, c) }))
    .filter((r) => r.score >= PAIR_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

export interface EnumeratedOutfit {
  itemIds: string[];
  score: number;
}

function toValidatorItem(p: Piece): ValidatorItem {
  return {
    id: p.id,
    category: p.category,
    layerRole: p.layerRole,
    warmthValue: p.warmthValue,
    formalityScore: p.formalityScore,
    state: p.state,
    cutFor: p.cutFor,
    subtype: p.subtype,
    season: p.season,
    pattern: p.pattern,
    material: p.material,
    texture: p.texture,
    details: p.details,
  };
}

/**
 * Outfits that include the piece, from its best pairs: top+bottom+shoes (or
 * dress+shoes), plus the outer layer when the piece is one. Validated by the
 * brief's own rules; capped so a big closet stays quick.
 */
export function outfitsAround(piece: Piece, closet: Piece[], opts: AroundOptions = {}): EnumeratedOutfit[] {
  const limit = opts.limit ?? 12;
  const pool = closet.filter((c) => c.id === piece.id || usable(c, opts));
  const byId = new Map(pool.map((c) => [c.id, c]));
  const pairs = pairsFor(piece, pool, opts);
  const bySlot = (s: string) => pairs.filter((p) => slot(byId.get(p.id)!) === s).slice(0, 4).map((p) => byId.get(p.id)!);
  const mine = slot(piece);
  const hasCleanFootwear = pool.some((c) => c.id !== piece.id && slot(c) === 'shoes') || mine === 'shoes';

  const combos: Piece[][] = [];
  const push = (arr: Piece[]) => combos.push(arr);
  const tops = mine === 'top' ? [piece] : bySlot('top');
  const bottoms = mine === 'bottom' ? [piece] : bySlot('bottom');
  // No shoes that pair (or none in the closet) is a warning, not a wall.
  const shoesPaired = mine === 'shoes' ? [piece] : bySlot('shoes');
  const shoes: (Piece | null)[] = shoesPaired.length ? shoesPaired : [null];
  // Layers over the core: outerwear and mid layers (a blazer, a cardigan) alike.
  const outers = mine === 'outer' ? [piece] : [...bySlot('outer').slice(0, 2), ...bySlot('mid').slice(0, 2)];
  const dresses = mine === 'dress' ? [piece] : bySlot('dress');

  if (mine === 'dress') {
    for (const sh of shoes) {
      push(sh ? [piece, sh] : [piece]);
      for (const o of outers.slice(0, 2)) push(sh ? [piece, sh, o] : [piece, o]);
    }
  } else {
    for (const t of tops)
      for (const b of bottoms)
        for (const sh of shoes) {
          const base = sh ? [t, b, sh] : [t, b];
          if (mine === 'outer') push([...base, piece]);
          else if (mine === 'accessory' || mine === 'mid') push([...base, piece]);
          else push(base);
        }
    if (mine !== 'outer' && mine !== 'dress' && mine !== 'accessory' && mine !== 'mid') {
      // With an outer layer on top of the best few.
      for (const c of combos.slice(0, 6)) for (const o of outers.slice(0, 3)) push([...c, o]);
    }
    if (mine === 'shoes' || mine === 'accessory' || mine === 'outer') for (const d of dresses) push([d, ...(mine === 'shoes' ? [] : shoes.slice(0, 1).filter((x): x is Piece => !!x)), piece]);
  }

  const seen = new Set<string>();
  const out: EnumeratedOutfit[] = [];
  for (const c of combos) {
    const ids = [...new Set(c.map((p) => p.id))];
    if (!ids.includes(piece.id)) continue;
    const key = [...ids].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const v = validateOutfit(c.map(toValidatorItem), {
      eventType: opts.eventType,
      weather: opts.weather ?? undefined,
      hasCleanFootwear,
      now: opts.now,
      hemisphere: opts.hemisphere,
      season: opts.season,
      availableStates: opts.availableStates,
    });
    if (!v.ok) continue;
    // Pair quality across the outfit, so the best-matched come first.
    let q = 0;
    let n = 0;
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) {
        q += pairScore(c[i], c[j]);
        n++;
      }
    out.push({ itemIds: ids, score: Math.round((v.score + (n ? (q / n) * 5 : 0)) * 10) / 10 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Subtype families: a polo is not a tank's twin, a loafer is not a sneaker's.
const FAMILIES: [RegExp, string][] = [
  [/camisole|\bcami\b|tank|vest top|bralette|bandeau|tube top|strapless|halter/, 'tank'],
  [/polo/, 'polo'],
  [/t-shirt|tee\b|tshirt/, 'tee'],
  [/sweater|jumper|pullover|cardigan|hoodie|sweatshirt|fleece|turtleneck|knit/, 'knit'],
  [/blouse|shirt/, 'shirt'],
  [/bodysuit/, 'bodysuit'],
  [/jean|denim/, 'jeans'],
  [/sweatpant|jogger|track pant|sweat pant/, 'sweats'],
  [/legging|tight/, 'leggings'],
  [/short/, 'shorts'],
  [/skirt/, 'skirt'],
  [/trouser|pant|slack|chino/, 'trousers'],
  [/sneaker|trainer|running|canvas|plimsoll|skate/, 'sneaker'],
  [/boot/, 'boot'],
  [/sandal|flip|slide|espadrille/, 'sandal'],
  [/pump|heel|stiletto|court|slingback|wedge/, 'heel'],
  [/loafer|mule|moccasin|flat|oxford|derby|brogue|monk|mary jane/, 'flat'],
  [/blazer/, 'blazer'],
  [/cardigan|waistcoat|gilet|vest/, 'layer'],
  [/coat|trench|parka|puffer/, 'coat'],
  [/jacket|bomber|windbreaker|anorak|shacket|overshirt/, 'jacket'],
  [/jumpsuit|romper|playsuit|overall|dungaree/, 'jumpsuit'],
  [/dress|gown|kaftan/, 'dress'],
  [/bag|tote|clutch|backpack/, 'bag'],
  [/belt/, 'belt'],
  [/scarf/, 'scarf'],
  [/hat|cap|beanie/, 'hat'],
];

/** The family a subtype belongs to; the subtype's first word when no family matches. */
export function subtypeFamily(subtype: string | null | undefined, category?: string): string {
  const sub = (subtype ?? '').toLowerCase().trim();
  if (!sub) return category ?? '';
  const hit = FAMILIES.find(([re]) => re.test(sub));
  return hit ? hit[1] : sub.split(/\s+/).pop() ?? sub;
}

/** 0–8: how alike two pieces are. Zero across categories or families — a polo is not a tank's twin. */
export function likeness(piece: Piece, other: Piece): number {
  if (other.id === piece.id) return 0;
  if (other.category !== piece.category) return 0;
  if (acrossTheLine(other, piece)) return 0;
  if (slot(other) !== slot(piece)) return 0;
  const fa = subtypeFamily(piece.subtype, piece.category);
  const fb = subtypeFamily(other.subtype, other.category);
  if (fa !== fb) return 0;
  let l = 2;
  if ((other.subtype ?? '').toLowerCase() === (piece.subtype ?? '').toLowerCase()) l += 2;
  const la = dominant(piece);
  const lb = dominant(other);
  if (la && lb) l += Math.max(0, 3 - deltaE(la, lb) / 10);
  else if ((other.primaryColor ?? '') === (piece.primaryColor ?? '')) l += 2;
  if (other.formalityScore != null && piece.formalityScore != null && other.formalityScore === piece.formalityScore) l += 1;
  return Math.round(l * 10) / 10;
}

/** The owned piece most like this one (same category and family), to catch a duplicate. */
export function closestOwned(piece: Piece, closet: Piece[]): { id: string; likeness: number } | null {
  let best: { id: string; likeness: number } | null = null;
  for (const c of closet) {
    const l = likeness(piece, c);
    if (l <= 0) continue;
    if (!best || l > best.likeness) best = { id: c.id, likeness: l };
  }
  return best;
}

// --- Ghost pieces: what one more piece would do ---------------------------

export const GHOST_COLOURS = ['black', 'white', 'navy', 'beige', 'grey'] as const;
export type GhostSlot = 'top' | 'bottom' | 'shoes' | 'outer' | 'dress';
export const GHOST_SLOTS: readonly GhostSlot[] = ['top', 'bottom', 'shoes', 'outer', 'dress'];

const GHOST_SUBTYPE: Record<GhostSlot, (formality: number) => string> = {
  top: (f) => (f <= 2 ? 't-shirt' : 'shirt'),
  bottom: (f) => (f <= 1 ? 'joggers' : f === 2 ? 'jeans' : f === 3 ? 'chinos' : 'trousers'),
  shoes: (f) => (f <= 2 ? 'sneakers' : f === 3 ? 'loafers' : f === 4 ? 'oxford shoes' : 'heels'),
  outer: (f) => (f <= 2 ? 'denim jacket' : f === 3 ? 'jacket' : 'coat'),
  dress: (f) => (f <= 2 ? 'sundress' : f === 3 ? 'shirt dress' : 'dress'),
};

const GHOST_CATEGORY: Record<GhostSlot, string> = { top: 'top', bottom: 'bottom', shoes: 'footwear', outer: 'outerwear', dress: 'dress' };
const GHOST_ROLE: Record<GhostSlot, string> = { top: 'base', bottom: 'bottom', shoes: 'footwear', outer: 'outer', dress: 'one-piece' };

/** A hypothetical plain piece in a slot, to count what it would unlock. */
export function ghostPiece(spec: { slot: GhostSlot; colour: string; formality: number; cutFor?: string | null; season?: string[] }): Piece {
  const subtype = GHOST_SUBTYPE[spec.slot](spec.formality);
  const category = GHOST_CATEGORY[spec.slot];
  return {
    id: `ghost-${spec.slot}-${spec.colour}-${spec.formality}`,
    category,
    subtype,
    primaryColor: spec.colour,
    pattern: 'solid',
    formalityScore: spec.formality,
    warmthValue: warmthFor(category, subtype) ?? 3,
    layerRole: GHOST_ROLE[spec.slot],
    colorPalette: null,
    state: 'clean',
    imageUrl: '',
    cutFor: spec.cutFor ?? null,
    season: spec.season ?? [],
  };
}

/** The formality band most of the closet sits in (mode of formalityScore), default smart-casual. */
export function dominantFormality(closet: Piece[]): number {
  const counts = new Map<number, number>();
  for (const c of closet) if (c.formalityScore != null) counts.set(c.formalityScore, (counts.get(c.formalityScore) ?? 0) + 1);
  let best = 3;
  let n = 0;
  for (const [f, k] of counts) if (k > n || (k === n && Math.abs(f - 3) < Math.abs(best - 3))) (best = f), (n = k);
  return best;
}

export interface Unlock {
  slot: string;
  gain: number;
  colour?: string;
  formality?: number;
}

/**
 * Which one added piece (by slot and colour) would unlock the most outfits
 * around this one: the validated outfits that include the ghost.
 */
export function unlockAround(piece: Piece, closet: Piece[]): Unlock | null {
  const mine = slot(piece);
  const candidates: GhostSlot[] = (['top', 'bottom', 'shoes', 'outer'] as GhostSlot[]).filter((s) => s !== mine);
  const formality = dominantFormality(closet.filter((c) => usable(c)));
  let best: Unlock | null = null;
  for (const s of candidates) {
    for (const colour of ['black', 'white', 'navy', 'beige']) {
      const ghost = ghostPiece({ slot: s, colour, formality, cutFor: piece.cutFor });
      const gain = outfitsAround(piece, [...closet, ghost], { limit: 200 }).filter((o) => o.itemIds.includes(ghost.id)).length;
      if (gain > 0 && (!best || gain > best.gain)) best = { slot: s, gain, colour, formality };
    }
  }
  return best;
}

// --- Closet gaps: the one purchase that unlocks the most ------------------

export interface GapSuggestion {
  /** Wardrobe category of the wanted piece: top | bottom | footwear | outerwear | dress. */
  category: string;
  wanted: string;
  colour: string;
  formality: number;
  unlocks: number;
}

const FORMALITY_WORD: Record<number, string> = { 1: 'athletic', 2: 'casual', 3: 'smart-casual', 4: 'business', 5: 'formal' };
const GAP_NOUN: Record<GhostSlot, (f: number) => string> = {
  top: (f) => (f <= 2 ? 'tee' : 'shirt'),
  bottom: (f) => (f <= 2 ? 'pair of jeans' : 'trouser'),
  shoes: (f) => (f <= 2 ? 'sneaker' : f === 3 ? 'loafer' : 'shoe'),
  outer: (f) => (f <= 2 ? 'jacket' : f === 3 ? 'blazer' : 'coat'),
  dress: () => 'dress',
};

/**
 * Ghost simulation over the real closet: insert a plain piece per slot ×
 * colour × formality band, count the validated outfits it would join, and
 * return the best three. Bounded work: black in every slot and band first,
 * then the other colours only for the slots and bands that showed promise.
 */
export function closetGapsFor(
  closet: Piece[],
  opts: { maxEvaluations?: number; budgetMs?: number; outfitLimit?: number; cutFor?: string | null; formalities?: number[]; slots?: readonly GhostSlot[] } = {},
): { suggestions: GapSuggestion[]; outfitsPossible: number } {
  const started = Date.now();
  const maxEval = opts.maxEvaluations ?? 60;
  const budget = opts.budgetMs ?? 250;
  const outfitLimit = opts.outfitLimit ?? 40;
  const pool = closet.filter((c) => usable(c));
  const formalities = opts.formalities ?? [2, 3, 4];
  const slots = opts.slots ?? GHOST_SLOTS;
  const cutFor = opts.cutFor ?? majorityCutFor(pool);

  // What the closet makes today: outfits around each bottom and dress, deduped.
  const seen = new Set<string>();
  const seeds = pool.filter((c) => slot(c) === 'bottom' || slot(c) === 'dress').slice(0, 20);
  for (const seed of seeds) for (const o of outfitsAround(seed, pool, { limit: 30 })) seen.add([...o.itemIds].sort().join(','));
  const outfitsPossible = seen.size;

  let evaluations = 0;
  const results: GapSuggestion[] = [];
  const evaluate = (s: GhostSlot, colour: string, formality: number) => {
    if (evaluations >= maxEval || Date.now() - started > budget) return null;
    evaluations++;
    const ghost = ghostPiece({ slot: s, colour, formality, cutFor });
    const unlocks = outfitsAround(ghost, pool, { limit: outfitLimit }).length;
    const r: GapSuggestion = { category: GHOST_CATEGORY[s], wanted: `a ${colour} ${FORMALITY_WORD[formality] ?? ''} ${GAP_NOUN[s](formality)}`.replace(/\s+/g, ' '), colour, formality, unlocks };
    results.push(r);
    return r;
  };

  // Pass one: a black piece in every slot and band.
  const first: GapSuggestion[] = [];
  for (const s of slots) for (const f of formalities) {
    const r = evaluate(s, 'black', f);
    if (r) first.push(r);
  }
  // Pass two: the other colours where black showed promise.
  const promising = first.filter((r) => r.unlocks > 0).sort((a, b) => b.unlocks - a.unlocks).slice(0, 3);
  for (const p of promising) {
    const s = slots.find((x) => GHOST_CATEGORY[x] === p.category)!;
    for (const colour of GHOST_COLOURS) if (colour !== 'black') evaluate(s, colour, p.formality);
  }

  const suggestions = results
    .filter((r) => r.unlocks > 0)
    .sort((a, b) => b.unlocks - a.unlocks || a.formality - b.formality)
    .filter((r, i, arr) => arr.findIndex((x) => x.category === r.category && x.formality === r.formality) === i)
    .slice(0, 3);
  return { suggestions, outfitsPossible };
}

function majorityCutFor(closet: Piece[]): string | null {
  let her = 0;
  let him = 0;
  for (const c of closet) if (c.cutFor === 'womens') her++; else if (c.cutFor === 'mens') him++;
  if (her === 0 && him === 0) return null;
  return her >= him ? 'womens' : 'mens';
}
