import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { EVENT_TYPES, type EventType } from '../lib/attributes';
import { validateOutfit } from '../services/validator.service';
import { outfitsAround, pairScore, pairsFor } from '../services/pairing.service';

// The Outfits room's endpoints: what goes with a piece, whether a hand-built
// outfit holds up, and letting go of a saved one.

async function ownedReady(userId: string) {
  return prisma.wardrobeItem.findMany({
    where: { userId, owned: true, status: 'ready', suppressed: false },
  });
}

// GET /wardrobe/:id/pairs — "Goes with", and the outfits around this piece.
export async function itemPairs(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const closet = await ownedReady(req.user.id);
  const piece = closet.find((c) => c.id === id) ?? (await prisma.wardrobeItem.findFirst({ where: { id, userId: req.user.id } }));
  if (!piece) throw new HttpError(404, 'Item not found');
  const byId = new Map(closet.map((c) => [c.id, c]));
  const pairs = pairsFor(piece, closet)
    .slice(0, 12)
    .map((p) => ({ item: byId.get(p.id)!, score: p.score }));
  const all = outfitsAround(piece, closet, { limit: 60 });
  res.json({
    pairs,
    outfits: all.slice(0, 6).map((o) => ({ items: o.itemIds.map((i) => byId.get(i) ?? piece), score: o.score })),
    outfitCount: all.length,
  });
}

const validateSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(12),
  eventType: z.enum(EVENT_TYPES).optional(),
});

// POST /outfits/validate — live scoring while composing by hand.
export async function validateComposed(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { itemIds, eventType } = validateSchema.parse(req.body);
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: itemIds }, userId: req.user.id } });
  if (items.length !== new Set(itemIds).size) throw new HttpError(400, 'Some pieces are not in your closet');
  // No repeat rules here: composing is about whether the pieces hold
  // together, not whether you wore them on Tuesday.
  const v = validateOutfit(items, { eventType: eventType as EventType | undefined });
  let q = 0;
  let n = 0;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const s = pairScore(items[i], items[j]);
      if (s > 0) {
        q += s;
        n++;
      }
    }
  res.json({ validation: { ...v, pairQuality: n ? Math.round((q / n) * 10) / 10 : 0 } });
}

// DELETE /outfits/:id
export async function deleteOutfit(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const r = await prisma.outfit.deleteMany({ where: { id, userId: req.user.id } });
  if (r.count === 0) throw new HttpError(404, 'Outfit not found');
  res.json({ ok: true });
}
