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

const SLOT_WORD: Record<string, string> = { top: 'a plain top', bottom: 'a pair of trousers', shoes: 'a pair of shoes', outer: 'a jacket' };
const SLOT_NOUN: Record<string, string> = { top: 'top', bottom: 'pair of trousers', shoes: 'pair of shoes', outer: 'jacket' };

function unlockWords(u: Unlock): string {
  if (u.colour && SLOT_NOUN[u.slot]) return `a ${u.colour} ${SLOT_NOUN[u.slot]}`;
  return SLOT_WORD[u.slot] ?? 'one more piece';
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
    unlockLine: verdict.unlock ? `With ${unlockWords(verdict.unlock)}, ${verdict.unlock.gain} more.` : null,
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
