import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { getWeather } from '../services/weather.service';

// Small answers the fitting needs while it's being taken: is this handle
// free, and what's the weather where mornings happen. Both are read-only.

const handleSchema = z.object({ handle: z.string().trim().toLowerCase().max(20) });
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

// GET /social/handle/available?handle=…
export async function handleAvailable(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { handle } = handleSchema.parse(req.query);
  if (!HANDLE_RE.test(handle)) {
    res.json({ handle, available: false, reason: 'Letters, numbers, underscore. Three to twenty.' });
    return;
  }
  const taken = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  res.json({ handle, available: !taken || taken.id === req.user.id });
}

const citySchema = z.object({ city: z.string().trim().min(2).max(120) });

// GET /weather?city=… — the answer-back on the city screen.
export async function weatherFor(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { city } = citySchema.parse(req.query);
  try {
    const w = await getWeather(city);
    res.json({ ok: true, location: w.location, temperatureC: Math.round(w.temperatureC), description: w.description });
  } catch {
    res.json({ ok: false, location: city });
  }
}
