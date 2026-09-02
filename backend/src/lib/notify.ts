import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type NotificationType =
  | 'new_follower'
  | 'pick_received'
  | 'pick_worn'
  | 'look_reacted'
  | 'look_recreated';

// Record something that happened to a person. Fire-and-forget: a failed
// notification must never fail the action that caused it. Never notifies
// someone about their own action. `dedupeKey` collapses repeats of the same
// event within a day (e.g. one friend opening "recreate" on the same look
// five times).
export async function notify(
  userId: string,
  type: NotificationType,
  actorId: string | null,
  payload: Record<string, unknown> = {},
  opts: { dedupeKey?: string } = {},
): Promise<void> {
  if (actorId && actorId === userId) return;
  try {
    if (opts.dedupeKey) {
      const since = new Date(Date.now() - 86_400_000);
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          type,
          actorId,
          createdAt: { gte: since },
          payload: { path: ['dedupeKey'], equals: opts.dedupeKey },
        },
        select: { id: true },
      });
      if (existing) return;
      payload = { ...payload, dedupeKey: opts.dedupeKey };
    }
    await prisma.notification.create({
      data: { userId, type, actorId, payload: payload as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error('notify failed:', err instanceof Error ? err.message : err);
  }
}
