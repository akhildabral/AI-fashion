import type { Request, Response } from 'express';
import { z } from 'zod';
import { getProfile, upsertProfile } from '../services/profile.service';
import { HttpError } from '../middleware/error';

// Optional measurements for the fitting's build plaque; never required. One
// unit for every number, and a sane range per unit so a typo can't become
// advice. `null` clears them.
const measurement = (unit: 'cm' | 'in', lo: number, hi: number) => (unit === 'cm' ? z.number().min(lo).max(hi) : z.number().min(lo / 2.54).max(hi / 2.54));
export const measurementsSchema = z
  .object({
    unit: z.enum(['cm', 'in']),
    chest: z.number().nullish(),
    waist: z.number().nullish(),
    hips: z.number().nullish(),
    shoulder: z.number().nullish(),
    inseam: z.number().nullish(),
    preferredFit: z.enum(['slim', 'regular', 'relaxed']).nullish(),
  })
  .superRefine((m, ctx) => {
    const ranges: Record<string, [number, number]> = { chest: [50, 200], waist: [40, 200], hips: [50, 200], shoulder: [25, 80], inseam: [40, 120] };
    for (const [key, [lo, hi]] of Object.entries(ranges)) {
      const v = m[key as keyof typeof ranges as 'chest'];
      if (v == null) continue;
      const r = measurement(m.unit, lo, hi).safeParse(v);
      if (!r.success) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} should be between ${m.unit === 'cm' ? lo : Math.round(lo / 2.54)} and ${m.unit === 'cm' ? hi : Math.round(hi / 2.54)} ${m.unit}` });
    }
  });

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
  // ISO 4217; null = guess from where they are.
  currency: z.string().regex(/^[A-Z]{3}$/).nullish(),
  budgetBand: z.string().max(50).nullish(),
  avoidColors: z.array(z.string().max(40)).max(30).optional(),
  // The fitting: what matters most, the days they dress for, and where they
  // got to (so an abandoned fitting resumes instead of resetting).
  intents: z.array(z.enum(['decided', 'own', 'friends'])).max(3).optional(),
  occasions: z.array(z.string().max(30)).max(8).optional(),
  fittingStep: z.number().int().min(0).max(20).optional(),
  fittingDone: z.boolean().optional(),
  units: z.enum(['metric', 'imperial']).nullish(),
  measurements: measurementsSchema.nullish(),
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
