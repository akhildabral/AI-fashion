import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { applyWear } from '../lib/wear-rules';
import { HttpError } from '../middleware/error';
import { suggestOutfits } from '../services/wardrobe.service';
import { getTripForecast, getWeather, type Weather } from '../services/weather.service';
import { EVENT_TYPES, type EventType } from '../lib/attributes';
import { avoidsColour, describeFitting, resolveEventType, EVENT_LABEL } from '../lib/occasion';
import {
  loadRecentWear,
  loadStyleableWardrobe,
  validateAndRank,
} from './wardrobe.controller';
import { activeTripFor } from './trip.controller';

// The day, in three acts. Morning: the brief, composed for the kind of day it
// is (your override, else the weekday read through the fitting) from what's
// clean, validated, explained. Evening: a second look that keeps what you're
// wearing and changes the least, or the recap. Tomorrow: laid out tonight.
// Text-only, deliberately unmetered — the paid moment is the Mirror.

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

export interface EveningLook {
  title: string;
  rationale: string;
  itemIds: string[];
  wornLogId?: string | null;
}

export interface BriefPayload {
  title: string;
  rationale: string;
  itemIds: string[];
  eventType: EventType;
  occasion: string | null;
  weather: Weather | null;
  trip: { destination: string; endDate: string } | null;
  /** Earlier compositions for the day — "back to the first" is one tap. */
  alternates?: BriefPayload[];
  /** The second act, once composed. */
  evening?: EveningLook | null;
  /** "Rain from six" — set by the midday check when the forecast moved. */
  weatherNote?: string | null;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function hydrateItems(userId: string, itemIds: string[]): Promise<BriefItem[]> {
  if (itemIds.length === 0) return [];
  const items = await prisma.wardrobeItem.findMany({
    where: { id: { in: itemIds }, userId },
    select: { id: true, category: true, subtype: true, imageUrl: true, primaryColor: true, description: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return itemIds.map((id) => byId.get(id)).filter((i): i is BriefItem => Boolean(i));
}

/** Weather for the day: live for today, the daily forecast for a future date. */
async function weatherFor(city: string | null | undefined, date: string, today: string): Promise<Weather | null> {
  if (!city) return null;
  try {
    if (date <= today) return await getWeather(city);
    const f = await getTripForecast(city, date, date);
    const d = f.days[0];
    if (!d) return null;
    return { location: f.location ?? city, temperatureC: Math.round((d.minC + d.maxC) / 2), description: d.rainChance ? `${d.description}, rain likely` : d.description };
  } catch {
    return null;
  }
}

async function composeOutfit(
  userId: string,
  eventType: EventType,
  occasion: string | null,
  date: string,
  opts: { base?: string[]; act?: 'morning' | 'evening' } = {},
): Promise<BriefPayload | null> {
  let items;
  try {
    items = await loadStyleableWardrobe(userId);
  } catch {
    return null;
  }
  const profile = await prisma.styleProfile.findUnique({ where: { userId } });

  // The fitting's struck colours never come back.
  const struck = items.filter((i) => avoidsColour(profile, i.primaryColor)).length;
  if (struck > 0 && items.length - struck >= MIN_ITEMS) items = items.filter((i) => !avoidsColour(profile, i.primaryColor));

  // On a trip, style only from the packed capsule and use the destination's weather.
  const trip = await activeTripFor(userId, date);
  if (trip && trip.packedItemIds.length > 0) {
    const packed = new Set(trip.packedItemIds);
    const packedItems = items.filter((i) => packed.has(i.id));
    if (packedItems.length >= 3) items = packedItems;
  }
  if (items.length < MIN_ITEMS) return null;

  const today = dayKey(new Date());
  const weather = await weatherFor(trip ? trip.destination : profile?.city, date, today);

  const parts: string[] = [];
  if (opts.act === 'evening' && opts.base?.length) {
    const baseItems = items.filter((i) => opts.base!.includes(i.id));
    const keep = baseItems.filter((i) => i.category === 'bottom' || i.category === 'footwear');
    parts.push(
      `A second look for the same evening (${occasion ?? 'dinner out'}), starting from what they are already wearing: ` +
        `${baseItems.map((i) => `${i.subtype ?? i.category} (id=${i.id})`).join(', ')}. ` +
        `Change the LEAST: keep ${keep.map((i) => `id=${i.id}`).join(' and ') || 'the bottom'}; swap the top or add a layer or an accessory so it reads evening.`,
    );
  } else {
    parts.push(occasion ? `Dressing for: ${occasion} (${eventType} setting).` : `A go-to ${EVENT_LABEL[eventType]} outfit for ${date === today ? 'today' : 'the day'}.`);
  }
  if (trip) parts.push(`They are traveling in ${trip.destination} — dress for that context.`);
  if (weather) parts.push(`Weather in ${weather.location}: ${weather.temperatureC}°C, ${weather.description}. Choose weather-appropriate items.`);
  if (profile?.styleVibe) parts.push(`Their style vibe: ${profile.styleVibe}.`);
  parts.push(...describeFitting(profile));
  parts.push('Compose one complete head-to-toe outfit.');

  const recentWear = await loadRecentWear(userId);
  const suggested = await suggestOutfits(items, parts.join(' '));
  const wearCounts = new Map(items.map((i) => [i.id, i.wearCount]));
  const pollWins = new Map(items.map((i) => [i.id, i.pollWins]));
  const ranked = validateAndRank(suggested, { eventType, ...(weather ? { weather } : {}), recentWear, wearCounts, pollWins });
  const top = ranked[0];
  if (!top) return null;

  return {
    trip: trip ? { destination: trip.destination, endDate: trip.endDate } : null,
    title: occasion ?? (trip ? `Packed for ${trip.destination}` : `The ${EVENT_LABEL[eventType]} look`),
    rationale: top.rationale.replace(/\s*\(id:\s*[a-f0-9-]+\)/gi, ''),
    itemIds: top.items.map((i) => i.id),
    eventType,
    occasion,
    weather,
  };
}

async function readDay(userId: string, date: string) {
  return prisma.dailyBrief.findUnique({ where: { userId_date: { userId, date } } });
}

async function saveDay(userId: string, date: string, payload: BriefPayload, extra: { plannedAt?: Date | null; rest?: boolean } = {}) {
  return prisma.dailyBrief.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, payload: payload as unknown as Prisma.InputJsonValue, eventType: payload.eventType, rest: extra.rest ?? false, plannedAt: extra.plannedAt ?? null },
    update: { payload: payload as unknown as Prisma.InputJsonValue, eventType: payload.eventType, ...(extra.rest !== undefined ? { rest: extra.rest } : {}), ...(extra.plannedAt !== undefined ? { plannedAt: extra.plannedAt } : {}) },
  });
}

async function respondDay(res: Response, userId: string, row: { payload: Prisma.JsonValue; wornLogId: string | null; rest: boolean; plannedAt: Date | null } | null) {
  if (!row) return res.json({ mode: 'starter' as const });
  if (row.rest) return res.json({ mode: 'rest' as const, worn: false });
  const payload = row.payload as unknown as BriefPayload;
  const items = await hydrateItems(userId, payload.itemIds);
  const evening = payload.evening ? { ...payload.evening, items: await hydrateItems(userId, payload.evening.itemIds) } : null;
  return res.json({
    mode: 'brief' as const,
    brief: { ...payload, alternates: undefined, evening: undefined, items },
    evening,
    canUndo: (payload.alternates?.length ?? 0) > 0,
    weatherNote: payload.weatherNote ?? null,
    plannedAt: row.plannedAt,
    worn: Boolean(row.wornLogId),
  });
}

const briefQuerySchema = z.object({
  date: z.string().regex(DATE_RE),
  occasion: z.string().max(160).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  refresh: z.coerce.boolean().optional(),
  // Look without composing: a future day on the strip stays unplanned until named.
  peek: z.coerce.boolean().optional(),
});

/**
 * GET /brief — the day. A refinement (occasion / event type) or "Another"
 * recomposes and becomes the day's brief, with the previous kept as an
 * alternate so there is always a way back.
 */
export async function getBrief(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, occasion, eventType, refresh, peek } = briefQuerySchema.parse(req.query);
  const userId = req.user.id;

  const existing = await readDay(userId, date);
  const recompose = Boolean(occasion) || Boolean(eventType) || Boolean(refresh);
  if (existing && !recompose) return respondDay(res, userId, existing);
  if (!existing && peek) return res.json({ mode: 'unplanned' as const });
  if (existing?.wornLogId && recompose) throw new HttpError(400, 'Today is already worn — tomorrow is open.');

  const profile = await prisma.styleProfile.findUnique({ where: { userId } });
  const prev = existing?.payload as unknown as BriefPayload | undefined;
  const event = resolveEventType(profile, date, eventType ?? (occasion ? (prev?.eventType ?? null) : null));
  const payload = await composeOutfit(userId, event, occasion ?? null, date);
  if (!payload) return res.json({ mode: 'starter' as const });
  // Composing is slow; if the day changed underneath us (a home day, a wear), keep that.
  const fresh = await readDay(userId, date);
  if (fresh && (fresh.updatedAt.getTime() !== (existing?.updatedAt.getTime() ?? 0)) && (fresh.rest || fresh.wornLogId)) return respondDay(res, userId, fresh);
  if (prev && !existing?.rest) payload.alternates = [{ ...prev, alternates: undefined }, ...(prev.alternates ?? [])].slice(0, 5);
  const saved = await saveDay(userId, date, payload, { rest: false, plannedAt: existing?.plannedAt ?? null });
  return respondDay(res, userId, saved);
}

/** Shared by the page, the fitting's reveal and the pushes. */
export async function ensureDailyBrief(
  userId: string,
  date: string,
  opts: { eventType?: EventType; refresh?: boolean; plannedAt?: Date } = {},
): Promise<{ payload: BriefPayload; worn: boolean; rest: boolean; plannedAt: Date | null } | null> {
  const existing = await readDay(userId, date);
  if (existing && !opts.refresh) {
    return { payload: existing.payload as unknown as BriefPayload, worn: Boolean(existing.wornLogId), rest: existing.rest, plannedAt: existing.plannedAt };
  }
  const profile = await prisma.styleProfile.findUnique({ where: { userId } });
  const payload = await composeOutfit(userId, resolveEventType(profile, date, opts.eventType ?? null), null, date);
  if (!payload) return null;
  const saved = await saveDay(userId, date, payload, { plannedAt: opts.plannedAt ?? null });
  return { payload, worn: Boolean(saved.wornLogId), rest: false, plannedAt: saved.plannedAt };
}

const dateSchema = z.object({ date: z.string().regex(DATE_RE) });

// POST /brief/undo — back to the previous composition of the day.
export async function undoBrief(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date } = dateSchema.parse(req.body);
  const row = await readDay(req.user.id, date);
  if (!row) throw new HttpError(404, 'No brief for this date');
  const payload = row.payload as unknown as BriefPayload;
  const [back, ...rest] = payload.alternates ?? [];
  if (!back) throw new HttpError(400, 'Nothing to go back to');
  const restored: BriefPayload = { ...back, alternates: rest, evening: payload.evening ?? null, weatherNote: payload.weatherNote ?? null };
  const saved = await saveDay(req.user.id, date, restored);
  return respondDay(res, req.user.id, saved);
}

const planSchema = z.object({
  date: z.string().regex(DATE_RE),
  eventType: z.enum(EVENT_TYPES).optional(),
  occasion: z.string().max(160).optional(),
  rest: z.boolean().optional(),
  // Lay out exactly these pieces (from the Mirror, from an outfit) — no composing.
  itemIds: z.array(z.string().uuid()).min(1).max(12).optional(),
  title: z.string().max(80).optional(),
});

// POST /brief/plan — name a day on the strip: an occasion, or a home day.
export async function planDay(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, eventType, occasion, rest, itemIds, title } = planSchema.parse(req.body);
  const userId = req.user.id;
  const today = dayKey(new Date());
  if (date < today) throw new HttpError(400, 'That day has passed');
  const existing = await readDay(userId, date);
  if (existing?.wornLogId) throw new HttpError(400, 'That day is already worn');

  if (itemIds?.length) {
    const owned = await prisma.wardrobeItem.count({ where: { id: { in: itemIds }, userId } });
    if (owned !== itemIds.length) throw new HttpError(400, 'Some pieces are not in your closet');
    const profile = await prisma.styleProfile.findUnique({ where: { userId } });
    const weather = await weatherFor(profile?.city, date, today);
    const prev = existing && !existing.rest ? (existing.payload as unknown as BriefPayload) : null;
    const payload: BriefPayload = {
      title: title ?? 'Laid out by you',
      rationale: 'Your own choice, laid out ahead. The stylist will keep it as it is.',
      itemIds,
      eventType: resolveEventType(profile, date, eventType ?? null),
      occasion: occasion ?? null,
      weather,
      trip: null,
      ...(prev ? { alternates: [{ ...prev, alternates: undefined }, ...(prev.alternates ?? [])].slice(0, 5) } : {}),
    };
    const saved = await saveDay(userId, date, payload, { rest: false, plannedAt: new Date() });
    return respondDay(res, userId, saved);
  }

  if (rest) {
    const payload: BriefPayload = { title: 'Home day', rationale: 'A rest. No look, no push; the streak stays honest.', itemIds: [], eventType: 'casual', occasion: null, weather: null, trip: null };
    await saveDay(userId, date, payload, { rest: true, plannedAt: new Date() });
    return res.json({ mode: 'rest' as const, worn: false });
  }
  const profile = await prisma.styleProfile.findUnique({ where: { userId } });
  const event = resolveEventType(profile, date, eventType ?? null);
  const payload = await composeOutfit(userId, event, occasion ?? null, date);
  if (!payload) return res.json({ mode: 'starter' as const });
  const fresh = await readDay(userId, date);
  if (fresh?.wornLogId) return respondDay(res, userId, fresh);
  const prev = existing && !existing.rest ? (existing.payload as unknown as BriefPayload) : null;
  if (prev) payload.alternates = [{ ...prev, alternates: undefined }, ...(prev.alternates ?? [])].slice(0, 5);
  const saved = await saveDay(userId, date, payload, { rest: false, plannedAt: new Date() });
  return respondDay(res, userId, saved);
}

const weekSchema = z.object({ from: z.string().regex(DATE_RE), today: z.string().regex(DATE_RE) });

// GET /brief/week?from=&today= — seven days: what you wore, what's planned.
export async function weekBrief(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { from, today } = weekSchema.parse(req.query);
  const userId = req.user.id;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const rows = await prisma.dailyBrief.findMany({ where: { userId, date: { in: dates } } });
  const byDate = new Map(rows.map((r) => [r.date, r]));
  // Wear logs across the window (a day earlier and later for timezone slop).
  const logs = await prisma.wearLog.findMany({
    where: { userId, wornOn: { gte: new Date(`${addDays(from, -1)}T00:00:00Z`), lte: new Date(`${addDays(from, 7)}T23:59:59Z`) } },
    orderBy: { wornOn: 'asc' },
    select: { id: true, itemIds: true, wornOn: true, eventType: true, sharedAt: true, photoUrl: true },
  });
  const logByDate = new Map<string, (typeof logs)[number]>();
  for (const l of logs) logByDate.set(dayKey(l.wornOn), l);
  for (const r of rows) if (r.wornLogId) {
    const l = logs.find((x) => x.id === r.wornLogId);
    if (l) logByDate.set(r.date, l);
  }
  const allIds = new Set<string>();
  const days = dates.map((date) => {
    const r = byDate.get(date);
    const p = r?.payload as unknown as BriefPayload | undefined;
    const log = logByDate.get(date);
    const past = date < today;
    const itemIds = past ? (log?.itemIds ?? []) : (p?.itemIds ?? []);
    itemIds.forEach((i) => allIds.add(i));
    return {
      date,
      past,
      today: date === today,
      rest: r?.rest ?? false,
      eventType: (past ? log?.eventType : p?.eventType) ?? r?.eventType ?? null,
      occasion: p?.occasion ?? null,
      planned: Boolean(r?.plannedAt) && !past,
      worn: Boolean(log),
      wearLogId: log?.id ?? null,
      shared: Boolean(log?.sharedAt),
      photoUrl: log?.photoUrl ?? null,
      itemIds,
    };
  });
  const items = await hydrateItems(userId, [...allIds]);
  const byId = new Map(items.map((i) => [i.id, i]));
  res.json({ days: days.map((d) => ({ ...d, items: d.itemIds.map((i) => byId.get(i)).filter(Boolean) })) });
}

// POST /brief/evening — the second act: keep what you're wearing, change the least.
export async function composeEvening(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, occasion } = planSchema.pick({ date: true, occasion: true }).parse(req.body);
  const userId = req.user.id;
  const row = await readDay(userId, date);
  if (!row || row.rest) throw new HttpError(400, 'No morning look to build the evening on');
  const payload = row.payload as unknown as BriefPayload;
  const look = await composeOutfit(userId, 'evening', occasion ?? 'the evening', date, { base: payload.itemIds, act: 'evening' });
  if (!look) throw new HttpError(400, 'The closet is short of an evening look');
  payload.evening = { title: occasion ?? 'Tonight', rationale: look.rationale, itemIds: look.itemIds };
  const saved = await saveDay(userId, date, payload);
  return respondDay(res, userId, saved);
}

// POST /brief/weather — the midday check: did the forecast move?
export async function weatherCheck(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date } = dateSchema.parse(req.body);
  const userId = req.user.id;
  const row = await readDay(userId, date);
  if (!row || row.rest) return res.json({ note: null });
  const payload = row.payload as unknown as BriefPayload;
  if (!payload.weather) return res.json({ note: null });
  if (row.weatherCheckedAt && Date.now() - row.weatherCheckedAt.getTime() < 3 * 3_600_000) return res.json({ note: payload.weatherNote ?? null });
  let note: string | null = null;
  try {
    const live = await getWeather(payload.weather.location);
    const dt = live.temperatureC - payload.weather.temperatureC;
    const wetNow = /rain|drizzle|shower|storm|snow/i.test(live.description);
    const wetThen = /rain|drizzle|shower|storm|snow/i.test(payload.weather.description);
    if (wetNow && !wetThen) note = `${live.description.charAt(0).toUpperCase() + live.description.slice(1)} now — a layer that shrugs it off.`;
    else if (dt <= -5) note = `${Math.round(live.temperatureC)}°, ${Math.abs(Math.round(dt))}° cooler than this morning — the jacket earns its place.`;
    else if (dt >= 5) note = `${Math.round(live.temperatureC)}°, ${Math.round(dt)}° warmer than this morning — lose the layer.`;
  } catch {
    note = null;
  }
  payload.weatherNote = note;
  await prisma.dailyBrief.update({ where: { id: row.id }, data: { payload: payload as unknown as Prisma.InputJsonValue, weatherCheckedAt: new Date() } });
  res.json({ note });
}

const wearSchema = z.object({
  date: z.string().regex(DATE_RE),
  // After swaps the client sends the final list; falls back to the cached brief.
  itemIds: z.array(z.string().uuid()).min(1).max(12).optional(),
  act: z.enum(['morning', 'evening']).default('morning'),
});

export async function wearBrief(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, itemIds, act } = wearSchema.parse(req.body);
  const userId = req.user.id;

  const brief = await readDay(userId, date);
  const payload = brief?.payload as unknown as BriefPayload | undefined;
  const look = act === 'evening' ? payload?.evening : payload;
  const ids = itemIds ?? look?.itemIds ?? [];
  if (ids.length === 0) throw new HttpError(400, 'Nothing to log — no look for this date');

  if (act === 'morning' && brief?.wornLogId) return res.json({ log: { id: brief.wornLogId }, alreadyLogged: true });
  if (act === 'evening' && payload?.evening?.wornLogId) return res.json({ log: { id: payload.evening.wornLogId }, alreadyLogged: true });

  const owned = await prisma.wardrobeItem.count({ where: { id: { in: ids }, userId } });
  if (owned !== ids.length) throw new HttpError(400, 'Some items are not in your closet');

  const eventType = act === 'evening' ? 'evening' : payload?.eventType;
  const log = await prisma.wearLog.create({
    data: {
      userId,
      itemIds: ids,
      eventType,
      wornOn: new Date(),
      ...(payload?.weather ? { weather: { temperatureC: payload.weather.temperatureC, description: payload.weather.description, location: payload.weather.location } } : {}),
    },
  });
  await applyWear(userId, log.itemIds);
  if (brief && payload) {
    if (act === 'evening' && payload.evening) {
      payload.evening.wornLogId = log.id;
      await prisma.dailyBrief.update({ where: { id: brief.id }, data: { payload: payload as unknown as Prisma.InputJsonValue } });
    } else {
      await prisma.dailyBrief.update({ where: { id: brief.id }, data: { wornLogId: log.id, rest: false } });
    }
  }
  // The look you wore is an outfit now: it lives in the Outfits room, once.
  const key = [...ids].sort();
  const existing = await prisma.outfit.findFirst({ where: { userId, itemIds: { equals: key } }, select: { id: true } });
  if (existing) await prisma.outfit.update({ where: { id: existing.id }, data: { wearCount: { increment: 1 } } });
  else await prisma.outfit.create({ data: { userId, itemIds: key, rationale: look?.rationale ?? null, eventType: eventType ?? 'work', provenance: 'ai', wearCount: 1 } });
  res.status(201).json({ log, alreadyLogged: false });
}

const swapSchema = z.object({ date: z.string().regex(DATE_RE), outId: z.string().uuid(), inId: z.string().uuid() });

export async function swapBriefItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, outId, inId } = swapSchema.parse(req.body);
  const userId = req.user.id;
  const brief = await readDay(userId, date);
  if (!brief) throw new HttpError(404, 'No brief for this date');
  const payload = brief.payload as unknown as BriefPayload;
  if (!payload.itemIds.includes(outId)) throw new HttpError(400, 'That item is not in the brief');
  const incoming = await prisma.wardrobeItem.findFirst({ where: { id: inId, userId } });
  if (!incoming) throw new HttpError(404, 'Replacement item not found');
  payload.itemIds = payload.itemIds.map((id) => (id === outId ? inId : id));
  await prisma.dailyBrief.update({ where: { id: brief.id }, data: { payload: payload as unknown as Prisma.InputJsonValue } });
  const items = await hydrateItems(userId, payload.itemIds);
  res.json({ brief: { ...payload, alternates: undefined, evening: undefined, items } });
}

const altSchema = z.object({ slot: z.string().min(1).max(40), exclude: z.string().optional() });

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
  const hydrated = await hydrateItems(req.user.id, candidates.map((c) => c.id));
  res.json({ alternatives: hydrated });
}

const shareSchema = z.object({ date: z.string().regex(DATE_RE) });

/** OOTD: share today's worn outfit to your circle (one-way, owner only). */
export async function shareBriefWear(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date } = shareSchema.parse(req.body);
  const brief = await readDay(req.user.id, date);
  if (!brief?.wornLogId) throw new HttpError(400, "Log today's wear first");
  const log = await prisma.wearLog.update({ where: { id: brief.wornLogId }, data: { sharedAt: new Date() } });
  res.json({ shared: true, sharedAt: log.sharedAt, wearLogId: log.id });
}
