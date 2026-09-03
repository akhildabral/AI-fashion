import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
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
  // Wear-ledger facts, attached to the day's tiles so each piece can carry a
  // real number instead of a repeated word. Optional: only the brief's own
  // pieces are enriched (evening / worn-look items are not).
  wears?: number;
  costPerWear?: number | null;
  isNew?: boolean;
}

export interface EveningLook {
  title: string;
  rationale: string;
  itemIds: string[];
  wornLogId?: string | null;
}

// A day is a timeline of looks. Each slot is a look at a time of day — the
// presets (morning/afternoon/evening) or a custom-labelled ritual ("Ceremony",
// "Reception") — with its own composition and its own wear log.
export type LookSlotKind = 'morning' | 'afternoon' | 'evening' | 'custom';
export interface LookSlot {
  id: string;
  slot: LookSlotKind;
  /** Custom name, e.g. "Ceremony" — set for slot='custom' or to override a preset. */
  label?: string | null;
  /** "HH:MM" in the user's day — orders the timeline and picks the current look. */
  time?: string | null;
  occasion?: string | null;
  rationale: string;
  itemIds: string[];
  wornLogId?: string | null;
  weather?: Weather | null;
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
  /** The second act, once composed. Legacy — superseded by `looks`. */
  evening?: EveningLook | null;
  /** The day's ordered looks. When present, the source of truth over
   *  itemIds/evening (which are kept for backward-compat). */
  looks?: LookSlot[];
  /** "Rain from six" — set by the midday check when the forecast moved. */
  weatherNote?: string | null;
}

const SLOT_ORDER: Record<LookSlotKind, number> = { morning: 0, afternoon: 1, evening: 2, custom: 3 };

/** Order a day's looks: by slot preset first, then by any explicit time. */
export function orderLooks(looks: LookSlot[]): LookSlot[] {
  return [...looks].sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || (a.time ?? '').localeCompare(b.time ?? ''));
}

/** The day's looks, deriving a legacy {main + evening} payload into the list
 *  shape when `looks` isn't set yet. `columnWornLogId` is the DailyBrief.wornLogId
 *  column, which tracks the first (morning) look for legacy rows. */
export function looksOf(payload: BriefPayload, columnWornLogId: string | null): LookSlot[] {
  if (payload.looks?.length) return orderLooks(payload.looks);
  const looks: LookSlot[] = [
    {
      id: 'morning',
      slot: 'morning',
      label: null,
      time: null,
      occasion: payload.occasion ?? null,
      rationale: payload.rationale,
      itemIds: payload.itemIds,
      wornLogId: columnWornLogId,
      weather: payload.weather ?? null,
    },
  ];
  if (payload.evening) {
    looks.push({
      id: 'evening',
      slot: 'evening',
      label: null,
      time: null,
      occasion: payload.evening.title ?? null,
      rationale: payload.evening.rationale,
      itemIds: payload.evening.itemIds,
      wornLogId: payload.evening.wornLogId ?? null,
      weather: null,
    });
  }
  return looks;
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

/**
 * Wear-ledger facts for the day's pieces, from the wear log (mirrors
 * `wearInsights`): per item, how many times worn, its cost per wear, whether
 * it's new; plus how many days since each was last worn *before today*.
 */
async function briefLedger(userId: string, itemIds: string[]) {
  const factsById = new Map<string, { wears: number; costPerWear: number | null; isNew: boolean }>();
  const lastWornDaysById = new Map<string, number>();
  if (itemIds.length === 0) return { factsById, lastWornDaysById };

  const [meta, logs] = await Promise.all([
    prisma.wardrobeItem.findMany({
      where: { id: { in: itemIds }, userId },
      select: { id: true, price: true, createdAt: true },
    }),
    prisma.wearLog.findMany({
      where: { userId, itemIds: { hasSome: itemIds } },
      select: { itemIds: true, wornOn: true },
    }),
  ]);

  const ids = new Set(itemIds);
  const wears = new Map<string, number>();
  const lastWorn = new Map<string, Date>();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  for (const log of logs) {
    for (const id of log.itemIds) {
      if (!ids.has(id)) continue;
      wears.set(id, (wears.get(id) ?? 0) + 1);
      // Last worn strictly before today, so a look worn this morning doesn't
      // report itself as "last worn 0 days ago".
      if (log.wornOn < startOfToday) {
        const prev = lastWorn.get(id);
        if (!prev || log.wornOn > prev) lastWorn.set(id, log.wornOn);
      }
    }
  }

  const NEW_WITHIN_DAYS = 30;
  const now = Date.now();
  for (const m of meta) {
    const worn = wears.get(m.id) ?? 0;
    const ageDays = Math.floor((now - m.createdAt.getTime()) / 86_400_000);
    factsById.set(m.id, {
      wears: worn,
      // The payoff: what each wear has cost so far. Only meaningful once worn.
      costPerWear: m.price != null && worn > 0 ? Math.round(m.price / worn) : null,
      isNew: worn === 0 && ageDays <= NEW_WITHIN_DAYS,
    });
    const last = lastWorn.get(m.id);
    if (last) lastWornDaysById.set(m.id, Math.floor((now - last.getTime()) / 86_400_000));
  }
  return { factsById, lastWornDaysById };
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
  const wearSignals = new Map(items.map((i) => [i.id, { passedOver: i.passedOver, chosenInstead: i.chosenInstead }]));
  const ranked = validateAndRank(suggested, { eventType, ...(weather ? { weather } : {}), recentWear, wearCounts, pollWins, wearSignals });
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
  const looks = looksOf(payload, row.wornLogId);

  // One ledger pass over every piece in the day, and one query for every look's
  // worn log, then hydrate each look's tiles with its facts.
  const allIds = [...new Set(looks.flatMap((l) => l.itemIds))];
  const { factsById, lastWornDaysById } = await briefLedger(userId, allIds);
  const logIds = looks.map((l) => l.wornLogId).filter((x): x is string => Boolean(x));
  const logs = logIds.length
    ? await prisma.wearLog.findMany({ where: { id: { in: logIds }, userId }, select: { id: true, itemIds: true, photoUrl: true, woreInstead: true } })
    : [];
  const logById = new Map(logs.map((l) => [l.id, l]));

  const looksOut = await Promise.all(
    looks.map(async (l) => {
      const raw = await hydrateItems(userId, l.itemIds);
      const items = raw.map((it) => ({ ...it, ...(factsById.get(it.id) ?? {}) }));
      const log = l.wornLogId ? logById.get(l.wornLogId) ?? null : null;
      // Logged a photo of something other than what was laid out: keep both.
      let wornLook: { items: BriefItem[]; photoUrl: string | null; instead: boolean } | null = null;
      if (log && [...log.itemIds].sort().join() !== [...l.itemIds].sort().join()) {
        wornLook = { items: await hydrateItems(userId, log.itemIds), photoUrl: log.photoUrl, instead: log.woreInstead };
      }
      return {
        id: l.id, slot: l.slot, label: l.label ?? null, time: l.time ?? null,
        occasion: l.occasion ?? null, rationale: l.rationale, weather: l.weather ?? null,
        itemIds: l.itemIds, items, worn: Boolean(log), wornLook,
      };
    }),
  );

  // "Why this" last-worn is about the first (primary) look of the day.
  const first = looksOut[0];
  let lastWorn: { label: string; days: number } | null = null;
  for (const it of first?.items ?? []) {
    const d = lastWornDaysById.get(it.id);
    if (d != null && (!lastWorn || d < lastWorn.days)) lastWorn = { label: it.subtype ?? it.category, days: d };
  }

  // Backward-compat: `brief` = the first look shaped like the old single brief;
  // `evening` = the evening-slot look, if any. The new client reads `looks`.
  const eveningOut = looksOut.find((l) => l.slot === 'evening') ?? null;
  return res.json({
    mode: 'brief' as const,
    brief: {
      ...payload, alternates: undefined, evening: undefined, looks: undefined,
      itemIds: first?.itemIds ?? payload.itemIds,
      occasion: first?.occasion ?? payload.occasion,
      rationale: first?.rationale ?? payload.rationale,
      items: first?.items ?? [],
    },
    evening: eveningOut
      ? { title: eveningOut.label ?? eveningOut.occasion ?? 'Tonight', rationale: eveningOut.rationale, itemIds: eveningOut.itemIds, items: eveningOut.items, wornLogId: eveningOut.worn ? 'logged' : null }
      : null,
    looks: looksOut,
    canUndo: (payload.alternates?.length ?? 0) > 0,
    weatherNote: payload.weatherNote ?? null,
    lastWorn,
    plannedAt: row.plannedAt,
    worn: first?.worn ?? false,
    wornLook: first?.wornLook ?? null,
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
  const countByDate = new Map<string, number>();
  for (const l of logs) {
    logByDate.set(dayKey(l.wornOn), l);
    countByDate.set(dayKey(l.wornOn), (countByDate.get(dayKey(l.wornOn)) ?? 0) + 1);
  }
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
    // How many looks the day holds: worn logs for a past day, else the planned
    // timeline (so a day with several looks reads as several on the strip).
    const plannedLooks = p ? looksOf(p, r?.wornLogId ?? null).length : 0;
    const wornCount = countByDate.get(date) ?? 0;
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
      lookCount: past ? wornCount : Math.max(plannedLooks, wornCount),
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

const composeLookSchema = z.object({
  date: z.string().regex(DATE_RE),
  slot: z.enum(['morning', 'afternoon', 'evening', 'custom']).optional(),
  label: z.string().max(40).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  occasion: z.string().max(160).optional(),
});

// POST /brief/look — add another look to the day (afternoon, evening, or a
// custom ritual). Composed for its own occasion from the closet. Appends to the
// day's `looks` timeline; the day must already be laid out.
export async function composeLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, slot, label, time, occasion } = composeLookSchema.parse(req.body);
  const userId = req.user.id;
  const row = await readDay(userId, date);
  if (!row || row.rest) throw new HttpError(400, 'Lay out the day before adding a look to it');
  const payload = row.payload as unknown as BriefPayload;
  const current = looksOf(payload, row.wornLogId);
  const kind: LookSlotKind = slot ?? 'evening';
  // Compose a distinct look for this slot's occasion (a wedding's rituals are
  // their own outfits, not a tweak of the last one).
  const eventType = kind === 'evening' ? 'evening' : payload.eventType;
  const composed = await composeOutfit(userId, eventType, occasion ?? label ?? null, date, {});
  if (!composed) throw new HttpError(400, 'The closet is short of another look');
  const newLook: LookSlot = {
    id: randomUUID(),
    slot: kind,
    label: label ?? null,
    time: time ?? null,
    occasion: occasion ?? null,
    rationale: composed.rationale,
    itemIds: composed.itemIds,
    wornLogId: null,
    weather: composed.weather,
  };
  payload.looks = [...current, newLook];
  // Keep the legacy `evening` mirror in sync for any old client still reading it.
  const eveningSlot = orderLooks(payload.looks).find((l) => l.slot === 'evening');
  payload.evening = eveningSlot
    ? { title: eveningSlot.label ?? eveningSlot.occasion ?? 'Tonight', rationale: eveningSlot.rationale, itemIds: eveningSlot.itemIds, wornLogId: eveningSlot.wornLogId ?? null }
    : payload.evening;
  const saved = await saveDay(userId, date, payload);
  return respondDay(res, userId, saved);
}

const removeLookSchema = z.object({ date: z.string().regex(DATE_RE), lookId: z.string() });

// DELETE /brief/look — take an unworn extra look off the day's timeline.
export async function removeLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, lookId } = removeLookSchema.parse(req.body);
  const userId = req.user.id;
  const row = await readDay(userId, date);
  if (!row) throw new HttpError(404, 'No day for this date');
  const payload = row.payload as unknown as BriefPayload;
  const current = looksOf(payload, row.wornLogId);
  const target = current.find((l) => l.id === lookId);
  if (!target) throw new HttpError(404, 'No such look');
  if (target.wornLogId) throw new HttpError(400, "That look was worn — it can't be removed");
  if (current.length <= 1) throw new HttpError(400, "A day keeps at least one look");
  payload.looks = current.filter((l) => l.id !== lookId);
  const eveningSlot = orderLooks(payload.looks).find((l) => l.slot === 'evening');
  payload.evening = eveningSlot
    ? { title: eveningSlot.label ?? eveningSlot.occasion ?? 'Tonight', rationale: eveningSlot.rationale, itemIds: eveningSlot.itemIds, wornLogId: eveningSlot.wornLogId ?? null }
    : null;
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
  // After swaps the client sends the final list; falls back to the cached look.
  itemIds: z.array(z.string().uuid()).min(1).max(12).optional(),
  /** New client: which look of the day to log. */
  lookId: z.string().optional(),
  /** Legacy client: the two-act model. */
  act: z.enum(['morning', 'evening']).optional(),
});

export async function wearBrief(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, itemIds, act, lookId } = wearSchema.parse(req.body);
  const userId = req.user.id;

  const row = await readDay(userId, date);
  const payload = row?.payload as unknown as BriefPayload | undefined;
  if (!row || !payload) throw new HttpError(400, 'Nothing to log — no look for this date');
  const looks = looksOf(payload, row.wornLogId);
  const target = lookId
    ? looks.find((l) => l.id === lookId)
    : act === 'evening'
      ? looks.find((l) => l.slot === 'evening')
      : looks[0];
  if (!target) throw new HttpError(400, 'Nothing to log — no look for this date');
  if (target.wornLogId) return res.json({ log: { id: target.wornLogId }, alreadyLogged: true });

  const ids = itemIds ?? target.itemIds;
  if (ids.length === 0) throw new HttpError(400, 'Nothing to log — no look for this date');
  const owned = await prisma.wardrobeItem.count({ where: { id: { in: ids }, userId } });
  if (owned !== ids.length) throw new HttpError(400, 'Some items are not in your closet');

  const eventType = target.slot === 'evening' ? 'evening' : payload.eventType;
  const weather = target.weather ?? payload.weather;
  const log = await prisma.wearLog.create({
    data: {
      userId,
      itemIds: ids,
      eventType,
      wornOn: new Date(),
      ...(weather ? { weather: { temperatureC: weather.temperatureC, description: weather.description, location: weather.location } } : {}),
    },
  });
  await applyWear(userId, log.itemIds);

  // Persist the log id on this look. The first look also mirrors to the
  // DailyBrief.wornLogId column (and the legacy evening slot) so every existing
  // reader keeps working.
  const isFirst = looks[0]?.id === target.id;
  payload.looks = looks.map((l) => (l.id === target.id ? { ...l, wornLogId: log.id } : l));
  const eveningSlot = orderLooks(payload.looks).find((l) => l.slot === 'evening');
  if (eveningSlot) {
    payload.evening = { title: eveningSlot.label ?? eveningSlot.occasion ?? 'Tonight', rationale: eveningSlot.rationale, itemIds: eveningSlot.itemIds, wornLogId: eveningSlot.wornLogId ?? null };
  }
  await prisma.dailyBrief.update({
    where: { id: row.id },
    data: { payload: payload as unknown as Prisma.InputJsonValue, ...(isFirst ? { wornLogId: log.id, rest: false } : {}) },
  });

  // The look you wore is an outfit now: it lives in the Outfits room, once.
  const key = [...ids].sort();
  const existing = await prisma.outfit.findFirst({ where: { userId, itemIds: { equals: key } }, select: { id: true } });
  if (existing) await prisma.outfit.update({ where: { id: existing.id }, data: { wearCount: { increment: 1 } } });
  else await prisma.outfit.create({ data: { userId, itemIds: key, rationale: target.rationale ?? null, eventType: eventType ?? 'work', provenance: 'ai', wearCount: 1 } });
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

const shareSchema = z.object({ date: z.string().regex(DATE_RE), lookId: z.string().optional() });

/** OOTD: share a worn look of the day to your circle (one-way, owner only).
 *  Defaults to the first worn look; pass `lookId` to share a specific one. */
export async function shareBriefWear(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, lookId } = shareSchema.parse(req.body);
  const brief = await readDay(req.user.id, date);
  if (!brief) throw new HttpError(400, "Log today's wear first");
  const payload = brief.payload as unknown as BriefPayload;
  const looks = looksOf(payload, brief.wornLogId);
  const target = lookId ? looks.find((l) => l.id === lookId) : looks.find((l) => l.wornLogId);
  const wornLogId = target?.wornLogId ?? brief.wornLogId;
  if (!wornLogId) throw new HttpError(400, "Log today's wear first");
  const log = await prisma.wearLog.update({ where: { id: wornLogId }, data: { sharedAt: new Date() } });
  res.json({ shared: true, sharedAt: log.sharedAt, wearLogId: log.id });
}
