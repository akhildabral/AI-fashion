import sharp from 'sharp';
import { deltaE, type Lab, type PaletteEntry } from '../lib/color';
import { matchScore, type RecreateSource } from './recreate.service';

// Is this piece already in the closet? One question asked at two moments:
// when a piece arrives (a twin), and when a photo of the day is read (which
// of mine is that?). Category is the hard gate; then type, colours in Lab,
// pattern, formality and warmth from the recreate matcher, a palette term,
// and a fingerprint of the cut-out that catches the same photo again.
// Deterministic and free.

export interface MatchSource extends RecreateSource {
  colorPalette?: unknown;
  fingerprint?: string | null;
  material?: string | null;
}
export interface MatchCandidate extends MatchSource {
  id: string;
  wearCount?: number;
}
export type Band = 'sure' | 'near' | 'new';
export interface Match<T extends MatchCandidate> {
  candidate: T;
  score: number;
  band: Band;
  /** Why, in words a person can read. */
  reasons: string[];
}

// Measured: the same piece again scores 11 (14 with the same photo); a
// sibling in another colour 8; a stranger of the same category under 2.
export const SURE_AT = 10;
export const NEAR_AT = 6;

/** A 64-bit difference hash of an image, as 16 hex digits. */
export async function fingerprintOf(image: Buffer): Promise<string> {
  const { data } = await sharp(image).flatten({ background: '#ffffff' }).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] < data[y * 9 + x + 1] ? '1' : '0';
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

export function hamming(a: string, b: string): number {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

function dominant(p: unknown): Lab | null {
  const pal = p as PaletteEntry[] | null | undefined;
  const first = Array.isArray(pal) && pal.length ? pal[0] : null;
  return first && first.lab ? (first.lab as Lab) : null;
}

export function bandOf(score: number): Band {
  return score >= SURE_AT ? 'sure' : score >= NEAR_AT ? 'near' : 'new';
}

/** Score one piece against one candidate of the same category. */
export function scorePair(source: MatchSource, cand: MatchCandidate): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = matchScore(source, cand);
  if (source.subtype && source.subtype === cand.subtype) reasons.push('the same type');
  if (source.primaryColor && source.primaryColor === cand.primaryColor) reasons.push(`the same ${source.primaryColor}`);
  if (source.pattern && source.pattern === cand.pattern && source.pattern !== 'solid') reasons.push(`the same ${source.pattern}`);
  if (source.material && source.material === cand.material) {
    score += 0.5;
    reasons.push(`the same ${source.material}`);
  }
  const la = dominant(source.colorPalette);
  const lb = dominant(cand.colorPalette);
  if (la && lb) {
    const d = deltaE(la, lb);
    if (d < 12) {
      score += 2;
      reasons.push('colours that match closely');
    } else if (d < 25) score += 1;
    else if (d > 45) score -= 1.5;
  }
  if (source.fingerprint && cand.fingerprint) {
    const h = hamming(source.fingerprint, cand.fingerprint);
    if (h <= 10) {
      score += 3;
      reasons.push('the same photo');
    } else if (h <= 16) score += 1.5;
  }
  return { score: Math.round(score * 10) / 10, reasons };
}

/** The best candidates for a piece, same category only, best first. */
export function matchPiece<T extends MatchCandidate>(source: MatchSource, closet: T[], opts: { exclude?: Set<string>; limit?: number } = {}): Match<T>[] {
  const out: Match<T>[] = [];
  for (const cand of closet) {
    if (cand.category !== source.category) continue;
    if (opts.exclude?.has(cand.id)) continue;
    const { score, reasons } = scorePair(source, cand);
    out.push({ candidate: cand, score, band: bandOf(score), reasons });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, opts.limit ?? 3);
}
