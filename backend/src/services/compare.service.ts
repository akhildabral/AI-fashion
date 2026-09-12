import type { VerdictV2 } from './verdict.service';

// Compare two: two candidates side by side, each already through verdict v2.
// The edge on every plaque is read off the two verdicts deterministically —
// no model, no re-simulation — and one line says which earns its place and
// why the other would wait. Pure functions; the controller loads the cache.

export type Edge = 'a' | 'b' | 'tie';

export interface CompareEdge {
  /** More validated outfits from what you own. */
  outfits: Edge;
  /** The one that is not a near-duplicate of something owned. */
  duplicate: Edge;
  /** The higher taste score; a tie when either side has no record. */
  taste: Edge;
  /** Closer to how you shop: within beats above beats far; unknown ties. */
  budget: Edge;
  /** Fewer build flags; a tie when neither was read for the build. */
  build: Edge;
  /** The headline first (earns > could > wait), then the plaques that lean. */
  overall: Edge;
}

/** The piece as the line names it: its subtype, else its category. */
export interface ComparePiece {
  primaryColor?: string | null;
  subtype?: string | null;
  category: string;
}

const HEADLINE_RANK: Record<VerdictV2['headline'], number> = { earns: 2, could: 1, wait: 0 };
const BUDGET_RANK: Record<VerdictV2['money']['budget'], number | null> = { within: 0, above: 1, far: 2, unknown: null };

function lean(a: number | null, b: number | null, higherWins = true): Edge {
  if (a == null || b == null || a === b) return 'tie';
  return (a > b) === higherWins ? 'a' : 'b';
}

function buildFlags(v: VerdictV2): number | null {
  if (!v.build) return null;
  return (v.build.lines ?? []).filter((l) => l.tone === 'flag').length + (v.build.flags ?? []).length;
}

/** The edge on every plaque, and overall, from two verdicts. */
export function compareEdge(a: VerdictV2, b: VerdictV2): CompareEdge {
  const outfits = lean(a.closet.outfits, b.closet.outfits);
  const duplicate: Edge = a.closet.duplicate === b.closet.duplicate ? 'tie' : a.closet.duplicate ? 'b' : 'a';
  const taste = lean(a.taste?.score ?? null, b.taste?.score ?? null);
  const budget = lean(BUDGET_RANK[a.money.budget], BUDGET_RANK[b.money.budget], false);
  const build = lean(buildFlags(a), buildFlags(b), false);
  let overall = lean(HEADLINE_RANK[a.headline], HEADLINE_RANK[b.headline]);
  if (overall === 'tie') {
    // The plaques in the order they matter: what it makes, then whether you have it, then the rest.
    const votes = [outfits, duplicate, budget, taste, build];
    const first = votes.find((v) => v !== 'tie');
    overall = first ?? 'tie';
  }
  return { outfits, duplicate, taste, budget, build, overall };
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const times = (n: number) => (n === 0 ? 'never worn' : n === 1 ? 'worn once' : n === 2 ? 'worn twice' : `worn ${n} times`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const VERB: Record<VerdictV2['headline'], string> = { earns: 'earns its place', could: 'could work', wait: 'would wait' };

/** "the blazer", or "the camel coat" when both sides are the same kind of piece. */
export function compareNames(a: ComparePiece, b: ComparePiece): [string, string] {
  const kind = (p: ComparePiece) => (p.subtype ?? p.category).toLowerCase();
  const same = kind(a) === kind(b);
  const name = (p: ComparePiece) => `the ${same && p.primaryColor ? `${p.primaryColor.toLowerCase()} ` : ''}${kind(p)}`;
  const na = name(a);
  const nb = name(b);
  return na === nb ? ['the first', 'the second'] : [na, nb];
}

/** Why the side that waits would wait, as a clause after a colon; empty when the verdict gave no reason. */
function waitReason(v: VerdictV2): string {
  const c = v.closet.closest;
  if (v.closet.duplicate && c) return `: you own one in ${c.label.split(' ')[0] || 'the same shade'}, ${times(c.wears)}`;
  if (v.closet.outfits === 0) return ': nothing you own completes it yet';
  if (v.money.budget === 'far') return ': it sits well past what you spend';
  const flag = [...(v.build?.lines ?? []), ...(v.climate?.lines ?? []), ...(v.taste?.lines ?? [])].find((l) => l.tone === 'flag');
  return flag ? `: ${flag.line.replace(/\.$/, '').charAt(0).toLowerCase()}${flag.line.replace(/\.$/, '').slice(1)}` : '';
}

/**
 * One line in the stylist's voice. "The blazer earns its place; the coat
 * would wait: you own one in camel, worn twice." When both land on the same
 * headline the plaques decide; when nothing leans, say so.
 */
export function compareLine(a: { piece: ComparePiece; v2: VerdictV2 }, b: { piece: ComparePiece; v2: VerdictV2 }, edge: CompareEdge = compareEdge(a.v2, b.v2)): string {
  const [na, nb] = compareNames(a.piece, b.piece);
  if (a.v2.headline !== b.v2.headline) {
    const [win, lose, nw, nl] = HEADLINE_RANK[a.v2.headline] > HEADLINE_RANK[b.v2.headline] ? [a.v2, b.v2, na, nb] : [b.v2, a.v2, nb, na];
    const reason = lose.headline === 'wait' ? waitReason(lose) : lose.closet.outfits < win.closet.outfits ? `: ${plural(lose.closet.outfits, 'outfit')} to ${win.closet.outfits}` : '';
    return `${cap(nw)} ${VERB[win.headline]}; ${nl} ${VERB[lose.headline]}${reason}.`;
  }
  const both = a.v2.headline === 'earns' ? 'Both would earn their place' : a.v2.headline === 'could' ? 'Both could work' : 'I’d wait on both';
  if (edge.overall === 'tie') return `${both}; honestly, a coin toss: they make the same of your closet.`;
  const [win, lose, nw] = edge.overall === 'a' ? [a.v2, b.v2, na] : [b.v2, a.v2, nb];
  if (edge.outfits !== 'tie') return `${both}; ${nw} makes more of your closet: ${plural(win.closet.outfits, 'outfit')} to ${lose.closet.outfits}.`;
  if (edge.duplicate !== 'tie') return `${both}; ${nw} is the one you don't already own${lose.closet.closest ? `: the other is close to your ${lose.closet.closest.label}` : ''}.`;
  if (edge.budget !== 'tie') return `${both}; ${nw} sits closer to how you shop.`;
  if (edge.taste !== 'tie') return `${both}; ${nw} is closer to what you actually wear.`;
  return `${both}; ${nw} sits better on your build.`;
}
