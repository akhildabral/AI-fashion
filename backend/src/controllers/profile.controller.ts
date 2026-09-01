import type { Request, Response } from 'express';
import { z } from 'zod';
import { getProfile, upsertProfile } from '../services/profile.service';
import { HttpError } from '../middleware/error';

const profileSchema = z.object({
  bodyType: z.string().max(50).nullish(),
  heightCm: z.coerce.number().int().min(50).max(260).nullish(),
  sizes: z
    .object({
      top: z.string().max(30).optional(),
      bottom: z.string().max(30).optional(),
      shoe: z.string().max(30).optional(),
    })
    .nullish(),
  skinTone: z.string().max(50).nullish(),
  styleVibe: z.string().max(50).nullish(),
  city: z.string().max(120).nullish(),
  styleFor: z.enum(['female', 'male', 'unisex']).nullish(),
  budgetBand: z.string().max(50).nullish(),
  avoidColors: z.array(z.string().max(40)).max(30).optional(),
});

export async function getMyProfile(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const profile = await getProfile(req.user.id);
  res.json({ profile });
}

export async function updateMyProfile(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const input = profileSchema.parse(req.body);
  const profile = await upsertProfile(req.user.id, input);
  res.json({ profile });
}
