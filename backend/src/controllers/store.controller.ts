import type { Request, Response } from 'express';
import type { Prisma, WardrobeItem } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';
import type { Unlock } from '../services/pairing.service';
import { stampFor, unlockWords, verdictFor, type VerdictV2 } from '../services/verdict.service';
import { wrapOutbound } from '../services/affiliate.service';
import { compareEdge, compareLine } from '../services/compare.service';

// In the store: a candidate piece (owned: false) goes through the same
// cataloguing as a real one, then the closet answers — how many outfits it
// makes, what it pairs with, the closest thing you already own, and what
// one more piece would unlock. Verdict v2 (services/verdict) adds taste,
// build, money and climate. Cached on the item against a closet stamp;
// recomputed only when the closet, the profile or the taste record moved.

export { unlockWords };

export interface Verdict {
  outfits: number;
  pairs: number;
  closetSize: number;
  closest: { id: string; likeness: number } | null;
  unlock: Unlock | null;
  computedAt: string;
}

/** What the cache column holds: the legacy fields, v2, and the boards' item ids. */
interface CachedVerdict extends Verdict {
  v2: VerdictV2;
  top: { items: string[]; score: number }[];
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * The verdict in one or two sentences: what the piece goes with and makes
 * today, then what one more piece — by colour and formality band — would
 * take the count to. "Goes with 7 of your pieces and unlocks 4 outfits. A
 * navy smart-casual trouser would unlock 9."
 */
export function verdictLine(v: Pick<Verdict, 'pairs' | 'outfits' | 'unlock'>): string {
  const goes = `Goes with ${v.pairs} of your pieces`;
  const first =
    v.outfits > 0
      ? `${goes} and unlocks ${plural(v.outfits, 'outfit')}.`
      : v.pairs > 0
        ? `${goes} but makes no complete outfit yet.`
        : 'Goes with nothing you own yet.';
  if (!v.unlock || v.unlock.gain <= 0) return first;
  const total = v.outfits + v.unlock.gain;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${first} ${cap(unlockWords(v.unlock))} would unlock ${total}.`;
}

function cachedOf(piece: Pick<WardrobeItem, 'verdict' | 'verdictVersion'>, stamp: number): CachedVerdict | null {
  const v = piece.verdict as unknown as Partial<CachedVerdict> | null;
  if (!v || piece.verdictVersion !== stamp) return null;
  if (!v.v2 || typeof v.v2 !== 'object' || !Array.isArray(v.top)) return null;
  return v as CachedVerdict;
}

/** Compute and cache. The stamp is read first so a closet edit during the compute invalidates it. */
async function computeAndCache(userId: string, piece: WardrobeItem, stamp: number): Promise<CachedVerdict> {
  const { v2, top, legacy } = await verdictFor(userId, piece);
  const cached: CachedVerdict = { ...legacy, v2, top: top.map((o) => ({ items: o.itemIds, score: o.score })) };
  await prisma.wardrobeItem.update({ where: { id: piece.id }, data: { verdict: cached as unknown as Prisma.InputJsonValue, verdictVersion: stamp } });
  return cached;
}

export async function computeVerdict(userId: string, itemId: string): Promise<{ verdict: Verdict & { v2: VerdictV2 }; outfits: { items: string[]; score: number }[] }> {
  const piece = await prisma.wardrobeItem.findFirst({ where: { id: itemId, userId } });
  if (!piece) throw new HttpError(404, 'Piece not found');
  const stamp = await stampFor(userId);
  const { top, ...verdict } = await computeAndCache(userId, piece, stamp);
  return { verdict, outfits: top };
}

// GET /wardrobe/:id/verdict
export async function itemVerdict(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const piece = await prisma.wardrobeItem.findFirst({ where: { id, userId: req.user.id } });
  if (!piece) throw new HttpError(404, 'Piece not found');
  if (piece.status === 'processing') {
    res.status(202).json({ status: 'processing' });
    return;
  }
  if (piece.status === 'failed') {
    res.json({ status: 'failed' });
    return;
  }
  // Polls read the cache; only a moved closet, profile or taste record recomputes.
  const stamp = await stampFor(req.user.id);
  const fresh = req.query.fresh === '1' || req.query.fresh === 'true';
  const cached = (!fresh && cachedOf(piece, stamp)) || (await computeAndCache(req.user.id, piece, stamp));
  const { top, v2, ...verdict } = cached;
  const ids = [...new Set(top.flatMap((o) => o.items))];
  const items = ids.length ? await prisma.wardrobeItem.findMany({ where: { id: { in: ids }, userId: req.user.id } }) : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const closest = verdict.closest ? await prisma.wardrobeItem.findFirst({ where: { id: verdict.closest.id, userId: req.user.id } }) : null;
  res.json({
    status: 'ready',
    piece,
    verdict,
    v2,
    outfits: top.map((o) => ({ items: o.items.map((i) => byId.get(i)).filter(Boolean), score: o.score })),
    closest: closest ? { item: closest, wears: v2.closet.closest?.wears ?? 0, likeness: verdict.closest?.likeness ?? 0 } : null,
    unlockLine: verdictLine(verdict),
  });
}

// GET /wardrobe/compare?a=&b= — two candidates side by side. Each verdict
// comes from the cache (recomputed only when the closet moved); the edge on
// every plaque and the one line are read off the two verdicts.
export async function compareCandidates(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const a = typeof req.query.a === 'string' ? req.query.a : '';
  const b = typeof req.query.b === 'string' ? req.query.b : '';
  if (!a || !b) throw new HttpError(400, 'Pick two pieces to compare');
  if (a === b) throw new HttpError(400, 'Those are the same piece');
  const found = await prisma.wardrobeItem.findMany({ where: { id: { in: [a, b] }, userId: req.user.id } });
  const pa = found.find((p) => p.id === a);
  const pb = found.find((p) => p.id === b);
  if (!pa || !pb) throw new HttpError(404, 'Piece not found');
  if (pa.status === 'processing' || pb.status === 'processing') {
    res.status(202).json({ status: 'processing' });
    return;
  }
  if (pa.status === 'failed' || pb.status === 'failed') throw new HttpError(409, 'One of those pieces did not read; try it again first', { reason: 'failed' });
  const stamp = await stampFor(req.user.id);
  const [ca, cb] = await Promise.all([pa, pb].map((p) => cachedOf(p, stamp) ?? computeAndCache(req.user!.id, p, stamp)));
  const edge = compareEdge(ca.v2, cb.v2);
  const line = compareLine({ piece: pa, v2: ca.v2 }, { piece: pb, v2: cb.v2 }, edge);
  res.json({ a: { item: pa, v2: ca.v2 }, b: { item: pb, v2: cb.v2 }, edge, line });
}

/**
 * Wishlist nudges: "still thinking about the …?" when the day you chose
 * arrives. A nudge moved to a later day is not due, so it is left alone; a
 * cancelled one (nudgeAt null) never comes up.
 */
export async function sendWishlistNudges(now = new Date()): Promise<number> {
  const due = await prisma.wardrobeItem.findMany({
    where: { owned: false, nudgeAt: { lte: now } },
    select: { id: true, userId: true, subtype: true, category: true, primaryColor: true },
    take: 200,
  });
  let sent = 0;
  for (const it of due) {
    const label = [it.primaryColor, it.subtype ?? it.category].filter(Boolean).join(' ');
    const ok = await notify(it.userId, 'wishlist_nudge', null, { itemId: it.id, label }, { dedupeKey: `wish:${it.id}` });
    await prisma.wardrobeItem.update({ where: { id: it.id }, data: { nudgeAt: null } });
    if (ok) sent++;
  }
  return sent;
}

// GET /wardrobe/:id/outbound — "Open at the shop": the canonical link,
// wrapped in the retailer's affiliate template when one is configured and
// labelled so (the page shows "Affiliate" inline).
export async function itemOutbound(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const piece = await prisma.wardrobeItem.findFirst({
    where: { id: String(req.params.id), userId: req.user.id },
    select: { canonicalUrl: true, sourceUrl: true, retailer: true },
  });
  if (!piece) throw new HttpError(404, 'Piece not found');
  const link = piece.canonicalUrl ?? piece.sourceUrl;
  if (!link) throw new HttpError(404, 'This piece has no shop link', { reason: 'no-link' });
  const { url, affiliate } = wrapOutbound(link, piece.retailer);
  res.json({ url, affiliate, retailer: piece.retailer ?? null });
}
