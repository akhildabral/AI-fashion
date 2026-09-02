import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { LOAD_WORTH, markClean, washTolerance } from '../lib/wear-rules';

// The basket: what's out of rotation and why. In the wash, packed, lent out.

// GET /wardrobe/basket
export async function getBasket(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const items = await prisma.wardrobeItem.findMany({
    where: { userId: req.user.id, owned: true, status: 'ready', state: { in: ['in-wash', 'packed', 'lent-out'] } },
    orderBy: { updatedAt: 'desc' },
  });
  const inWash = items.filter((i) => i.state === 'in-wash');
  // Pieces still clean but close to their tolerance: "one more wear".
  const nearly = await prisma.wardrobeItem.findMany({
    where: { userId: req.user.id, owned: true, status: 'ready', state: 'clean', wearsSinceWash: { gt: 0 } },
    select: { id: true, category: true, subtype: true, wearsSinceWash: true, imageUrl: true },
  });
  const oneMore = nearly.filter((i) => {
    const t = washTolerance(i);
    return t > 0 && i.wearsSinceWash >= t - 1;
  });
  const last = await prisma.wardrobeItem.findFirst({
    where: { userId: req.user.id, washedAt: { not: null } },
    orderBy: { washedAt: 'desc' },
    select: { washedAt: true },
  });
  res.json({
    items,
    counts: { inWash: inWash.length, packed: items.filter((i) => i.state === 'packed').length, lentOut: items.filter((i) => i.state === 'lent-out').length },
    worthALoad: inWash.length >= LOAD_WORTH,
    loadWorth: LOAD_WORTH,
    oneMoreWear: oneMore,
    lastWashedAt: last?.washedAt ?? null,
  });
}

const cleanSchema = z.object({ itemIds: z.array(z.string().uuid()).max(200).optional() });

// POST /wardrobe/basket/clean — back from the wash (everything, or some).
export async function basketClean(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { itemIds } = cleanSchema.parse(req.body ?? {});
  const count = await markClean(req.user.id, itemIds);
  res.json({ ok: true, count });
}
