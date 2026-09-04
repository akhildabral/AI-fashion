import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { applyWear } from '../lib/wear-rules';
import { HttpError } from '../middleware/error';
import { suggestOutfits, type SuggestedOutfit } from '../services/wardrobe.service';
import { getTripForecast, getWeather, type Weather } from '../services/weather.service';
import { EVENT_FORMALITY, EVENT_TYPES, currentSeason, type EventType } from '../lib/attributes';
import { avoidsColour, describeFitting, readOccasion, resolveEventType, EVENT_LABEL } from '../lib/occasion';
import {
  loadRecentWear,
  loadStyleableWardrobe,
  poolSignals,
  tasteFor,
} from './wardrobe.controller';
import { activeTripFor } from './trip.controller';
import {
  changedSlot,
  composeWithRetry,
  enumerateFromPool,
  honestRationale,
  planOpinion,
  prefilterPool,
  verdictOf,
  type Verdict,
} from '../services/compose.service';
import { roleOf, validateOutfit } from '../services/validator.service';
import { pairScore } from '../services/pairing.service';
import { favouriteOutfitFor, recomputeTasteProfileSoon, tasteFormalityTarget, tasteItemBonus } from '../services/taste.service';
import { recordComposed, recordSwap, recordWoreInstead } from '../services/taste-events';

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
  verdict?: Verdict | null;
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
  /** The rules' word on this look: ok with warnings, or not ok with what failed. */
  verdict?: Verdict | null;
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
  /** The rules' word on the primary look. Never omitted on a fresh composition. */
  verdict?: Verdict | null;
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
      verdict: payload.verdict ?? null,
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
      verdict: payload.evening.verdict ?? null,
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

/**
 * Weather for the day. The day's high and low from the forecast, for today as
 * much as for a future date: an outfit is worn through the afternoon, not at
 * the moment the brief is read. Live conditions are the fallback for today.
 */
async function weatherFor(city: string | null | undefined, date: string, today: string): Promise<Weather | null> {
  if (!city) return null;
  try {
    const f = await getTripForecast(city, date, date);
    const d = f.days[0];
    if (d) {
      return {
        location: f.location ?? city,
        temperatureC: Math.round((d.minC + d.maxC) / 2),
        description: d.rainChance ? `${d.description}, rain likely` : d.description,
        highC: Math.round(d.maxC),
        lowC: Math.round(d.minC),
      };
    }
  } catch {
    // fall through to live conditions
  }
  if (date > today) return null;
  try {
    return await getWeather(city);
  } catch {
    return null;
  }
}

/**
 * What kind of day it is. An explicit event type wins; else the occasion
 * says (keywords, then one cached model read); else the weekday through the
 * fitting. This is what stops a Saturday wedding from being styled as a
 * casual day.
 */
export async function eventFor(
  userId: string,
  profile: Parameters<typeof resolveEventType>[0],
  date: string,
  opts: { eventType?: EventType | null; occasion?: string | null; fallback?: EventType | null } = {},
): Promise<EventType> {
  if (opts.eventType) return opts.eventType;
  if (opts.occasion) {
    const read = await readOccasion(userId, opts.occasion);
    if (read) return read.eventType;
  }
  return resolveEventType(profile, date, opts.fallback ?? null);
}

export interface ComposeOpts {
  base?: string[];
  act?: 'morning' | 'evening';
  /** Item sets already shown for the day ("Another"): never handed back. */
  exclude?: string[][];
}

export async function composeOutfit(
  userId: string,
  eventType: EventType,
  occasion: string | null,
  date: string,
  opts: ComposeOpts = {},
): Promise<BriefPayload | null> {
  let items;
  try {
    items = await loadStyleableWardrobe(userId);
  } catch {
    return null;
  }
  const profile = await prisma.styleProfile.findUnique({ where: { userId } });
  const taste = await tasteFor(userId);

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
  const season = currentSeason(new Date(`${date}T12:00:00Z`));
  const formalityTarget = tasteFormalityTarget(taste, eventType, EVENT_FORMALITY[eventType]);

  // Narrow the pool before the model sees it: the right formality band, the
  // right warmth, the right season, always at least one candidate per slot.
  const signals = poolSignals(items);
  let pool = prefilterPool(items, { eventType, formalityTarget, weather, season });
  if (opts.act === 'evening' && opts.base?.length) {
    // The evening keeps what is already on: those pieces stay in the pool.
    const keep = new Set(opts.base);
    pool = [...pool, ...items.filter((i) => keep.has(i.id) && !pool.some((p) => p.id === i.id))];
  }

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
  parts.push(`Formality target ${formalityTarget}/5; every piece within a step of it.`);
  if (trip) parts.push(`They are traveling in ${trip.destination} — dress for that context.`);
  if (weather) {
    const range = weather.highC != null && weather.lowC != null ? ` (${weather.lowC}–${weather.highC}°C over the day)` : '';
    parts.push(`Weather in ${weather.location}: ${weather.temperatureC}°C${range}, ${weather.description}. Choose weather-appropriate items.`);
  }
  if (profile?.styleVibe) parts.push(`Their style vibe: ${profile.styleVibe}.`);
  parts.push(...describeFitting(profile));
  parts.push('Compose complete head-to-toe outfits.');

  const recentWear = await loadRecentWear(userId);
  const favourite = favouriteOutfitFor(taste, { eventType, temperatureC: weather?.temperatureC });
  const count = eventType === 'occasion' || eventType === 'evening' ? 5 : 4;
  const context = parts.join(' ');
  const suggest = (constraints: string[]): Promise<SuggestedOutfit[]> =>
    suggestOutfits(pool, context, count, { taste, favourite, exclude: opts.exclude, constraints });
  const composed = await composeWithRetry(
    suggest,
    { eventType, weather, recentWear, ...signals, taste, formalityTarget, season },
    { exclude: opts.exclude, fallback: () => enumerateFromPool(pool, { eventType, weather, season }) },
  );
  if (!composed) return null;
  const { top, verdict } = composed;

  return {
    trip: trip ? { destination: trip.destination, endDate: trip.endDate } : null,
    title: occasion ?? (trip ? `Packed for ${trip.destination}` : `The ${EVENT_LABEL[eventType]} look`),
    rationale: honestRationale(top.validation, top.items, eventType, top.why, weather),
    itemIds: top.items.map((i) => i.id),
    eventType,
    occasion,
    weather,
    verdict,
  };
}

/** Full closet rows for a set of ids, in the given order, for the validator. */
async function closetRows(userId: string, itemIds: string[]) {
  const rows = await prisma.wardrobeItem.findMany({ where: { id: { in: itemIds }, userId } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return itemIds.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r);
}

async function hasCleanShoes(userId: string): Promise<boolean> {
  const n = await prisma.wardrobeItem.count({ where: { userId, owned: true, status: 'ready', suppressed: false, state: 'clean', category: 'footwear' } });
  return n > 0;
}

/**
 * The rules' word on pieces the person chose themselves, and one line of
 * opinion in the stylist's voice. Never a block.
 */
export async function judgeOwnPlan(userId: string, itemIds: string[], eventType: EventType, weather: Weather | null, date: string) {
  const [rows, cleanShoes, taste] = await Promise.all([closetRows(userId, itemIds), hasCleanShoes(userId), tasteFor(userId)]);
  const formalityTarget = tasteFormalityTarget(taste, eventType, EVENT_FORMALITY[eventType]);
  const v = validateOutfit(rows, {
    eventType,
    weather: weather ?? undefined,
    hasCleanFootwear: cleanShoes,
    season: currentSeason(new Date(`${date}T12:00:00Z`)),
    formalityTarget,
    // The person's own pieces may be in the wash today and clean by then.
    availableStates: ['clean', 'in-wash', 'packed'],
  });
  return { verdict: verdictOf(v), opinion: planOpinion(v, rows, eventType, formalityTarget) };
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

type DayRow = { payload: Prisma.JsonValue; wornLogId: string | null; rest: boolean; plannedAt: Date | null } | null;

async function respondDay(res: Response, userId: string, row: DayRow) {
  return res.json(await dayResponse(userId, row));
}

/** The day as the page reads it: the body of GET /brief. */
async function dayResponse(userId: string, row: DayRow) {
  if (!row) return { mode: 'starter' as const };
  if (row.rest) return { mode: 'rest' as const, worn: false };
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
        itemIds: l.itemIds, items, worn: Boolean(log), wornLook, verdict: l.verdict ?? null,
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
  return {
    mode: 'brief' as const,
    brief: {
      ...payload, alternates: undefined, evening: undefined, looks: undefined,
      itemIds: first?.itemIds ?? payload.itemIds,
      occasion: first?.occasion ?? payload.occasion,
      rationale: first?.rationale ?? payload.rationale,
      items: first?.items ?? [],
      verdict: first?.verdict ?? payload.verdict ?? null,
    },
    evening: eveningOut
      ? { title: eveningOut.label ?? eveningOut.occasion ?? 'Tonight', rationale: eveningOut.rationale, itemIds: eveningOut.itemIds, items: eveningOut.items, wornLogId: eveningOut.worn ? 'logged' : null, verdict: eveningOut.verdict ?? null }
      : null,
    looks: looksOut,
    canUndo: (payload.alternates?.length ?? 0) > 0,
    weatherNote: payload.weatherNote ?? null,
    lastWorn,
    plannedAt: row.plannedAt,
    worn: first?.worn ?? false,
    wornLook: first?.wornLook ?? null,
  };
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
  const query = briefQuerySchema.parse(req.query);
  res.json(await briefFor(req.user.id, query));
}

/** The body of GET /brief for a person and a day; shared with /bootstrap. */
export async function briefFor(userId: string, query: z.infer<typeof briefQuerySchema>) {
  const { date, occasion, eventType, refresh, peek } = query;

  const existing = await readDay(userId, date);
  const recompose = Boolean(occasion) || Boolean(eventType) || Boolean(refresh);
  if (existing && !recompose) return dayResponse(userId, existing);
  if (!existing && peek) return { mode: 'unplanned' as const };
  if (existing?.wornLogId && recompose) throw new HttpError(400, 'Today is already worn — tomorrow is open.');

  const profile = await prisma.styleProfile.findUnique({ where: { userId } });
  const prev = existing?.payload as unknown as BriefPayload | undefined;
  // The typed occasion says what kind of day it is; "Another" keeps the day's
  // kind and must not hand back a set already shown.
  const event = await eventFor(userId, profile, date, { eventType, occasion, fallback: !occasion && refresh ? prev?.eventType ?? null : null });
  const exclude = prev && refresh && !occasion && !eventType ? [prev.itemIds, ...(prev.alternates ?? []).map((a) => a.itemIds)].filter((ids) => ids.length > 0) : undefined;
  const payload = await composeOutfit(userId, event, occasion ?? prev?.occasion ?? null, date, { exclude });
  if (!payload) return { mode: 'starter' as const };
  // Composing is slow; if the day changed underneath us (a home day, a wear), keep that.
  const fresh = await readDay(userId, date);
  if (fresh && (fresh.updatedAt.getTime() !== (existing?.updatedAt.getTime() ?? 0)) && (fresh.rest || fresh.wornLogId)) return dayResponse(userId, fresh);
  if (prev && !existing?.rest) payload.alternates = [{ ...prev, alternates: undefined }, ...(prev.alternates ?? [])].slice(0, 5);
  const saved = await saveDay(userId, date, payload, { rest: false, plannedAt: existing?.plannedAt ?? null });
  return dayResponse(userId, saved);
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
    const event = await eventFor(userId, profile, date, { eventType, occasion });
    // The person's choice stands; the rules still get their say, in one line.
    const { verdict, opinion } = await judgeOwnPlan(userId, itemIds, event, weather, date);
    const payload: BriefPayload = {
      title: title ?? 'Laid out by you',
      rationale: opinion,
      itemIds,
      eventType: event,
      occasion: occasion ?? null,
      weather,
      trip: null,
      verdict,
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
  const event = await eventFor(userId, profile, date, { eventType, occasion });
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
  const event = await eventFor(userId, null, date, { occasion, fallback: 'evening' }).then((e) => (occasion ? e : 'evening'));
  const look = await composeOutfit(userId, event, occasion ?? 'the evening', date, { base: payload.itemIds, act: 'evening' });
  if (!look) throw new HttpError(400, 'The closet is short of an evening look');
  payload.evening = { title: occasion ?? 'Tonight', rationale: look.rationale, itemIds: look.itemIds, verdict: look.verdict ?? null };
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
  const phrase = occasion ?? label ?? null;
  const read = phrase ? await readOccasion(userId, phrase) : null;
  const eventType: EventType = read?.eventType ?? (kind === 'evening' ? 'evening' : payload.eventType);
  const composed = await composeOutfit(userId, eventType, phrase, date, {});
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
    verdict: composed.verdict ?? null,
  };
  payload.looks = [...current, newLook];
  // Keep the legacy `evening` mirror in sync for any old client still reading it.
  const eveningSlot = orderLooks(payload.looks).find((l) => l.slot === 'evening');
  payload.evening = eveningSlot
    ? { title: eveningSlot.label ?? eveningSlot.occasion ?? 'Tonight', rationale: eveningSlot.rationale, itemIds: eveningSlot.itemIds, wornLogId: eveningSlot.wornLogId ?? null, verdict: eveningSlot.verdict ?? null }
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
    ? { title: eveningSlot.label ?? eveningSlot.occasion ?? 'Tonight', rationale: eveningSlot.rationale, itemIds: eveningSlot.itemIds, wornLogId: eveningSlot.wornLogId ?? null, verdict: eveningSlot.verdict ?? null }
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
  const suggested = target.itemIds;
  const woreInstead = suggested.length > 0 && [...suggested].sort().join() !== [...ids].sort().join();
  const log = await prisma.wearLog.create({
    data: {
      userId,
      itemIds: ids,
      eventType,
      wornOn: new Date(),
      suggestedItemIds: suggested,
      woreInstead,
      ...(weather ? { weather: { temperatureC: weather.temperatureC, description: weather.description, location: weather.location } } : {}),
    },
  });
  await applyWear(userId, log.itemIds);

  // The taste layer: what was left on the chair (slot-aware), or the look
  // worn as laid out — a vote for its pairs. Then the profile redraws soon.
  void (async () => {
    if (woreInstead) {
      const rows = await prisma.wardrobeItem.findMany({ where: { id: { in: [...new Set([...suggested, ...ids])] }, userId }, select: { id: true, category: true, subtype: true, layerRole: true } });
      const slot = changedSlot(suggested, ids, new Map(rows.map((r) => [r.id, r])));
      await recordWoreInstead(userId, { date, eventType, slot, suggested, worn: ids });
    } else {
      await recordComposed(userId, { itemIds: ids, eventType, date });
    }
    await recomputeTasteProfileSoon(userId);
  })().catch(() => undefined);

  // Persist the log id on this look. The first look also mirrors to the
  // DailyBrief.wornLogId column (and the legacy evening slot) so every existing
  // reader keeps working.
  const isFirst = looks[0]?.id === target.id;
  payload.looks = looks.map((l) => (l.id === target.id ? { ...l, wornLogId: log.id } : l));
  const eveningSlot = orderLooks(payload.looks).find((l) => l.slot === 'evening');
  if (eveningSlot) {
    payload.evening = { title: eveningSlot.label ?? eveningSlot.occasion ?? 'Tonight', rationale: eveningSlot.rationale, itemIds: eveningSlot.itemIds, wornLogId: eveningSlot.wornLogId ?? null, verdict: eveningSlot.verdict ?? null };
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

const swapSchema = z.object({ date: z.string().regex(DATE_RE), outId: z.string().uuid(), inId: z.string().uuid(), lookId: z.string().optional() });

/**
 * Swap one piece of the day's look for another in the same slot. The
 * incoming piece must be clean and fill the same role; the new set is
 * re-validated and its verdict stored; the taste layer hears the swap.
 */
export async function swapBriefItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date, outId, inId, lookId } = swapSchema.parse(req.body);
  const userId = req.user.id;
  const brief = await readDay(userId, date);
  if (!brief) throw new HttpError(404, 'No brief for this date');
  const payload = brief.payload as unknown as BriefPayload;
  const looks = looksOf(payload, brief.wornLogId);
  const target = (lookId ? looks.find((l) => l.id === lookId) : looks.find((l) => l.itemIds.includes(outId))) ?? looks[0];
  if (!target || !target.itemIds.includes(outId)) throw new HttpError(400, 'That item is not in the brief');
  if (target.wornLogId) throw new HttpError(400, 'That look was worn — it can\'t be swapped');
  const [outgoing, incoming] = await Promise.all([
    prisma.wardrobeItem.findFirst({ where: { id: outId, userId } }),
    prisma.wardrobeItem.findFirst({ where: { id: inId, userId } }),
  ]);
  if (!incoming) throw new HttpError(404, 'Replacement item not found');
  if (incoming.state !== 'clean') throw new HttpError(400, 'That piece is not clean right now');
  if (outgoing && roleOf(outgoing) !== roleOf(incoming)) {
    throw new HttpError(400, `That is a ${roleOf(incoming) === 'one-piece' ? 'dress' : roleOf(incoming)}, not a ${roleOf(outgoing) === 'one-piece' ? 'dress' : roleOf(outgoing)} — pick a piece for the same slot`);
  }

  const itemIds = target.itemIds.map((id) => (id === outId ? inId : id));
  const eventType = target.slot === 'evening' ? 'evening' : payload.eventType;
  const { verdict, opinion } = await judgeOwnPlan(userId, itemIds, eventType, target.weather ?? payload.weather ?? null, date);
  const rationale = verdict.ok && verdict.warnings.length === 0 ? target.rationale : opinion.replace(/^Your own choice, laid out ahead\. /, '');

  const isFirst = looks[0]?.id === target.id;
  if (payload.looks?.length) {
    payload.looks = looks.map((l) => (l.id === target.id ? { ...l, itemIds, verdict, rationale } : l));
  }
  if (isFirst) {
    payload.itemIds = itemIds;
    payload.verdict = verdict;
    payload.rationale = rationale;
  }
  const eveningSlot = payload.looks ? orderLooks(payload.looks).find((l) => l.slot === 'evening') : null;
  if (eveningSlot) {
    payload.evening = { title: eveningSlot.label ?? eveningSlot.occasion ?? 'Tonight', rationale: eveningSlot.rationale, itemIds: eveningSlot.itemIds, wornLogId: eveningSlot.wornLogId ?? null, verdict: eveningSlot.verdict ?? null };
  } else if (!payload.looks?.length && target.slot === 'evening' && payload.evening) {
    payload.evening = { ...payload.evening, itemIds, verdict, rationale };
  }
  await prisma.dailyBrief.update({ where: { id: brief.id }, data: { payload: payload as unknown as Prisma.InputJsonValue } });
  void recordSwap(userId, { date, eventType, slot: roleOf(incoming), outId, inId, itemIds: target.itemIds });

  const items = await hydrateItems(userId, isFirst ? payload.itemIds : itemIds);
  res.json({ brief: { ...payload, alternates: undefined, evening: undefined, looks: undefined, ...(isFirst ? {} : { itemIds, rationale, verdict }), items }, verdict, opinion });
}

const altSchema = z.object({
  slot: z.string().min(1).max(40),
  exclude: z.string().optional(),
  /** The day whose look is being edited; its pieces are the outfit to pair against. */
  date: z.string().regex(DATE_RE).optional(),
  /** The piece being replaced, when the client knows it. */
  current: z.string().uuid().optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
});

const ALT_LIMIT = 6;
const RECENT_LOGS = 6;

/**
 * Closet alternatives for one slot of the brief: same layer role as the piece
 * being replaced, clean, not the current piece, not worn in the last six
 * logs where possible, ranked by how well each sits with the rest of the
 * outfit plus the taste layer's opinion. Deterministic and free (no AI call).
 */
export async function briefAlternatives(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const userId = req.user.id;
  const { slot, exclude, date, current, eventType } = altSchema.parse(req.query);
  const excludeIds = (exclude ?? '').split(',').filter(Boolean);
  const [items, recent, taste] = await Promise.all([loadStyleableWardrobe(userId), loadRecentWear(userId), tasteFor(userId)]);

  // The outfit being edited: the day's look, else what the client sent.
  let outfitIds = excludeIds;
  let event: EventType | undefined = eventType;
  if (date) {
    const row = await readDay(userId, date);
    const payload = row?.payload as unknown as BriefPayload | undefined;
    if (payload) {
      const look = looksOf(payload, row!.wornLogId).find((l) => l.itemIds.includes(current ?? '') || l.itemIds.some((id) => excludeIds.includes(id))) ?? looksOf(payload, row!.wornLogId)[0];
      if (look) {
        outfitIds = [...new Set([...outfitIds, ...look.itemIds])];
        event = event ?? (look.slot === 'evening' ? 'evening' : payload.eventType);
      }
    }
  }
  const outfitRows = outfitIds.length ? await closetRows(userId, outfitIds) : [];
  const byId = new Map(outfitRows.map((r) => [r.id, r]));

  // The role to fill: the current piece's, else the first outfit piece in
  // that category, else the category's own default.
  const currentRow = current ? byId.get(current) ?? outfitRows.find((r) => r.id === current) : outfitRows.find((r) => r.category === slot);
  const role = currentRow ? roleOf(currentRow) : roleOf({ category: slot, layerRole: null, subtype: null });
  const currentId = currentRow?.id ?? null;
  const rest = outfitRows.filter((r) => r.id !== currentId);

  const avoid = new Set([...excludeIds, ...(currentId ? [currentId] : [])]);
  const recentIds = new Set(recent.slice(0, RECENT_LOGS).flatMap((r) => r.itemIds));
  const sameRole = items.filter((i) => roleOf(i) === role && !avoid.has(i.id) && i.state === 'clean');
  const fresh = sameRole.filter((i) => !recentIds.has(i.id));
  const candidates = (fresh.length > 0 ? fresh : sameRole)
    .map((i) => {
      const scores = rest.map((r) => pairScore(i, r)).filter((x) => x > 0);
      const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 5;
      return { item: i, score: mean + tasteItemBonus(taste, i, event) };
    })
    .sort((a, b) => b.score - a.score || b.item.wearCount + b.item.pollWins * 2 - (a.item.wearCount + a.item.pollWins * 2))
    .slice(0, ALT_LIMIT);
  const hydrated = await hydrateItems(userId, candidates.map((c) => c.item.id));
  const scoreById = new Map(candidates.map((c) => [c.item.id, Math.round(c.score * 10) / 10]));
  res.json({ alternatives: hydrated.map((h) => ({ ...h, pairScore: scoreById.get(h.id) ?? null })), role });
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
