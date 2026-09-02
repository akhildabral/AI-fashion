import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';
import { recreateOutfit } from '../services/recreate.service';
import { loadStyleableWardrobe } from './wardrobe.controller';

const schema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(12),
});

const ITEM_SELECT = {
  id: true,
  userId: true,
  category: true,
  subtype: true,
  primaryColor: true,
  formalityScore: true,
  warmthValue: true,
  pattern: true,
  imageUrl: true,
} as const;

/**
 * Rebuild someone else's outfit from the viewer's own closet.
 * Authorization: the source items must belong to one other user who has
 * shared them together (an OOTD wear log) — ids only ever travel to
 * followers via the feed, and this check stops blind enumeration.
 */
export async function recreateFromCloset(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { itemIds } = schema.parse(req.body);

  const sources = await prisma.wardrobeItem.findMany({
    where: { id: { in: itemIds } },
    select: ITEM_SELECT,
  });
  if (sources.length === 0) throw new HttpError(404, 'Outfit not found');

  const owners = [...new Set(sources.map((s) => s.userId))];
  if (owners.length !== 1) throw new HttpError(400, 'Items must come from one outfit');
  const ownerId = owners[0];
  if (ownerId === req.user.id) {
    throw new HttpError(400, "That's already your outfit — wear it!");
  }

  const sharedLog = await prisma.wearLog.findFirst({
    where: { userId: ownerId, sharedAt: { not: null }, itemIds: { hasSome: itemIds } },
  });
  if (!sharedLog) throw new HttpError(403, 'This outfit has not been shared');

  const closet = await loadStyleableWardrobe(req.user.id).catch(() => []);
  const result = recreateOutfit(
    sources.map((s) => ({ ...s })),
    closet.map((c) => ({
      id: c.id,
      category: c.category,
      subtype: c.subtype,
      primaryColor: c.primaryColor,
      formalityScore: c.formalityScore,
      warmthValue: c.warmthValue,
      pattern: c.pattern,
      wearCount: c.wearCount,
      imageUrl: c.imageUrl,
    })),
  );

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  if (result.matched.length > 0) {
    // One recreate per person per day counts toward the look's standing.
    void notify(ownerId, 'look_recreated', req.user.id, { wearLogId: sharedLog.id }, { dedupeKey: `recreate:${sharedLog.id}` }).then(
      async (created) => {
        if (!created) return;
        await prisma.wearLog.update({ where: { id: sharedLog.id }, data: { recreatedCount: { increment: 1 } } }).catch(() => undefined);
      },
    );
  }
  res.json({
    pairs: result.matched.map((m) => {
      const src = sourceById.get(m.sourceId);
      return {
        source: {
          id: src?.id,
          imageUrl: src?.imageUrl,
          label: src?.subtype ?? src?.category,
        },
        match: {
          id: m.match.id,
          imageUrl: (m.match as { imageUrl?: string }).imageUrl,
          label: m.match.subtype ?? m.match.category,
        },
      };
    }),
    missing: result.missing.map((mi) => {
      const src = sourceById.get(mi.sourceId);
      return {
        source: {
          id: src?.id,
          imageUrl: src?.imageUrl,
          label: src?.subtype ?? src?.category,
        },
        wanted: mi.wanted,
      };
    }),
    closetSize: closet.length,
  });
}
