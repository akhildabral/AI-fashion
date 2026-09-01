// Recreate-from-my-closet: map someone else's outfit onto the viewer's own
// wardrobe by attribute similarity. Deterministic and free — no AI call.

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
 * weighted vote. Range roughly 0–8.
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

const MATCH_THRESHOLD = 1;

export interface RecreateResult<T extends RecreateCandidate> {
  matched: { sourceId: string; match: T; score: number }[];
  missing: { sourceId: string; wanted: string }[];
}

/** Greedy best-match per source item; each closet piece used at most once. */
export function recreateOutfit<T extends RecreateCandidate>(
  sources: RecreateSource[],
  closet: T[],
): RecreateResult<T> {
  const used = new Set<string>();
  const matched: RecreateResult<T>['matched'] = [];
  const missing: RecreateResult<T>['missing'] = [];

  for (const source of sources) {
    let best: T | null = null;
    let bestScore = -1;
    for (const cand of closet) {
      if (used.has(cand.id) || cand.category !== source.category) continue;
      // Small revealed-preference tiebreak: loved pieces win close calls.
      const score = matchScore(source, cand) + Math.min(0.4, cand.wearCount * 0.05);
      if (score > bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    if (best && bestScore >= MATCH_THRESHOLD) {
      used.add(best.id);
      matched.push({ sourceId: source.id, match: best, score: bestScore });
    } else {
      missing.push({
        sourceId: source.id,
        wanted: [source.primaryColor, source.subtype ?? source.category]
          .filter(Boolean)
          .join(' '),
      });
    }
  }
  return { matched, missing };
}
