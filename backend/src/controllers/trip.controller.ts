import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { closestOwned } from '../services/pairing.service';

// Trips: a trip is a page, not a result. The plan is stored with it, the
// checklist remembers its ticks, the capsule can be edited, and a past trip
// tells you what you packed and never wore.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const planSchema = z.object({
  rationale: z.string().max(2000),
  essentials: z.array(z.string().max(120)).max(40),
  forecast: z.object({
    location: z.string().max(160),
    partial: z.boolean(),
    days: z.array(z.object({ date: z.string(), minC: z.number(), maxC: z.number(), description: z.string(), rainChance: z.boolean() })).max(31),
  }),
  days: z.array(z.object({ label: z.string().max(80), note: z.string().max(400), itemIds: z.array(z.string()).max(12) })).max(31),
});
type TripPlan = z.infer<typeof planSchema>;

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
  const ids = [...new Set([...trip.packedItemIds, ...(plan?.days.flatMap((d) => d.itemIds) ?? [])])];
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: ids }, userId: req.user.id } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const capsule = trip.packedItemIds.map((id) => byId.get(id)).filter(Boolean);
  const days = (plan?.days ?? []).map((d) => ({ label: d.label, note: d.note, items: d.itemIds.map((id) => byId.get(id)).filter(Boolean) }));

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
