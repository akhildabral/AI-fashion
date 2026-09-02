import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type NotificationType =
  | 'new_follower'
  | 'pick_received'
  | 'pick_worn'
  | 'look_reacted'
  | 'look_recreated'
  | 'commented'
  | 'mentioned'
  | 'verdict_settled'
  | 'laundry_due'
  | 'wishlist_nudge'
  | 'invite_joined'
  | 'verdict_asked'
  | 'pick_thanked';

// @handles in a comment body — lowercase, deduped, in order of appearance.
export function mentionedHandles(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/(^|[^a-z0-9_])@([a-z0-9_]{3,20})\b/gi)) {
    const h = m[2].toLowerCase();
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

// Record something that happened to a person. Fire-and-forget: a failed
// notification must never fail the action that caused it. Never notifies
// someone about their own action. `dedupeKey` collapses repeats of the same
// event within a day (e.g. one friend opening "recreate" on the same look
// five times). Resolves true only when a new notification was written.
export async function notify(
  userId: string,
  type: NotificationType,
  actorId: string | null,
  payload: Record<string, unknown> = {},
  opts: { dedupeKey?: string } = {},
): Promise<boolean> {
  if (actorId && actorId === userId) return false;
  try {
    // Nothing crosses a block, in either direction.
    if (actorId) {
      const blocked = await prisma.block.findFirst({
        where: { OR: [{ blockerId: userId, blockedId: actorId }, { blockerId: actorId, blockedId: userId }] },
        select: { id: true },
      });
      if (blocked) return false;
    }
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
      if (existing) return false;
      payload = { ...payload, dedupeKey: opts.dedupeKey };
    }
    await prisma.notification.create({
      data: { userId, type, actorId, payload: payload as Prisma.InputJsonValue },
    });
    return true;
  } catch (err) {
    console.error('notify failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
