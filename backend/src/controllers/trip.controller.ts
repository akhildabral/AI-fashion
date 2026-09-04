import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { closestOwned, outfitsAround } from '../services/pairing.service';
import { EVENT_TYPES, type EventType } from '../lib/attributes';
import { validateOutfit } from '../services/validator.service';
import { verdictOf } from '../services/compose.service';

// Trips: a trip is a page, not a result. The plan is stored with it, the
// checklist remembers its ticks, the capsule can be edited, and a past trip
// tells you what you packed and never wore.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const verdictSchema = z.object({
  ok: z.boolean(),
  violations: z.array(z.object({ rule: z.string(), message: z.string() })),
  warnings: z.array(z.object({ rule: z.string(), message: z.string() })),
});

const planSchema = z.object({
  rationale: z.string().max(2000),
  essentials: z.array(z.string().max(120)).max(40),
  laundryNote: z.string().max(200).nullish(),
  // Things the traveller adds themselves — one place to track the whole trip.
  custom: z.array(z.string().max(120)).max(60).optional(),
  forecast: z.object({
    location: z.string().max(160),
    partial: z.boolean(),
    days: z.array(z.object({ date: z.string(), minC: z.number(), maxC: z.number(), description: z.string(), rainChance: z.boolean() })).max(31),
  }),
  days: z.array(z.object({
    label: z.string().max(80),
    note: z.string().max(400),
    itemIds: z.array(z.string()).max(12),
    eventType: z.enum(EVENT_TYPES).nullish(),
    // The rules' word on the day, as the packer or a replan left it.
    verdict: verdictSchema.nullish(),
    // A trip day can hold several looks (a flight outfit, then a dinner; a
    // wedding's rituals). The first mirrors `itemIds` for backward-compat.
    looks: z.array(z.object({
      id: z.string(),
      label: z.string().max(80).nullish(),
      time: z.string().nullish(),
      occasion: z.string().max(160).nullish(),
      itemIds: z.array(z.string()).max(12),
    })).max(12).optional(),
  })).max(31),
});
type TripPlan = z.infer<typeof planSchema>;
type TripDay = TripPlan['days'][number];
type TripDayLook = NonNullable<TripDay['looks']>[number];

/** A trip day's looks, deriving the legacy single-outfit day into the list. */
function dayLooksOf(day: TripDay): TripDayLook[] {
  if (day.looks?.length) return day.looks;
  return [{ id: 'main', label: null, time: null, occasion: null, itemIds: day.itemIds }];
}

/** Best outfit the capsule can make that isn't one of `avoid`. */
function bestCapsuleOutfit(
  capsule: Awaited<ReturnType<typeof prisma.wardrobeItem.findMany>>,
  avoid: Set<string>[],
  eventType?: EventType,
): string[] | null {
  const same = (ids: string[]) => avoid.some((s) => ids.length === s.size && ids.every((id) => s.has(id)));
  const seen = new Set<string>();
  let best: { itemIds: string[]; score: number } | null = null;
  for (const piece of capsule) {
    for (const o of outfitsAround(piece, capsule, { eventType, limit: 8, availableStates: ['clean', 'packed'] })) {
      const key = [...o.itemIds].sort().join('|');
      if (seen.has(key) || same(o.itemIds)) continue;
      seen.add(key);
      if (!best || o.score > best.score) best = o;
    }
  }
  return best?.itemIds ?? null;
}

const createSchema = z
  .object({
    destination: z.string().min(1).max(120),
    startDate: z.string().regex(ISO_DATE),
    endDate: z.string().regex(ISO_DATE),
    activities: z.string().max(400).nullish(),
    packedItemIds: z.array(z.string().uuid()).min(1).max(40),
    plan: planSchema.optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: 'The trip must end after it starts' });

async function assertOwned(userId: string, itemIds: string[]) {
  const owned = await prisma.wardrobeItem.count({ where: { id: { in: itemIds }, userId } });
  if (owned !== new Set(itemIds).size) throw new HttpError(400, 'Some packed items are not in your closet');
}

export async function createTrip(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const data = createSchema.parse(req.body);
  await assertOwned(req.user.id, data.packedItemIds);
  const trip = await prisma.trip.create({
    data: {
      userId: req.user.id,
      destination: data.destination,
      startDate: data.startDate,
      endDate: data.endDate,
      activities: data.activities ?? null,
      packedItemIds: data.packedItemIds,
      ...(data.plan ? { plan: data.plan as Prisma.InputJsonValue } : {}),
    },
  });
  res.status(201).json({ trip });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Upcoming (and current) trips, and the last few that ended. */
export async function listTrips(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const t = today();
  const [trips, past] = await Promise.all([
    prisma.trip.findMany({ where: { userId: req.user.id, endDate: { gte: t } }, orderBy: { startDate: 'asc' }, take: 10 }),
    prisma.trip.findMany({ where: { userId: req.user.id, endDate: { lt: t } }, orderBy: { startDate: 'desc' }, take: 12 }),
  ]);
  res.json({ trips, past });
}

async function ownTrip(userId: string, id: string) {
  const trip = await prisma.trip.findFirst({ where: { id, userId } });
  if (!trip) throw new HttpError(404, 'Trip not found');
  return trip;
}

/** The trip page: the capsule and days hydrated, and the recap once it's over. */
export async function getTrip(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  const plan = (trip.plan as TripPlan | null) ?? null;
  const ids = [...new Set([
    ...trip.packedItemIds,
    ...(plan?.days.flatMap((d) => [...d.itemIds, ...(d.looks?.flatMap((l) => l.itemIds) ?? [])]) ?? []),
  ])];
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: ids }, userId: req.user.id } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const capsule = trip.packedItemIds.map((id) => byId.get(id)).filter(Boolean);
  const days = (plan?.days ?? []).map((d) => ({
    label: d.label,
    note: d.note,
    eventType: d.eventType ?? null,
    verdict: d.verdict ?? null,
    items: d.itemIds.map((id) => byId.get(id)).filter(Boolean),
    looks: dayLooksOf(d).map((l) => ({
      id: l.id,
      label: l.label ?? null,
      time: l.time ?? null,
      occasion: l.occasion ?? null,
      items: l.itemIds.map((id) => byId.get(id)).filter(Boolean),
    })),
  }));

  // What was packed and never worn, once the trip has ended.
  let recap: { packed: number; worn: number; unworn: unknown[] } | null = null;
  if (trip.endDate < today()) {
    const logs = await prisma.wearLog.findMany({
      where: { userId: req.user.id, wornOn: { gte: new Date(`${trip.startDate}T00:00:00`), lte: new Date(`${trip.endDate}T23:59:59`) } },
      select: { itemIds: true },
    });
    const worn = new Set(logs.flatMap((l) => l.itemIds));
    const unworn = trip.packedItemIds.filter((id) => !worn.has(id)).map((id) => byId.get(id)).filter(Boolean);
    recap = { packed: trip.packedItemIds.length, worn: trip.packedItemIds.filter((id) => worn.has(id)).length, unworn };
  }
  res.json({ trip, capsule, days, recap });
}

const updateSchema = z.object({
  checked: z.array(z.string().max(160)).max(80).optional(),
  packedItemIds: z.array(z.string().uuid()).min(1).max(40).optional(),
  activities: z.string().max(400).nullish(),
});

export async function updateTrip(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  const data = updateSchema.parse(req.body);
  if (data.packedItemIds) await assertOwned(req.user.id, data.packedItemIds);
  const updated = await prisma.trip.update({
    where: { id: trip.id },
    data: {
      ...(data.checked ? { checked: data.checked } : {}),
      ...(data.packedItemIds ? { packedItemIds: data.packedItemIds } : {}),
      ...(data.activities !== undefined ? { activities: data.activities ?? null } : {}),
    },
  });
  res.json({ trip: updated });
}

/** "Not this": swap a packed piece for the closest thing you own that isn't packed. */
const swapSchema = z.object({ itemId: z.string().uuid() });

export async function swapTripItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  const { itemId } = swapSchema.parse(req.body);
  if (!trip.packedItemIds.includes(itemId)) throw new HttpError(400, 'That piece is not in the capsule');
  const closet = await prisma.wardrobeItem.findMany({ where: { userId: req.user.id, owned: true, suppressed: false, status: 'ready', state: { not: 'retired' } } });
  const piece = closet.find((c) => c.id === itemId);
  if (!piece) throw new HttpError(404, 'Piece not found');
  const packed = new Set(trip.packedItemIds);
  const best = closestOwned(piece, closet.filter((c) => !packed.has(c.id)));
  if (!best) throw new HttpError(404, 'Nothing close enough in your closet to swap in');
  const swap = (ids: string[]) => ids.map((id) => (id === itemId ? best.id : id));
  const plan = (trip.plan as TripPlan | null) ?? null;
  const updated = await prisma.trip.update({
    where: { id: trip.id },
    data: {
      packedItemIds: swap(trip.packedItemIds),
      checked: trip.checked.filter((k) => k !== `item-${itemId}`),
      ...(plan ? { plan: { ...plan, days: plan.days.map((d) => ({ ...d, itemIds: swap(d.itemIds) })) } as Prisma.InputJsonValue } : {}),
    },
  });
  res.json({ trip: updated, swappedFor: closet.find((c) => c.id === best.id) });
}

function dayIndexOf(plan: TripPlan | null, raw: string): number {
  const index = Number(raw);
  if (!plan || !Number.isInteger(index) || index < 0 || index >= plan.days.length) throw new HttpError(404, 'Day not found');
  return index;
}

/** Replan one look of a day from the capsule: the best different outfit the
 *  pieces can make. Targets the day's first look unless a `lookId` is given. */
const replanSchema = z.object({ eventType: z.enum(EVENT_TYPES).optional(), lookId: z.string().optional() });

export async function replanTripDay(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  const plan = (trip.plan as TripPlan | null) ?? null;
  const index = dayIndexOf(plan, String(req.params.index));
  const { eventType, lookId } = replanSchema.parse(req.body ?? {});
  const capsule = await prisma.wardrobeItem.findMany({ where: { id: { in: trip.packedItemIds }, userId: req.user.id } });
  if (capsule.length < 2) throw new HttpError(400, 'Pack a few more pieces first');

  const looks = dayLooksOf(plan!.days[index]);
  const target = lookId ? looks.find((l) => l.id === lookId) : looks[0];
  if (!target) throw new HttpError(404, 'Look not found');
  const best = bestCapsuleOutfit(capsule, [new Set(target.itemIds)], eventType as EventType | undefined);
  if (!best) throw new HttpError(404, 'The capsule can only make this one outfit for that day');
  const newLooks = looks.map((l) => (l.id === target.id ? { ...l, itemIds: best } : l));
  const isPrimary = looks[0].id === target.id;
  const verdict = verdictOf(validateOutfit(capsule.filter((c) => best.includes(c.id)), { eventType: eventType as EventType | undefined, availableStates: ['clean', 'packed'] }));
  const days = plan!.days.map((d, i) => (i === index
    ? { ...d, looks: newLooks, ...(isPrimary ? { itemIds: best, verdict } : {}), note: d.note.replace(/\s*·\s*replanned$/, '') + ' · replanned' }
    : d));
  const updated = await prisma.trip.update({ where: { id: trip.id }, data: { plan: { ...plan!, days } as Prisma.InputJsonValue } });
  res.json({ trip: updated });
}

/** Add another look to a trip day — a flight outfit then a dinner, a ritual. */
const addLookSchema = z.object({
  label: z.string().max(80).optional(),
  time: z.string().optional(),
  occasion: z.string().max(160).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
});

export async function addTripLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  const plan = (trip.plan as TripPlan | null) ?? null;
  const index = dayIndexOf(plan, String(req.params.index));
  const { label, time, occasion, eventType } = addLookSchema.parse(req.body ?? {});
  const capsule = await prisma.wardrobeItem.findMany({ where: { id: { in: trip.packedItemIds }, userId: req.user.id } });
  if (capsule.length < 2) throw new HttpError(400, 'Pack a few more pieces first');
  const looks = dayLooksOf(plan!.days[index]);
  const best = bestCapsuleOutfit(capsule, looks.map((l) => new Set(l.itemIds)), eventType as EventType | undefined);
  if (!best) throw new HttpError(400, 'The capsule can only make this one outfit for that day');
  const newLook: TripDayLook = { id: randomUUID(), label: label ?? null, time: time ?? null, occasion: occasion ?? null, itemIds: best };
  const days = plan!.days.map((d, i) => (i === index ? { ...d, looks: [...dayLooksOf(d), newLook] } : d));
  const updated = await prisma.trip.update({ where: { id: trip.id }, data: { plan: { ...plan!, days } as Prisma.InputJsonValue } });
  res.json({ trip: updated });
}

export async function removeTripLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  const plan = (trip.plan as TripPlan | null) ?? null;
  const index = dayIndexOf(plan, String(req.params.index));
  const lookId = String(req.params.lookId);
  const looks = dayLooksOf(plan!.days[index]);
  if (looks.length <= 1) throw new HttpError(400, 'A day keeps at least one look');
  const filtered = looks.filter((l) => l.id !== lookId);
  if (filtered.length === looks.length) throw new HttpError(404, 'Look not found');
  const days = plan!.days.map((d, i) => (i === index ? { ...d, looks: filtered, itemIds: filtered[0].itemIds } : d));
  const updated = await prisma.trip.update({ where: { id: trip.id }, data: { plan: { ...plan!, days } as Prisma.InputJsonValue } });
  res.json({ trip: updated });
}

// POST /trips/:id/checklist — add or remove a traveller's own checklist item.
const checklistSchema = z.object({ add: z.string().max(120).optional(), remove: z.string().max(120).optional() });
export async function updateChecklist(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  const { add, remove } = checklistSchema.parse(req.body);
  const plan = (trip.plan as TripPlan | null) ?? null;
  if (!plan) throw new HttpError(400, 'This trip has no plan yet');
  let custom = plan.custom ?? [];
  const text = add?.trim();
  if (text && !custom.includes(text) && !(plan.essentials ?? []).includes(text)) custom = [...custom, text];
  if (remove) custom = custom.filter((c) => c !== remove);
  const updated = await prisma.trip.update({ where: { id: trip.id }, data: { plan: { ...plan, custom } as Prisma.InputJsonValue } });
  res.json({ trip: updated });
}

// POST /trips/:id/days/:index/looks/:lookId/items — set a look's pieces by hand
// (from the packed capsule). This is how the traveller builds their own outfit.
const lookItemsSchema = z.object({ itemIds: z.array(z.string().uuid()).min(1).max(12) });
export async function setTripLookItems(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  const plan = (trip.plan as TripPlan | null) ?? null;
  const index = dayIndexOf(plan, String(req.params.index));
  const lookId = String(req.params.lookId);
  const { itemIds } = lookItemsSchema.parse(req.body);
  const packed = new Set(trip.packedItemIds);
  if (!itemIds.every((id) => packed.has(id))) throw new HttpError(400, 'Pick from the packed capsule');
  const looks = dayLooksOf(plan!.days[index]);
  const target = looks.find((l) => l.id === lookId);
  if (!target) throw new HttpError(404, 'Look not found');
  const newLooks = looks.map((l) => (l.id === target.id ? { ...l, itemIds } : l));
  const isPrimary = looks[0].id === target.id;
  // The traveller's own pick stands; the rules still get their say.
  const capsule = await prisma.wardrobeItem.findMany({ where: { id: { in: itemIds }, userId: req.user.id } });
  const day = plan!.days[index];
  const verdict = verdictOf(validateOutfit(capsule, { eventType: (day.eventType ?? undefined) as EventType | undefined, availableStates: ['clean', 'packed'], hasCleanFootwear: true }));
  const days = plan!.days.map((d, i) => (i === index ? { ...d, looks: newLooks, ...(isPrimary ? { itemIds, verdict } : {}) } : d));
  const updated = await prisma.trip.update({ where: { id: trip.id }, data: { plan: { ...plan!, days } as Prisma.InputJsonValue } });
  res.json({ trip: updated, verdict });
}

export async function deleteTrip(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await ownTrip(req.user.id, String(req.params.id));
  // Cached briefs composed from this trip's capsule are stale once the trip
  // is gone — drop the un-worn ones in its date range so they recompose.
  await prisma.$transaction([
    prisma.trip.delete({ where: { id: trip.id } }),
    prisma.dailyBrief.deleteMany({
      where: { userId: req.user.id, date: { gte: trip.startDate, lte: trip.endDate }, wornLogId: null },
    }),
  ]);
  res.status(204).send();
}

/** The trip covering a given date, if any — used by the daily brief. */
export async function activeTripFor(userId: string, date: string) {
  return prisma.trip.findFirst({
    where: { userId, startDate: { lte: date }, endDate: { gte: date } },
    orderBy: { startDate: 'desc' },
  });
}
