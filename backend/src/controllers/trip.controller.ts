import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z
  .object({
    destination: z.string().min(1).max(120),
    startDate: z.string().regex(ISO_DATE),
    endDate: z.string().regex(ISO_DATE),
    activities: z.string().max(400).nullish(),
    packedItemIds: z.array(z.string().uuid()).min(1).max(40),
  })
  .refine((d) => d.endDate >= d.startDate, { message: 'The trip must end after it starts' });

export async function createTrip(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const data = createSchema.parse(req.body);
  const owned = await prisma.wardrobeItem.count({
    where: { id: { in: data.packedItemIds }, userId: req.user.id },
  });
  if (owned !== data.packedItemIds.length) {
    throw new HttpError(400, 'Some packed items are not in your closet');
  }
  const trip = await prisma.trip.create({
    data: { userId: req.user.id, ...data, activities: data.activities ?? null },
  });
  res.status(201).json({ trip });
}

export async function listTrips(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const today = new Date().toISOString().slice(0, 10);
  const trips = await prisma.trip.findMany({
    where: { userId: req.user.id, endDate: { gte: today } },
    orderBy: { startDate: 'asc' },
    take: 10,
  });
  res.json({ trips });
}

export async function deleteTrip(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const trip = await prisma.trip.findFirst({
    where: { id: String(req.params.id), userId: req.user.id },
  });
  if (!trip) throw new HttpError(404, 'Trip not found');
  // Cached briefs composed from this trip's capsule are stale once the trip
  // is gone — drop the un-worn ones in its date range so they recompose.
  await prisma.$transaction([
    prisma.trip.delete({ where: { id: trip.id } }),
    prisma.dailyBrief.deleteMany({
      where: {
        userId: req.user.id,
        date: { gte: trip.startDate, lte: trip.endDate },
        wornLogId: null,
      },
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
