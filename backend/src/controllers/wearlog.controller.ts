import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { applyWear, unapplyWear } from '../lib/wear-rules';
import { getWeather } from '../services/weather.service';
import { EVENT_TYPES } from '../lib/attributes';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';

// The wear log is the product's core dataset: what was actually worn, when,
// in what context. Logging must stay a one-tap action, so every field beyond
// the items is optional and enriched server-side where possible.

const createOutfitSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(12),
  rationale: z.string().max(1000).nullish(),
  eventType: z.enum(EVENT_TYPES).default('work'),
  provenance: z.enum(['ai', 'user', 'copied']).default('ai'),
});

async function ownedItems(userId: string, itemIds: string[]) {
  const items = await prisma.wardrobeItem.findMany({
    where: { id: { in: itemIds }, userId },
  });
  if (items.length !== new Set(itemIds).size) {
    throw new HttpError(400, 'One or more items were not found in your wardrobe');
  }
  return items;
}

export async function createOutfit(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const data = createOutfitSchema.parse(req.body);
  await ownedItems(req.user.id, data.itemIds);

  const outfit = await prisma.outfit.create({
    data: { userId: req.user.id, ...data },
  });
  res.status(201).json({ outfit });
}

export async function listOutfits(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const outfits = await prisma.outfit.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Resolve item ids to current items; deleted items simply drop out.
  const allIds = [...new Set(outfits.flatMap((o) => o.itemIds))];
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: allIds } } });
  const byId = new Map(items.map((i) => [i.id, i]));
  res.json({
    outfits: outfits.map((o) => ({
      ...o,
      items: o.itemIds.map((id) => byId.get(id)).filter(Boolean),
    })),
  });
}

const logWearSchema = z
  .object({
    outfitId: z.string().uuid().optional(),
    itemIds: z.array(z.string().uuid()).min(1).max(12).optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    wornOn: z.coerce.date().optional(),
    // When provided, today's weather is snapshotted into the log.
    location: z.string().max(120).optional(),
    // Wearing a look a friend picked for you: credits the stylist.
    pickId: z.string().uuid().optional(),
  })
  .refine((d) => d.outfitId || d.itemIds?.length, {
    message: 'Provide an outfitId or a list of itemIds',
  });

export async function logWear(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const data = logWearSchema.parse(req.body);

  let itemIds = data.itemIds ?? [];
  if (data.outfitId) {
    const outfit = await prisma.outfit.findFirst({
      where: { id: data.outfitId, userId: req.user.id },
    });
    if (!outfit) throw new HttpError(404, 'Outfit not found');
    itemIds = data.itemIds ?? outfit.itemIds;
    await prisma.outfit.update({
      where: { id: outfit.id },
      data: { wearCount: { increment: 1 } },
    });
  } else {
    await ownedItems(req.user.id, itemIds);
  }

  // Best-effort weather snapshot — a failed lookup never blocks the log.
  let weather: { temperatureC: number; description: string; location: string } | undefined;
  if (data.location) {
    try {
      weather = await getWeather(data.location);
    } catch {
      weather = undefined;
    }
  }

  const log = await prisma.wearLog.create({
    data: {
      userId: req.user.id,
      outfitId: data.outfitId,
      itemIds,
      eventType: data.eventType,
      rating: data.rating,
      wornOn: data.wornOn ?? new Date(),
      ...(weather ? { weather } : {}),
    },
  });
  await applyWear(req.user.id, log.itemIds);
  if (data.pickId) {
    const pick = await prisma.friendPick.findFirst({
      where: { id: data.pickId, forUserId: req.user.id },
      select: { id: true, byUserId: true },
    });
    if (pick) {
      await prisma.friendPick.update({ where: { id: pick.id }, data: { wornLogId: log.id, wornAt: new Date() } });
      void notify(pick.byUserId, 'pick_worn', req.user.id, { pickId: pick.id, target: 'pick', targetId: pick.id }, { dedupeKey: `worn:${pick.id}` }).catch(() => undefined);
    }
  }
  res.status(201).json({ log });
}

const listWearQuery = z.object({
  // YYYY-MM: every day of that month, plus which days were logged.
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  item: z.string().uuid().optional(),
  occasion: z.enum(EVENT_TYPES).optional(),
});

export async function listWear(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const q = listWearQuery.parse(req.query);
  let range: { gte: Date; lt: Date } | undefined;
  if (q.month) {
    const [y, m] = q.month.split('-').map(Number);
    range = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }
  const logs = await prisma.wearLog.findMany({
    where: {
      userId: req.user.id,
      ...(range ? { wornOn: range } : {}),
      ...(q.item ? { itemIds: { has: q.item } } : {}),
      ...(q.occasion ? { eventType: q.occasion } : {}),
    },
    orderBy: { wornOn: 'desc' },
    take: range ? 200 : 100,
  });
  // The month strip needs every logged day, whatever the filters.
  const days = range
    ? (await prisma.wearLog.findMany({ where: { userId: req.user.id, wornOn: range }, select: { wornOn: true } })).map((l) => dayKey(l.wornOn))
    : undefined;

  const allIds = [...new Set(logs.flatMap((l) => l.itemIds))];
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: allIds } } });
  const byId = new Map(items.map((i) => [i.id, i]));
  res.json({
    logs: logs.map((l) => ({
      ...l,
      items: l.itemIds.map((id) => byId.get(id)).filter(Boolean),
    })),
    ...(days ? { days: [...new Set(days)] } : {}),
  });
}

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "Again?" — 5 = again, 1 = not this one, null clears. The brief reads it.
const rateWearSchema = z.object({ rating: z.union([z.literal(1), z.literal(5)]).nullable() });

export async function rateWear(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const { rating } = rateWearSchema.parse(req.body);
  const r = await prisma.wearLog.updateMany({ where: { id, userId: req.user.id }, data: { rating } });
  if (r.count === 0) throw new HttpError(404, 'Wear log entry not found');
  res.json({ rating });
}

export async function deleteWear(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const log = await prisma.wearLog.findFirst({ where: { id, userId: req.user.id } });
  if (!log) throw new HttpError(404, 'Wear log entry not found');

  if (log.outfitId) {
    await prisma.outfit.updateMany({
      where: { id: log.outfitId, wearCount: { gt: 0 } },
      data: { wearCount: { decrement: 1 } },
    });
  }
  // The day it was logged against opens again, and the wear comes off the
  // pieces. Clear both the column (the first look) and any look in the day's
  // timeline that pointed at this log — a later look's id lives only in the JSON.
  await prisma.dailyBrief.updateMany({ where: { userId: req.user.id, wornLogId: id }, data: { wornLogId: null } });
  const d0 = new Date(log.wornOn);
  const near = [-1, 0, 1].map((n) => {
    const x = new Date(d0);
    x.setDate(x.getDate() + n);
    return x.toISOString().slice(0, 10);
  });
  const briefs = await prisma.dailyBrief.findMany({ where: { userId: req.user.id, date: { in: near } } });
  for (const b of briefs) {
    const p = b.payload as unknown as { looks?: { wornLogId?: string | null }[]; evening?: { wornLogId?: string | null } | null };
    let changed = false;
    if (p.looks?.some((l) => l.wornLogId === id)) {
      p.looks = p.looks.map((l) => (l.wornLogId === id ? { ...l, wornLogId: null } : l));
      changed = true;
    }
    if (p.evening?.wornLogId === id) {
      p.evening.wornLogId = null;
      changed = true;
    }
    if (changed) await prisma.dailyBrief.update({ where: { id: b.id }, data: { payload: p as unknown as Prisma.InputJsonValue } });
  }
  await unapplyWear(req.user.id, log.itemIds);
  await prisma.wearLog.delete({ where: { id } });
  res.status(204).send();
}

const ORPHAN_AFTER_DAYS = 90;

// First slice of the payoff loop: per-item wear counts and wardrobe orphans.
export async function wearInsights(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');

  const [items, logs] = await Promise.all([
    prisma.wardrobeItem.findMany({
      where: { userId: req.user.id, state: { not: 'retired' } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.wearLog.findMany({
      where: { userId: req.user.id },
      select: { itemIds: true, wornOn: true },
    }),
  ]);

  const wearCount = new Map<string, number>();
  const lastWorn = new Map<string, Date>();
  for (const log of logs) {
    for (const id of log.itemIds) {
      wearCount.set(id, (wearCount.get(id) ?? 0) + 1);
      const prev = lastWorn.get(id);
      if (!prev || log.wornOn > prev) lastWorn.set(id, log.wornOn);
    }
  }

  const now = Date.now();
  const enriched = items.map((item) => {
    const worn = wearCount.get(item.id) ?? 0;
    const last = lastWorn.get(item.id) ?? null;
    const referenceDate = last ?? item.createdAt;
    const idleDays = Math.floor((now - referenceDate.getTime()) / 86_400_000);
    return {
      itemId: item.id,
      imageUrl: item.imageUrl,
      category: item.category,
      subtype: item.subtype,
      wearCount: worn,
      lastWorn: last,
      orphan: idleDays >= ORPHAN_AFTER_DAYS,
      price: item.price,
      // The payoff stat: what each wear has cost so far. Null without a
      // price; equal to the price while the item is still unworn.
      costPerWear: item.price != null ? Math.round((item.price / Math.max(1, worn)) * 100) / 100 : null,
    };
  });

  res.json({
    items: enriched,
    totals: {
      items: items.length,
      logged: logs.length,
      orphans: enriched.filter((e) => e.orphan).length,
    },
  });
}
