import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

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
}

export function getProfile(userId: string) {
  return prisma.styleProfile.findUnique({ where: { userId } });
}

export function upsertProfile(userId: string, input: ProfileInput) {
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
    avoidColors?: string[];
  } = {};
  if (input.bodyType !== undefined) data.bodyType = input.bodyType;
  if (input.heightCm !== undefined) data.heightCm = input.heightCm;
  if (input.city !== undefined) data.city = input.city;
  if (input.styleFor !== undefined) data.styleFor = input.styleFor;
  if (input.sizes !== undefined) data.sizes = input.sizes ?? Prisma.DbNull;
  if (input.skinTone !== undefined) data.skinTone = input.skinTone;
  if (input.styleVibe !== undefined) data.styleVibe = input.styleVibe;
  if (input.budgetBand !== undefined) data.budgetBand = input.budgetBand;
  if (input.avoidColors !== undefined) data.avoidColors = input.avoidColors;

  return prisma.styleProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
