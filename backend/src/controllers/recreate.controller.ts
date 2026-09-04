import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';
import { recreateFromPieces } from '../services/recreate.service';
import { currentSeason, EVENT_TYPES, type EventType } from '../lib/attributes';
import type { Weather } from '../services/weather.service';
import { loadStyleableWardrobe } from './wardrobe.controller';
import { weatherFor } from './brief.controller';

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
  layerRole: true,
  colorPalette: true,
  material: true,
} as const;

/** Today's weather in the member's home city, or null when unknown — never a failure. */
export async function todayWeatherFor(userId: string): Promise<Weather | null> {
  const profile = await prisma.styleProfile.findUnique({ where: { userId }, select: { city: true } }).catch(() => null);
  if (!profile?.city) return null;
  const today = new Date().toISOString().slice(0, 10);
  return weatherFor(profile.city, today, today);
}

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

  // The look's own kind of day, and the viewer's weather today: the
  // recreated set is judged for the day it would be worn.
  const eventType: EventType = (EVENT_TYPES as readonly string[]).includes(sharedLog.eventType ?? '') ? (sharedLog.eventType as EventType) : 'casual';
  const [closet, weather] = await Promise.all([loadStyleableWardrobe(req.user.id).catch(() => []), todayWeatherFor(req.user.id)]);
  const result = recreateFromPieces(sources, closet, { eventType, weather, season: currentSeason() });

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  if (result.pairs.length > 0) {
    // One recreate per person per day counts toward the look's standing.
    void notify(ownerId, 'look_recreated', req.user.id, { wearLogId: sharedLog.id, target: 'look', targetId: sharedLog.id }, { dedupeKey: `recreate:${sharedLog.id}` }).then(
      async (created) => {
        if (!created) return;
        await prisma.wearLog.update({ where: { id: sharedLog.id }, data: { recreatedCount: { increment: 1 } } }).catch(() => undefined);
      },
    ).catch(() => undefined);
  }
  const sourceView = (id: string) => {
    const src = sourceById.get(id);
    return { id: src?.id, imageUrl: src?.imageUrl, label: src?.subtype ?? src?.category };
  };
  res.json({
    pairs: result.pairs.map((m) => ({
      source: sourceView(m.sourceId),
      match: { id: m.match.id, imageUrl: m.match.imageUrl, label: m.match.subtype ?? m.match.category },
      slot: m.slot,
      score: m.score,
      reasons: m.reasons,
    })),
    missing: result.missing.map((mi) => ({
      source: sourceView(mi.sourceId),
      wanted: mi.wanted,
      slot: mi.slot,
      reason: mi.reason,
    })),
    outfit: result.outfit.map((i) => ({ id: i.id, imageUrl: i.imageUrl, label: i.subtype ?? i.category, category: i.category })),
    verdict: result.verdict,
    eventType,
    closetSize: closet.length,
  });
}
