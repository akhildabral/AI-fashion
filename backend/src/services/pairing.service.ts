import type { WardrobeItem } from '@prisma/client';
import { deltaE, type Lab, type PaletteEntry } from '../lib/color';
import { validateOutfit } from './validator.service';
import type { EventType } from '../lib/attributes';

// Pairing: does this go with that? Complementary scoring (different role,
// colours that sit together, formality and warmth within reach, not two
// loud patterns), then whole outfits enumerated around a piece and passed
// through the same validator the brief uses. Deterministic, no model.

type Piece = Pick<
  WardrobeItem,
  'id' | 'category' | 'subtype' | 'primaryColor' | 'pattern' | 'formalityScore' | 'warmthValue' | 'layerRole' | 'colorPalette' | 'state' | 'imageUrl'
>;

const NEUTRALS = /black|white|grey|gray|navy|beige|cream|ivory|tan|camel|charcoal|khaki|denim|off-white|stone|sand|ecru/i;
const LOUD = /floral|animal|leopard|zebra|paisley|plaid|tartan|check|graphic|print|logo/i;

function slot(p: Piece): string {
  const r = p.layerRole ?? '';
  if (r === 'one-piece' || p.category === 'dress') return 'dress';
  if (r === 'outer' || p.category === 'outerwear') return 'outer';
  if (r === 'footwear' || p.category === 'footwear') return 'shoes';
  if (r === 'bottom' || p.category === 'bottom') return 'bottom';
  if (r === 'accessory' || p.category === 'accessory') return 'accessory';
  if (r === 'mid') return 'mid';
  if (p.category === 'other') return 'accessory';
  return 'top';
}

function dominant(p: Piece): Lab | null {
  const pal = p.colorPalette as unknown as PaletteEntry[] | null;
  const first = Array.isArray(pal) && pal.length ? pal[0] : null;
  return first && first.lab ? (first.lab as Lab) : null;
}

/** 0–10: how well two pieces sit together. Same slot never pairs. */
export function pairScore(a: Piece, b: Piece): number {
  const sa = slot(a);
  const sb = slot(b);
  if (sa === sb) return 0;
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

  return Math.max(0, Math.min(10, s));
}

export const PAIR_THRESHOLD = 6.5;

export interface PairResult {
  id: string;
  score: number;
}

/** Every owned piece that goes with this one, best first. */
export function pairsFor(piece: Piece, closet: Piece[]): PairResult[] {
  return closet
    .filter((c) => c.id !== piece.id)
    .map((c) => ({ id: c.id, score: pairScore(piece, c) }))
    .filter((r) => r.score >= PAIR_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

export interface EnumeratedOutfit {
  itemIds: string[];
  score: number;
}

/**
 * Outfits that include the piece, from its best pairs: top+bottom+shoes (or
 * dress+shoes), plus the outer layer when the piece is one. Validated by the
 * brief's own rules; capped so a big closet stays quick.
 */
export function outfitsAround(piece: Piece, closet: Piece[], opts: { eventType?: EventType; limit?: number } = {}): EnumeratedOutfit[] {
  const limit = opts.limit ?? 12;
  const byId = new Map(closet.map((c) => [c.id, c]));
  const pairs = pairsFor(piece, closet);
  const bySlot = (s: string) => pairs.filter((p) => slot(byId.get(p.id)!) === s).slice(0, 4).map((p) => byId.get(p.id)!);
  const mine = slot(piece);

  const combos: Piece[][] = [];
  const push = (arr: Piece[]) => combos.push(arr);
  const tops = mine === 'top' ? [piece] : bySlot('top');
  const bottoms = mine === 'bottom' ? [piece] : bySlot('bottom');
  // No shoes that pair (or none in the closet) is a warning, not a wall.
  const shoesPaired = mine === 'shoes' ? [piece] : bySlot('shoes');
  const shoes: (Piece | null)[] = shoesPaired.length ? shoesPaired : [null];
  const outers = mine === 'outer' ? [piece] : bySlot('outer');
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
      for (const c of combos.slice(0, 6)) for (const o of outers.slice(0, 2)) push([...c, o]);
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
    const v = validateOutfit(
      c.map((p) => ({ id: p.id, category: p.category, layerRole: p.layerRole, warmthValue: p.warmthValue, formalityScore: p.formalityScore, state: 'clean' })),
      { eventType: opts.eventType },
    );
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

/** The owned piece most like this one (same slot), to catch a duplicate. */
export function closestOwned(piece: Piece, closet: Piece[]): { id: string; likeness: number } | null {
  const same = closet.filter((c) => c.id !== piece.id && slot(c) === slot(piece));
  let best: { id: string; likeness: number } | null = null;
  for (const c of same) {
    let l = 0;
    if ((c.subtype ?? '').toLowerCase() === (piece.subtype ?? '').toLowerCase()) l += 4;
    const la = dominant(piece);
    const lb = dominant(c);
    if (la && lb) l += Math.max(0, 3 - deltaE(la, lb) / 10);
    else if ((c.primaryColor ?? '') === (piece.primaryColor ?? '')) l += 2;
    if (c.formalityScore != null && piece.formalityScore != null && c.formalityScore === piece.formalityScore) l += 1;
    if (!best || l > best.likeness) best = { id: c.id, likeness: Math.round(l * 10) / 10 };
  }
  return best;
}

/** Which one added piece (by slot) would unlock the most outfits around this one. */
export function unlockAround(piece: Piece, closet: Piece[]): { slot: string; gain: number } | null {
  const base = outfitsAround(piece, closet, { limit: 200 }).length;
  const mine = slot(piece);
  const candidates = ['top', 'bottom', 'shoes', 'outer'].filter((s) => s !== mine);
  let best: { slot: string; gain: number } | null = null;
  for (const s of candidates) {
    // A hypothetical neutral, mid-formality piece in that slot.
    const ghost: Piece = {
      id: `ghost-${s}`,
      category: s === 'shoes' ? 'footwear' : s === 'outer' ? 'outerwear' : s,
      subtype: null,
      primaryColor: 'neutral',
      pattern: null,
      formalityScore: piece.formalityScore ?? 3,
      warmthValue: piece.warmthValue ?? 3,
      layerRole: s === 'shoes' ? 'footwear' : s === 'outer' ? 'outer' : s === 'top' ? 'base' : 'bottom',
      colorPalette: null,
      state: 'clean',
      imageUrl: '',
    };
    const gain = outfitsAround(piece, [...closet, ghost], { limit: 200 }).length - base;
    if (gain > 0 && (!best || gain > best.gain)) best = { slot: s, gain };
  }
  return best;
}
