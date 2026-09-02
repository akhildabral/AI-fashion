import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { notify } from '../lib/notify';
import {
  REACTION_KINDS,
  graphFor,
  itemsById,
  score,
  serializeLooks,
  voterKeyFor,
  type CirclePost,
  type PickPost,
  type VerdictPost,
} from '../services/circle.service';

const PAGE = 20;

const feedQuery = z.object({
  lens: z.enum(['foryou', 'following']).default('foryou'),
  offset: z.coerce.number().int().min(0).max(500).default(0),
});

// GET /circle/feed — one ranked column of posts from your circle.
export async function circleFeed(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const { lens, offset } = feedQuery.parse(req.query);
  const now = Date.now();
  const monthAgo = new Date(now - 30 * 86_400_000);
  const weekAgo = new Date(now - 7 * 86_400_000);

  const { followingIds, friendIds } = await graphFor(me);
  const circle = [...followingIds];

  const [logs, polls, picks] = await Promise.all([
    circle.length === 0
      ? Promise.resolve([])
      : prisma.wearLog.findMany({
          where: { userId: { in: circle }, sharedAt: { gte: monthAgo, not: null } },
          orderBy: { sharedAt: 'desc' },
          take: 80,
          include: { user: { select: { handle: true } } },
        }),
    prisma.poll.findMany({
      where: {
        OR: [
          { userId: me, createdAt: { gte: monthAgo } },
          // Friends' verdicts: open ones you can still weigh in on, and
          // recently settled ones so you see how it went.
          ...(circle.length > 0
            ? [{ userId: { in: circle }, OR: [{ expiresAt: { gt: new Date(now) } }, { expiresAt: { gte: weekAgo } }] }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { votes: { select: { optionId: true, voterKey: true } }, user: { select: { handle: true } } },
    }),
    prisma.friendPick.findMany({
      where: { forUserId: me, createdAt: { gte: monthAgo } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { byUser: { select: { handle: true } } },
    }),
  ]);

  const posts: CirclePost[] = [];
  posts.push(...(await serializeLooks(logs, me, friendIds)));

  const myKey = voterKeyFor(me);
  for (const poll of polls) {
    const isMine = poll.userId === me;
    const settled = poll.expiresAt.getTime() < now;
    const myVote = poll.votes.find((v) => v.voterKey === myKey)?.optionId ?? null;
    const counts: Record<string, number> = {};
    for (const v of poll.votes) counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
    const post: VerdictPost = {
      type: 'verdict',
      id: poll.id,
      at: (settled ? poll.expiresAt : poll.createdAt).toISOString(),
      handle: poll.user.handle,
      isMine,
      question: poll.question,
      options: poll.options as unknown as { id: string; imageUrl: string }[],
      expiresAt: poll.expiresAt.toISOString(),
      settled,
      counts: isMine || settled || myVote ? counts : null,
      totalVotes: poll.votes.length,
      myVote,
    };
    posts.push(post);
  }

  const pickItems = await itemsById(picks.flatMap((p) => p.itemIds));
  for (const p of picks) {
    const post: PickPost = {
      type: 'pick',
      id: p.id,
      at: p.createdAt.toISOString(),
      handle: p.byUser.handle,
      note: p.note,
      items: p.itemIds.map((id) => pickItems.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i)),
    };
    posts.push(post);
  }

  if (lens === 'following') posts.sort((a, b) => (a.at < b.at ? 1 : -1));
  else posts.sort((a, b) => score(b, now) - score(a, now));

  const page = posts.slice(offset, offset + PAGE);
  res.json({
    posts: page,
    nextOffset: offset + PAGE < posts.length ? offset + PAGE : null,
    circleSize: circle.length,
  });
}

// GET /circle/today — the rail: who in your circle shared a look today.
export async function circleToday(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const since = new Date(Date.now() - 24 * 3_600_000);
  const { followingIds, friendIds } = await graphFor(me);
  const ids = [me, ...followingIds];
  const logs = await prisma.wearLog.findMany({
    where: { userId: { in: ids }, sharedAt: { gte: since, not: null } },
    orderBy: { sharedAt: 'desc' },
    include: { user: { select: { handle: true } } },
  });
  // One entry per person — their latest.
  const seen = new Set<string>();
  const latest = logs.filter((l) => (seen.has(l.userId) ? false : (seen.add(l.userId), true)));
  const looks = await serializeLooks(latest, me, friendIds);
  res.json({ entries: looks });
}

// Explore, in the same post shape as the feed so one renderer serves both.
export async function circleExplore(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const { friendIds } = await graphFor(me);
  const logs = await prisma.wearLog.findMany({
    where: { sharedAt: { not: null }, userId: { not: me } },
    orderBy: [{ featuredAt: { sort: 'desc', nulls: 'last' } }, { sharedAt: 'desc' }],
    take: 40,
    include: { user: { select: { handle: true } } },
  });
  res.json({ posts: await serializeLooks(logs, me, friendIds) });
}

// ---- Reactions -------------------------------------------------------------

const reactSchema = z.object({ kind: z.enum(REACTION_KINDS) });

async function reactionSummary(wearLogId: string, viewerId: string) {
  const rs = await prisma.lookReaction.findMany({
    where: { wearLogId },
    select: { userId: true, kind: true, user: { select: { handle: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const counts: Record<string, number> = {};
  for (const r of rs) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return {
    counts,
    total: rs.length,
    sample: rs.filter((r) => r.userId !== viewerId && r.user.handle).slice(0, 3).map((r) => r.user.handle as string),
    mine: rs.find((r) => r.userId === viewerId)?.kind ?? null,
  };
}

// POST /looks/:id/react — set (or change) your reaction to a shared look.
export async function reactToLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const wearLogId = String(req.params.id);
  const { kind } = reactSchema.parse(req.body);
  const log = await prisma.wearLog.findUnique({ where: { id: wearLogId }, select: { id: true, userId: true, sharedAt: true } });
  if (!log || !log.sharedAt) throw new HttpError(404, 'Shared look not found');

  const existing = await prisma.lookReaction.findUnique({
    where: { wearLogId_userId: { wearLogId, userId: req.user.id } },
  });
  await prisma.lookReaction.upsert({
    where: { wearLogId_userId: { wearLogId, userId: req.user.id } },
    create: { wearLogId, userId: req.user.id, kind },
    update: { kind },
  });
  if (!existing) {
    void notify(log.userId, 'look_reacted', req.user.id, { wearLogId, kind }, { dedupeKey: `react:${wearLogId}` });
  }
  res.json({ reactions: await reactionSummary(wearLogId, req.user.id) });
}

// DELETE /looks/:id/react — take it back.
export async function unreactToLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const wearLogId = String(req.params.id);
  await prisma.lookReaction.deleteMany({ where: { wearLogId, userId: req.user.id } });
  res.json({ reactions: await reactionSummary(wearLogId, req.user.id) });
}

// ---- Notifications ---------------------------------------------------------

// GET /notifications — what happened to you, newest first, plus the unread count.
export async function listNotifications(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { actor: { select: { handle: true } } },
    }),
    prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
  ]);
  res.json({
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      actorHandle: n.actor?.handle ?? null,
      payload: (n.payload as Prisma.JsonObject | null) ?? {},
      read: Boolean(n.readAt),
      at: n.createdAt.toISOString(),
    })),
  });
}

// GET /notifications/unread — cheap poll for the bell.
export async function unreadCount(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const unread = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
  res.json({ unread });
}

// POST /notifications/read — mark everything read (opening the bell).
export async function markNotificationsRead(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}
