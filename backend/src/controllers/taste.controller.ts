import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { computeTasteProfile, dismissTasteFact, loadTasteProfile, TASTE_MIN_WEARS, type TasteProfileData } from '../services/taste.service';

// What the stylist has learned about how a member actually dresses, for the
// member to read and correct. The composer reads the same row through the
// service's hooks; this is the human-facing slice of it.

function summary(p: TasteProfileData) {
  return {
    computedAt: p.computedAt,
    sampleSize: p.sampleSize,
    facts: p.facts,
    favouriteOutfits: p.favouriteOutfits,
    colourAffinity: p.colourAffinity,
    formalityOffset: p.formalityOffset,
  };
}

async function respond(userId: string, res: Response, profile: TasteProfileData) {
  const coldStart = profile.sampleSize < TASTE_MIN_WEARS;
  let signals: string[] = [];
  if (coldStart) {
    // Until the record can speak, the fitting's quiz does.
    const sp = await prisma.styleProfile.findUnique({ where: { userId }, select: { styleSignals: true } });
    const raw = sp?.styleSignals as { signals?: unknown } | null;
    if (raw && Array.isArray(raw.signals)) signals = raw.signals.filter((s): s is string => typeof s === 'string');
  }
  res.json({ profile: summary(profile), coldStart, signals });
}

export async function getTaste(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const profile = (await loadTasteProfile(req.user.id)) ?? (await computeTasteProfile(req.user.id));
  await respond(req.user.id, res, profile);
}

const factIdSchema = z.string().min(1).max(160);

export async function dismissFact(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = factIdSchema.parse(String(req.params.id));
  const profile = await dismissTasteFact(req.user.id, id);
  await respond(req.user.id, res, profile);
}

export async function recomputeTaste(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const profile = await computeTasteProfile(req.user.id);
  await respond(req.user.id, res, profile);
}
