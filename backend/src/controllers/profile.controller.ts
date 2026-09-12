import type { Request, Response } from 'express';
import { z } from 'zod';
import { getProfile, upsertProfile } from '../services/profile.service';
import { fitBrandOptions, genderFor, regionFor, validReference, type FitReference } from '../services/fit.service';
import { findBrand } from '../lib/size-charts';
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
    // What the charts said, rides along with the manual numbers; the server
    // recomputes it from `fitReferences`, so a client copy is just kept.
    source: z.enum(['manual', 'brand-fit']).nullish(),
    confidence: z.enum(['high', 'medium', 'low']).nullish(),
    references: z.array(z.object({ category: z.enum(['top', 'bottom', 'shoes']), brand: z.string().max(40), size: z.string().max(12), feel: z.enum(['snug', 'right', 'roomy']).nullish(), scale: z.enum(['EU', 'UK', 'US']).nullish() })).max(6).nullish(),
    inferred: z.record(z.string(), z.object({ lo: z.number(), hi: z.number() }).nullable()).nullish(),
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

// A fit reference: a brand from the table, a size on its chart. Validated
// against the table for the member's gender once the profile is known.
export const fitReferenceSchema = z.object({
  category: z.enum(['top', 'bottom', 'shoes']),
  brand: z.string().min(1).max(40),
  size: z.string().min(1).max(12),
  feel: z.enum(['snug', 'right', 'roomy']).nullish(),
  scale: z.enum(['EU', 'UK', 'US']).nullish(),
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
  // Up to one reference per category; null or [] clears them.
  fitReferences: z.array(fitReferenceSchema).max(6).nullish(),
});

export async function getMyProfile(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const profile = await getProfile(req.user.id);
  res.json({ profile });
}

export async function updateMyProfile(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const input = profileSchema.parse(req.body);
  if (input.fitReferences?.length) {
    // The gender the references read against: what this request sets, else the profile.
    const existing = input.styleFor === undefined ? await getProfile(req.user.id) : null;
    const gender = genderFor(input.styleFor ?? existing?.styleFor);
    const region = regionFor(input.currency ?? existing?.currency);
    const seen = new Set<string>();
    for (const ref of input.fitReferences as FitReference[]) {
      if (!findBrand(ref.brand)) throw new HttpError(400, `I don't have ${ref.brand}'s chart yet.`);
      if (!validReference(ref, { gender, region })) throw new HttpError(400, `${ref.size} isn't a ${ref.category === 'shoes' ? 'shoe' : ref.category} size I know in ${findBrand(ref.brand)?.name}.`);
      if (seen.has(ref.category)) throw new HttpError(400, `One ${ref.category} reference is enough.`);
      seen.add(ref.category);
    }
  }
  const profile = await upsertProfile(req.user.id, input);
  res.json({ profile });
}

/** The brands, sizes and scales the "What fits you" card offers, for the member's gender (or `?gender=`). */
export async function getFitBrands(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const q = z.object({ gender: z.enum(['women', 'men', 'unisex']).optional() }).parse(req.query);
  const profile = await getProfile(req.user.id);
  const gender = q.gender ?? genderFor(profile?.styleFor);
  const region = regionFor(profile?.currency);
  res.json({ gender, region: region ?? 'global', brands: fitBrandOptions(gender, region) });
}
