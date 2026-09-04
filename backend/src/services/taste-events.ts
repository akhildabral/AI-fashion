import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// The taste layer's intake. Every helper here is fire-and-forget safe: it
// resolves whatever happens and logs a failure rather than throwing, because
// a lost signal must never fail the swap, the wear or the rating that
// produced it. Call as `void recordSwap(...)` from a controller and move on.

export type StyleEventKind = 'swap' | 'wore_instead' | 'passed_over' | 'composed' | 'rated' | 'feedback';

export interface StyleEventInput {
  kind: StyleEventKind;
  /** When it happened — a Date, or the day's 'YYYY-MM-DD'. Defaults to now. */
  occurredOn?: Date | string | null;
  eventType?: string | null;
  slot?: string | null;
  outId?: string | null;
  inId?: string | null;
  itemIds?: string[];
  outfitId?: string | null;
  rating?: number | null;
  meta?: Record<string, unknown> | null;
}

/** A day key becomes noon UTC of that day, so it lands on the right date in any zone. */
export function occurredAt(when: Date | string | null | undefined): Date {
  if (when instanceof Date) return when;
  if (typeof when === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(when)) return new Date(`${when}T12:00:00Z`);
  if (typeof when === 'string') {
    const d = new Date(when);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function recordStyleEvent(userId: string, input: StyleEventInput): Promise<void> {
  try {
    await prisma.styleEvent.create({
      data: {
        userId,
        kind: input.kind,
        occurredOn: occurredAt(input.occurredOn),
        eventType: input.eventType ?? null,
        slot: input.slot ?? null,
        outId: input.outId ?? null,
        inId: input.inId ?? null,
        itemIds: input.itemIds ?? [],
        outfitId: input.outfitId ?? null,
        rating: input.rating ?? null,
        meta: input.meta ? (input.meta as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch (err) {
    logger.warn({ err, userId, kind: input.kind }, 'Style event not recorded');
  }
}

/** Several events in one round trip; a failure loses the batch, never the request. */
export async function recordStyleEvents(userId: string, inputs: StyleEventInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await prisma.styleEvent.createMany({
      data: inputs.map((input) => ({
        userId,
        kind: input.kind,
        occurredOn: occurredAt(input.occurredOn),
        eventType: input.eventType ?? null,
        slot: input.slot ?? null,
        outId: input.outId ?? null,
        inId: input.inId ?? null,
        itemIds: input.itemIds ?? [],
        outfitId: input.outfitId ?? null,
        rating: input.rating ?? null,
        meta: input.meta ? (input.meta as Prisma.InputJsonValue) : Prisma.JsonNull,
      })),
    });
  } catch (err) {
    logger.warn({ err, userId, count: inputs.length }, 'Style events not recorded');
  }
}

/**
 * A piece swapped out of a laid-out look. `itemIds` is the rest of the look
 * at the time (without outId): it lets the derivation learn what the piece
 * was rejected next to, not only that it was rejected.
 */
export function recordSwap(
  userId: string,
  p: { date: Date | string; eventType?: string | null; slot?: string | null; outId: string; inId: string; itemIds?: string[] },
): Promise<void> {
  return recordStyleEvent(userId, {
    kind: 'swap',
    occurredOn: p.date,
    eventType: p.eventType,
    slot: p.slot,
    outId: p.outId,
    inId: p.inId,
    itemIds: (p.itemIds ?? []).filter((id) => id !== p.outId),
  });
}

/**
 * A day logged as worn when something else had been laid out: one
 * `passed_over` per suggested piece left on the chair, and one
 * `wore_instead` carrying the whole worn set. Identical sets teach nothing
 * and record nothing.
 */
export function recordWoreInstead(
  userId: string,
  p: { date: Date | string; eventType?: string | null; slot?: string | null; suggested: string[]; worn: string[] },
): Promise<void> {
  const worn = new Set(p.worn);
  const passedOver = p.suggested.filter((id) => !worn.has(id));
  const reachedFor = p.worn.filter((id) => !p.suggested.includes(id));
  if (passedOver.length === 0 && reachedFor.length === 0) return Promise.resolve();
  const base = { occurredOn: p.date, eventType: p.eventType, slot: p.slot };
  return recordStyleEvents(userId, [
    ...passedOver.map((outId): StyleEventInput => ({ ...base, kind: 'passed_over', outId, itemIds: p.suggested })),
    { ...base, kind: 'wore_instead', itemIds: p.worn, meta: { suggested: p.suggested, reachedFor } },
  ]);
}

/** A look composed by hand (or saved from the brief) — a positive vote for its pairs. */
export function recordComposed(userId: string, p: { itemIds: string[]; eventType?: string | null; outfitId?: string | null; date?: Date | string }): Promise<void> {
  if (p.itemIds.length === 0) return Promise.resolve();
  return recordStyleEvent(userId, { kind: 'composed', occurredOn: p.date, eventType: p.eventType, itemIds: p.itemIds, outfitId: p.outfitId });
}

/** "Again?" on a look or an outfit: 1–5, where 5 is again and 1 is not this one. */
export function recordRating(userId: string, p: { outfitId?: string | null; itemIds: string[]; rating: number; eventType?: string | null; date?: Date | string }): Promise<void> {
  return recordStyleEvent(userId, { kind: 'rated', occurredOn: p.date, eventType: p.eventType, itemIds: p.itemIds, outfitId: p.outfitId, rating: p.rating });
}

/** Inline correction on a suggested piece: too-formal, too-casual, wrong-color, dont-suggest… */
export function recordFeedback(userId: string, p: { itemId: string; signal: string; eventType?: string | null; itemIds?: string[]; date?: Date | string }): Promise<void> {
  return recordStyleEvent(userId, { kind: 'feedback', occurredOn: p.date, eventType: p.eventType, outId: p.itemId, itemIds: p.itemIds ?? [], meta: { signal: p.signal } });
}
