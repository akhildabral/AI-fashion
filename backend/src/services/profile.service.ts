import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { genderFor, inferMeasurements, regionFor, type FitReference, type Inferred } from './fit.service';

/** The measurements column: the manual numbers, and what the fit references implied. */
export interface StoredMeasurements {
  unit: 'cm' | 'in';
  chest?: number | null;
  waist?: number | null;
  hips?: number | null;
  shoulder?: number | null;
  inseam?: number | null;
  preferredFit?: 'slim' | 'regular' | 'relaxed' | null;
  source?: 'manual' | 'brand-fit' | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  references?: FitReference[] | null;
  inferred?: (Inferred & { preferredFit?: 'slim' | 'regular' | 'relaxed' | null }) | null;
}

export interface ProfileInput {
  bodyType?: string | null;
  heightCm?: number | null;
  sizes?: { top?: string; bottom?: string; shoe?: string } | null;
  skinTone?: string | null;
  styleVibe?: string | null;
  budgetBand?: string | null;
  city?: string | null;
  styleFor?: string | null;
  avoidColors?: string[];
  intents?: string[];
  occasions?: string[];
  units?: string | null;
  fittingStep?: number;
  fittingDone?: boolean;
  currency?: string | null;
  measurements?: StoredMeasurements | null;
  /** Fit references replace the set on file; null or [] clears them. */
  fitReferences?: FitReference[] | null;
}

const MANUAL = ['chest', 'waist', 'hips', 'shoulder', 'inseam'] as const;
function hasManual(m: StoredMeasurements): boolean {
  return MANUAL.some((k) => m[k] != null);
}

/**
 * Merge a measurements edit with what is on file: typed numbers replace typed
 * numbers, references replace references, and the inferred range is recomputed
 * from the references every time. Null when nothing is left.
 */
export function mergeMeasurements(
  prev: StoredMeasurements | null,
  input: { measurements?: StoredMeasurements | null; fitReferences?: FitReference[] | null },
  ctx: { styleFor?: string | null; currency?: string | null },
): StoredMeasurements | null {
  let next: StoredMeasurements | null;
  if (input.measurements === null) {
    // Clearing the numbers keeps the references the member gave.
    next = prev?.references?.length ? { unit: prev.unit, references: prev.references } : null;
  } else if (input.measurements !== undefined) {
    next = { ...input.measurements };
    // A manual edit that doesn't mention references keeps the ones on file.
    if (next.references === undefined && prev?.references?.length) next.references = prev.references;
  } else {
    next = prev ? { ...prev } : null;
  }
  if (input.fitReferences !== undefined) {
    next = next ?? { unit: 'cm' };
    next.references = input.fitReferences?.length ? input.fitReferences : null;
  }
  if (!next) return null;
  delete next.inferred;
  delete next.confidence;
  delete next.source;
  if (next.references?.length) {
    const inf = inferMeasurements(next.references, { gender: genderFor(ctx.styleFor), region: regionFor(ctx.currency) });
    next.inferred = { chest: inf.chest ?? null, waist: inf.waist ?? null, hips: inf.hips ?? null, inseam: inf.inseam ?? null, foot: inf.foot ?? null, preferredFit: inf.preferredFit };
    next.confidence = inf.confidence;
    next.source = hasManual(next) ? 'manual' : 'brand-fit';
  } else {
    delete next.references;
    if (hasManual(next)) next.source = 'manual';
    else if (!next.preferredFit) return null;
  }
  return next;
}

export function getProfile(userId: string) {
  return prisma.styleProfile.findUnique({ where: { userId } });
}

export async function upsertProfile(userId: string, input: ProfileInput) {
  // Merge semantics: only fields actually present in the request are written,
  // so a partial update never wipes fields the client didn't send. Plain scalar
  // values keep this assignable to both the create and update inputs.
  const data: {
    bodyType?: string | null;
    heightCm?: number | null;
    sizes?: Prisma.InputJsonValue | typeof Prisma.DbNull;
    skinTone?: string | null;
    styleVibe?: string | null;
    budgetBand?: string | null;
    city?: string | null;
    styleFor?: string | null;
    currency?: string | null;
    avoidColors?: string[];
    intents?: string[];
    occasions?: string[];
    units?: string | null;
    fittingStep?: number;
    fittingCompletedAt?: Date | null;
    measurements?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  } = {};
  if (input.bodyType !== undefined) data.bodyType = input.bodyType;
  if (input.heightCm !== undefined) data.heightCm = input.heightCm;
  if (input.city !== undefined) data.city = input.city;
  if (input.styleFor !== undefined) data.styleFor = input.styleFor;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.sizes !== undefined) data.sizes = input.sizes ?? Prisma.DbNull;
  if (input.skinTone !== undefined) data.skinTone = input.skinTone;
  if (input.styleVibe !== undefined) data.styleVibe = input.styleVibe;
  if (input.budgetBand !== undefined) data.budgetBand = input.budgetBand;
  if (input.avoidColors !== undefined) data.avoidColors = input.avoidColors;
  if (input.intents !== undefined) data.intents = input.intents;
  if (input.occasions !== undefined) data.occasions = input.occasions;
  if (input.units !== undefined) data.units = input.units;
  // Measurements: typed numbers and fit references merge with what is on
  // file, and the inferred range is recomputed; null with nothing left clears.
  if (input.measurements !== undefined || input.fitReferences !== undefined) {
    const existing = await prisma.styleProfile.findUnique({ where: { userId }, select: { measurements: true, styleFor: true, currency: true } });
    const prev = (existing?.measurements as StoredMeasurements | null) ?? null;
    const merged = mergeMeasurements(prev, input, { styleFor: input.styleFor ?? existing?.styleFor, currency: input.currency ?? existing?.currency });
    data.measurements = merged ? (merged as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
  }
  // Progress only moves forward; a Back tap never loses ground.
  if (input.fittingStep !== undefined) data.fittingStep = input.fittingStep;
  if (input.fittingDone) data.fittingCompletedAt = new Date();
  // Redoing the fitting: back to the first step, and no longer "done".
  else if (input.fittingDone === false) data.fittingCompletedAt = null;

  return prisma.styleProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
