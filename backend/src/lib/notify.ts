import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { displayName } from './people';
import { sendNativeEvent, type PushPayload } from './push';

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

// The few things worth a buzz on a phone. Everything else stays in the bell.
const PUSHED: Partial<Record<NotificationType, true>> = {
  pick_received: true,
  commented: true,
  mentioned: true,
  verdict_settled: true,
  new_follower: true,
};

/** Where a notification opens in the app: the post it is about, else the bell. */
function routeFor(payload: Record<string, unknown>): string {
  const target = payload.target;
  const id = payload.targetId;
  if (typeof target === 'string' && typeof id === 'string') return `/circle/post/${target}/${id}`;
  return '/circle/notifications';
}

/**
 * The push copy for a notification, in the app's voice. `who` is the actor's
 * name or handle when there is one. Null for types that do not push.
 */
export function pushCopyFor(type: NotificationType, who: string | null, payload: Record<string, unknown> = {}): PushPayload | null {
  if (!PUSHED[type]) return null;
  const route = routeFor(payload);
  const name = who ?? 'Someone';
  const preview = typeof payload.preview === 'string' && payload.preview ? payload.preview : null;
  switch (type) {
    case 'pick_received':
      return { title: `${name} picked a look for you`, body: 'Laid out for your day. Tap to see it.', route, url: route, tag: `pick-${String(payload.pickId ?? '')}` };
    case 'commented':
      return { title: `${name} left a note`, body: preview ?? 'On one of your looks.', route, url: route, tag: `comment-${String(payload.commentId ?? '')}` };
    case 'mentioned':
      return { title: `${name} mentioned you`, body: preview ?? 'In a note on a look.', route, url: route, tag: `mention-${String(payload.commentId ?? '')}` };
    case 'verdict_settled': {
      const question = typeof payload.question === 'string' && payload.question ? payload.question : 'Your verdict';
      const total = typeof payload.totalVotes === 'number' ? payload.totalVotes : 0;
      const body = total === 0 ? 'No votes came in this time.' : payload.winner ? `${total} ${total === 1 ? 'vote' : 'votes'} in. The circle has spoken.` : `${total} votes in, and it is a tie.`;
      return { title: `The verdict is in: ${question}`, body, route, url: route, tag: `verdict-${String(payload.pollId ?? '')}` };
    }
    case 'new_follower':
      return { title: `${name} is following you`, body: 'Your looks now land on their table.', route, url: route, tag: 'follower' };
    default:
      return null;
  }
}

async function pushFor(userId: string, type: NotificationType, actorId: string | null, payload: Record<string, unknown>) {
  if (!PUSHED[type]) return;
  const actor = actorId
    ? await prisma.user.findUnique({ where: { id: actorId }, select: { handle: true, firstName: true, lastName: true } })
    : null;
  const who = actor ? (actor.handle ? `@${actor.handle}` : displayName(actor)) : null;
  const copy = pushCopyFor(type, who, payload);
  if (copy) await sendNativeEvent(userId, 'circle', copy);
}

// Record something that happened to a person. Fire-and-forget: a failed
// notification must never fail the action that caused it. Never notifies
// someone about their own action. `dedupeKey` collapses repeats of the same
// event within a day (e.g. one friend opening "recreate" on the same look
// five times). Resolves true only when a new notification was written.
// The handful of types in PUSHED also buzz the person's phones.
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
    void pushFor(userId, type, actorId, payload).catch(() => undefined);
    return true;
  } catch (err) {
    console.error('notify failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
