import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';
import { closestOwned, outfitsAround, pairsFor, unlockAround, type Unlock } from '../services/pairing.service';

// In the store: a candidate piece (owned: false) goes through the same
// cataloguing as a real one, then the closet answers — how many outfits it
// makes, what it pairs with, the closest thing you already own, and what
// one more piece would unlock. Cached on the item; recomputed on demand.

export interface Verdict {
  outfits: number;
  pairs: number;
  closetSize: number;
  closest: { id: string; likeness: number } | null;
  unlock: Unlock | null;
  computedAt: string;
}

const FORMALITY_WORD: Record<number, string> = { 1: 'athletic', 2: 'casual', 3: 'smart-casual', 4: 'business', 5: 'formal' };
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

export async function computeVerdict(userId: string, itemId: string): Promise<{ verdict: Verdict; outfits: { items: string[]; score: number }[] }> {
  // The closet that answers: clean, catalogued, wearable, not suppressed, not an unanswered twin.
  const closet = await prisma.wardrobeItem.findMany({
    where: { userId, owned: true, status: 'ready', suppressed: false, state: 'clean', twinOfId: null, category: { not: 'other' } },
  });
  const piece = await prisma.wardrobeItem.findFirst({ where: { id: itemId, userId } });
  if (!piece) throw new HttpError(404, 'Piece not found');
  const all = outfitsAround(piece, closet, { limit: 80 });
  const pairs = pairsFor(piece, closet);
  const verdict: Verdict = {
    outfits: all.length,
    pairs: pairs.length,
    closetSize: closet.length,
    closest: closestOwned(piece, closet),
    unlock: unlockAround(piece, closet),
    computedAt: new Date().toISOString(),
  };
  await prisma.wardrobeItem.update({ where: { id: piece.id }, data: { verdict: verdict as unknown as object } });
  return { verdict, outfits: all.slice(0, 3).map((o) => ({ items: o.itemIds, score: o.score })) };
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
  const { verdict, outfits } = await computeVerdict(req.user.id, id);
  const ids = [...new Set(outfits.flatMap((o) => o.items))];
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: ids } } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const closest = verdict.closest ? await prisma.wardrobeItem.findUnique({ where: { id: verdict.closest.id } }) : null;
  const closestWears = closest ? await prisma.wearLog.count({ where: { userId: req.user.id, itemIds: { has: closest.id } } }) : 0;
  res.json({
    status: 'ready',
    piece,
    verdict,
    outfits: outfits.map((o) => ({ items: o.items.map((i) => byId.get(i)).filter(Boolean), score: o.score })),
    closest: closest ? { item: closest, wears: closestWears, likeness: verdict.closest?.likeness ?? 0 } : null,
    unlockLine: verdictLine(verdict),
  });
}

/** Wishlist nudges: "still thinking about the …?" when the day you chose arrives. */
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
