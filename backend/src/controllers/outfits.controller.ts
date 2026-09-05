import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { EVENT_TYPES, type EventType } from '../lib/attributes';
import { validateOutfit } from '../services/validator.service';
import { outfitsAround, pairScore, pairsFor } from '../services/pairing.service';
import { planOpinion, verdictOf } from '../services/compose.service';
import { todayWeatherFor } from './recreate.controller';

// The Outfits room's endpoints: what goes with a piece, whether a hand-built
// outfit holds up, and letting go of a saved one.

// The suggestion pool: owned, catalogued, clean, not suppressed, not an
// unanswered twin, and a wearable category (a swatch tagged "other" is not).
async function ownedReady(userId: string) {
  return prisma.wardrobeItem.findMany({
    where: { userId, owned: true, status: 'ready', suppressed: false, state: 'clean', twinOfId: null, category: { not: 'other' } },
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
  const [items, cleanShoes, weather] = await Promise.all([
    prisma.wardrobeItem.findMany({ where: { id: { in: itemIds }, userId: req.user.id } }),
    prisma.wardrobeItem.count({ where: { userId: req.user.id, owned: true, status: 'ready', suppressed: false, state: 'clean', category: 'footwear' } }),
    // The day's weather for their city, so warmth is judged on the real
    // temperature and the season tag stays out of it.
    todayWeatherFor(req.user.id).catch(() => null),
  ]);
  if (items.length !== new Set(itemIds).size) throw new HttpError(400, 'Some pieces are not in your closet');
  // No repeat rules here: composing is about whether the pieces hold
  // together, not whether you wore them on Tuesday.
  const v = validateOutfit(items, { eventType: eventType as EventType | undefined, hasCleanFootwear: cleanShoes > 0, weather: weather ? { temperatureC: weather.temperatureC, description: weather.description } : null });
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
  // The same verdict the brief carries, and one line of opinion in the
  // stylist's voice — the person's choice stands either way.
  res.json({
    validation: { ...v, pairQuality: n ? Math.round((q / n) * 10) / 10 : 0 },
    verdict: verdictOf(v),
    opinion: eventType ? planOpinion(v, items, eventType as EventType) : null,
  });
}

// DELETE /outfits/:id
export async function deleteOutfit(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const r = await prisma.outfit.deleteMany({ where: { id, userId: req.user.id } });
  if (r.count === 0) throw new HttpError(404, 'Outfit not found');
  res.json({ ok: true });
}

// GET /wardrobe/:id/story — last worn, worn with, cost per wear.
export async function itemStory(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const piece = await prisma.wardrobeItem.findFirst({ where: { id, userId: req.user.id } });
  if (!piece) throw new HttpError(404, 'Item not found');
  const logs = await prisma.wearLog.findMany({
    where: { userId: req.user.id, itemIds: { has: id } },
    orderBy: { wornOn: 'desc' },
    select: { wornOn: true, itemIds: true, eventType: true },
  });
  const counts = new Map<string, number>();
  for (const l of logs) for (const other of l.itemIds) if (other !== id) counts.set(other, (counts.get(other) ?? 0) + 1);
  const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  const items = topIds.length ? await prisma.wardrobeItem.findMany({ where: { id: { in: topIds } } }) : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const wearCount = logs.length;
  const days = new Set(logs.map((l) => l.eventType).filter(Boolean));
  res.json({
    wearCount,
    lastWorn: logs[0]?.wornOn ?? null,
    firstWorn: logs.length ? logs[logs.length - 1].wornOn : null,
    costPerWear: piece.price != null && wearCount > 0 ? Math.round(piece.price / wearCount) : null,
    wornWith: topIds.map((i) => ({ item: byId.get(i), times: counts.get(i) ?? 0 })).filter((w) => w.item),
    days: [...days],
    idleDays: logs[0] ? Math.floor((Date.now() - logs[0].wornOn.getTime()) / 86_400_000) : null,
  });
}
