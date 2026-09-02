import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { suggestOutfits } from '../services/wardrobe.service';
import { getWeather, type Weather } from '../services/weather.service';
import { EVENT_TYPES, type EventType } from '../lib/attributes';
import {
  loadRecentWear,
  loadStyleableWardrobe,
  validateAndRank,
} from './wardrobe.controller';
import { activeTripFor } from './trip.controller';

// The Daily Brief: the outfit is already composed when the user opens the
// app. Text-only (no image generation), so it is deliberately unmetered —
// the paid moment is "see it on you", never the morning ritual.

const MIN_ITEMS = 4;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface BriefItem {
  id: string;
  category: string;
  subtype: string | null;
  imageUrl: string;
  primaryColor: string | null;
  description: string | null;
}

interface BriefPayload {
  title: string;
  rationale: string;
  itemIds: string[];
  eventType: EventType;
  occasion: string | null;
  weather: Weather | null;
  trip: { destination: string; endDate: string } | null;
}

async function hydrateItems(userId: string, itemIds: string[]): Promise<BriefItem[]> {
  const items = await prisma.wardrobeItem.findMany({
    where: { id: { in: itemIds }, userId },
    select: {
      id: true,
      category: true,
      subtype: true,
      imageUrl: true,
      primaryColor: true,
      description: true,
    },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return itemIds.map((id) => byId.get(id)).filter((i): i is BriefItem => Boolean(i));
}

async function composeOutfit(
  userId: string,
  eventType: EventType,
  occasion: string | null,
  date?: string,
): Promise<BriefPayload | null> {
  // A thin closet is a starter state, never an error — the wardrobe loader
  // throws below its own minimum, so catch and fall through to starter.
  let items;
  try {
    items = await loadStyleableWardrobe(userId);
  } catch {
    return null;
  }

  // On a trip, style only from the packed capsule and use the destination's
  // weather — the suitcase becomes the closet.
  const trip = date ? await activeTripFor(userId, date) : null;
  if (trip && trip.packedItemIds.length > 0) {
    const packed = new Set(trip.packedItemIds);
    const packedItems = items.filter((i) => packed.has(i.id));
    if (packedItems.length >= 3) items = packedItems;
  }
  if (items.length < MIN_ITEMS) return null;

  const profile = await prisma.styleProfile.findUnique({ where: { userId } });
  let weather: Weather | null = null;
  const weatherCity = trip ? trip.destination : profile?.city;
  if (weatherCity) {
    try {
      weather = await getWeather(weatherCity);
    } catch {
      weather = null;
    }
  }

  const parts = [
    occasion
      ? `Dressing for: ${occasion} (${eventType} setting).`
      : `A go-to ${eventType} outfit for today.`,
  ];
  if (trip) parts.push(`They are traveling in ${trip.destination} — dress for that context.`);
  if (weather) {
    parts.push(
      `Today's weather in ${weather.location}: ${weather.temperatureC}°C, ${weather.description}. Choose weather-appropriate items.`,
    );
  }
  if (profile?.styleVibe) parts.push(`Their style vibe: ${profile.styleVibe}.`);
  parts.push('Compose one complete head-to-toe outfit.');

  const recentWear = await loadRecentWear(userId);
  const suggested = await suggestOutfits(items, parts.join(' '));
  const wearCounts = new Map(items.map((i) => [i.id, i.wearCount]));
  const pollWins = new Map(items.map((i) => [i.id, i.pollWins]));
  const ranked = validateAndRank(suggested, {
    eventType,
    ...(weather ? { weather } : {}),
    recentWear,
    wearCounts,
    pollWins,
  });
  const top = ranked[0];
  if (!top) return null;

  return {
    trip: trip ? { destination: trip.destination, endDate: trip.endDate } : null,
    title: occasion ?? (trip ? `Packed for ${trip.destination}` : `Today's ${eventType} look`),
    // Models sometimes cite item ids in their reasoning — never show those.
    rationale: top.rationale.replace(/\s*\(id:\s*[a-f0-9-]+\)/gi, ''),
    itemIds: top.items.map((i) => i.id),
    eventType,
    occasion,
    weather,
  };
}

const briefQuerySchema = z.object({
  date: z.string().regex(DATE_RE),
  occasion: z.string().max(160).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  refresh: z.coerce.boolean().optional(),
});

export async function getBrief(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, occasion, eventType, refresh } = briefQuerySchema.parse(req.query);
  const userId = req.user.id;
  const event = eventType ?? 'work';

  // Occasion-specific briefs are ephemeral refinements — never cached.
  if (occasion) {
    const payload = await composeOutfit(userId, event, occasion, date);
    if (!payload) return res.json({ mode: 'starter' as const });
    const items = await hydrateItems(userId, payload.itemIds);
    return res.json({ mode: 'brief' as const, brief: { ...payload, items }, worn: false });
  }

  const ensured = await ensureDailyBrief(userId, date, { eventType: event, refresh: Boolean(refresh) });
  if (!ensured) return res.json({ mode: 'starter' as const });
  const items = await hydrateItems(userId, ensured.payload.itemIds);
  res.json({ mode: 'brief' as const, brief: { ...ensured.payload, items }, worn: ensured.worn });
}

/**
 * The day's brief, composed once and cached. Shared by the page and by the
 * morning push, so the look a person is woken for is the one they open to.
 */
export async function ensureDailyBrief(
  userId: string,
  date: string,
  opts: { eventType?: EventType; refresh?: boolean } = {},
): Promise<{ payload: BriefPayload; worn: boolean } | null> {
  const existing = await prisma.dailyBrief.findUnique({ where: { userId_date: { userId, date } } });
  if (existing && !opts.refresh) {
    return { payload: existing.payload as unknown as BriefPayload, worn: Boolean(existing.wornLogId) };
  }
  const payload = await composeOutfit(userId, opts.eventType ?? 'work', null, date);
  if (!payload) return null;
  const saved = await prisma.dailyBrief.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, payload: payload as unknown as Prisma.InputJsonValue },
    update: { payload: payload as unknown as Prisma.InputJsonValue },
  });
  return { payload, worn: Boolean(saved.wornLogId) };
}

const wearSchema = z.object({
  date: z.string().regex(DATE_RE),
  // After swaps the client sends the final list; falls back to the cached brief.
  itemIds: z.array(z.string().uuid()).min(1).max(12).optional(),
});

export async function wearBrief(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, itemIds } = wearSchema.parse(req.body);
  const userId = req.user.id;

  const brief = await prisma.dailyBrief.findUnique({
    where: { userId_date: { userId, date } },
  });
  const payload = brief?.payload as unknown as BriefPayload | undefined;
  const ids = itemIds ?? payload?.itemIds ?? [];
  if (ids.length === 0) throw new HttpError(400, 'Nothing to log — no brief for this date');

  if (brief?.wornLogId) {
    return res.json({ log: { id: brief.wornLogId }, alreadyLogged: true });
  }

  const owned = await prisma.wardrobeItem.count({ where: { id: { in: ids }, userId } });
  if (owned !== ids.length) throw new HttpError(400, 'Some items are not in your closet');

  const log = await prisma.wearLog.create({
    data: {
      userId,
      itemIds: ids,
      eventType: payload?.eventType,
      wornOn: new Date(),
      ...(payload?.weather
        ? {
            weather: {
              temperatureC: payload.weather.temperatureC,
              description: payload.weather.description,
              location: payload.weather.location,
            },
          }
        : {}),
    },
  });
  if (brief) {
    await prisma.dailyBrief.update({ where: { id: brief.id }, data: { wornLogId: log.id } });
  }
  res.status(201).json({ log, alreadyLogged: false });
}

const swapSchema = z.object({
  date: z.string().regex(DATE_RE),
  outId: z.string().uuid(),
  inId: z.string().uuid(),
});

export async function swapBriefItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, outId, inId } = swapSchema.parse(req.body);
  const userId = req.user.id;

  const brief = await prisma.dailyBrief.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (!brief) throw new HttpError(404, 'No brief for this date');
  const payload = brief.payload as unknown as BriefPayload;
  if (!payload.itemIds.includes(outId)) throw new HttpError(400, 'That item is not in the brief');

  const incoming = await prisma.wardrobeItem.findFirst({ where: { id: inId, userId } });
  if (!incoming) throw new HttpError(404, 'Replacement item not found');

  payload.itemIds = payload.itemIds.map((id) => (id === outId ? inId : id));
  await prisma.dailyBrief.update({
    where: { id: brief.id },
    data: { payload: payload as unknown as Prisma.InputJsonValue },
  });
  const items = await hydrateItems(userId, payload.itemIds);
  res.json({ brief: { ...payload, items } });
}

const altSchema = z.object({
  slot: z.string().min(1).max(40),
  exclude: z.string().optional(),
});

// Closet alternatives for one slot of the brief — same category, not recently
// worn where possible, best-loved first. Deterministic and free (no AI call).
export async function briefAlternatives(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { slot, exclude } = altSchema.parse(req.query);
  const excludeIds = (exclude ?? '').split(',').filter(Boolean);

  const items = await loadStyleableWardrobe(req.user.id);
  const recent = await loadRecentWear(req.user.id);
  const recentIds = new Set(recent.slice(0, 6).flatMap((r) => r.itemIds));

  const candidates = items
    .filter((i) => i.category === slot && !excludeIds.includes(i.id))
    .sort((a, b) => {
      const aRecent = recentIds.has(a.id) ? 1 : 0;
      const bRecent = recentIds.has(b.id) ? 1 : 0;
      if (aRecent !== bRecent) return aRecent - bRecent;
      return b.wearCount + b.pollWins * 2 - (a.wearCount + a.pollWins * 2);
    })
    .slice(0, 3);

  const hydrated = await hydrateItems(
    req.user.id,
    candidates.map((c) => c.id),
  );
  res.json({ alternatives: hydrated });
}

const shareSchema = z.object({ date: z.string().regex(DATE_RE) });

/** OOTD: share today's worn outfit to your circle (one-way, owner only). */
export async function shareBriefWear(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date } = shareSchema.parse(req.body);
  const brief = await prisma.dailyBrief.findUnique({
    where: { userId_date: { userId: req.user.id, date } },
  });
  if (!brief?.wornLogId) throw new HttpError(400, "Log today's wear first");
  const log = await prisma.wearLog.update({
    where: { id: brief.wornLogId },
    data: { sharedAt: new Date() },
  });
  res.json({ shared: true, sharedAt: log.sharedAt, wearLogId: log.id });
}
