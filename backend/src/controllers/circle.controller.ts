import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { mentionedHandles, notify } from '../lib/notify';
import {
  REACTION_KINDS,
  affinityFor,
  commentCounts,
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
  const verdictComments = await commentCounts('verdict', polls.map((p) => p.id));
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
      comments: verdictComments.get(poll.id) ?? 0,
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
  else {
    const ctx = { affinity: await affinityFor(me) };
    const scored = new Map(posts.map((p) => [p, score(p, now, ctx)]));
    posts.sort((a, b) => (scored.get(b) ?? 0) - (scored.get(a) ?? 0));
  }

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

// ---- Comments --------------------------------------------------------------

const targetSchema = z.object({
  target: z.enum(['look', 'verdict']),
  id: z.string().uuid(),
});
const commentSchema = targetSchema.extend({ body: z.string().trim().min(1).max(500) });

async function assertTarget(targetType: 'look' | 'verdict', targetId: string): Promise<{ ownerId: string }> {
  if (targetType === 'look') {
    const log = await prisma.wearLog.findUnique({ where: { id: targetId }, select: { userId: true, sharedAt: true } });
    if (!log || !log.sharedAt) throw new HttpError(404, 'Shared look not found');
    return { ownerId: log.userId };
  }
  const poll = await prisma.poll.findUnique({ where: { id: targetId }, select: { userId: true } });
  if (!poll) throw new HttpError(404, 'Verdict not found');
  return { ownerId: poll.userId };
}

function serializeComment(c: { id: string; body: string; createdAt: Date; userId: string; user: { handle: string | null } }, me: string) {
  return { id: c.id, body: c.body, at: c.createdAt.toISOString(), handle: c.user.handle, isMine: c.userId === me };
}

// GET /comments?target=look|verdict&id=… — oldest first, like a thread.
export async function listComments(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { target, id } = targetSchema.parse(req.query);
  const rows = await prisma.comment.findMany({
    where: { targetType: target, targetId: id },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { user: { select: { handle: true } } },
  });
  res.json({ comments: rows.map((c) => serializeComment(c, req.user!.id)) });
}

// POST /comments — a note on a look or verdict; @handles are notified.
export async function addComment(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { target, id, body } = commentSchema.parse(req.body);
  const { ownerId } = await assertTarget(target, id);
  const comment = await prisma.comment.create({
    data: { userId: req.user.id, targetType: target, targetId: id, body },
    include: { user: { select: { handle: true } } },
  });

  const payload = { target, targetId: id, commentId: comment.id, preview: body.slice(0, 80) };
  void notify(ownerId, 'commented', req.user.id, payload);
  const handles = mentionedHandles(body);
  if (handles.length > 0) {
    const mentioned = await prisma.user.findMany({ where: { handle: { in: handles } }, select: { id: true } });
    for (const u of mentioned) {
      if (u.id !== ownerId) void notify(u.id, 'mentioned', req.user.id, payload);
    }
  }
  res.status(201).json({ comment: serializeComment(comment, req.user.id) });
}

// DELETE /comments/:id — your own note, or one on your own post.
export async function deleteComment(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const c = await prisma.comment.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Comment not found');
  let allowed = c.userId === req.user.id;
  if (!allowed) {
    const { ownerId } = await assertTarget(c.targetType as 'look' | 'verdict', c.targetId).catch(() => ({ ownerId: '' }));
    allowed = ownerId === req.user.id;
  }
  if (!allowed) throw new HttpError(403, 'Not your comment');
  await prisma.comment.delete({ where: { id } });
  res.status(204).send();
}

// ---- Saved looks (your inspiration board) ---------------------------------

export async function saveLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const wearLogId = String(req.params.id);
  const log = await prisma.wearLog.findUnique({ where: { id: wearLogId }, select: { sharedAt: true } });
  if (!log || !log.sharedAt) throw new HttpError(404, 'Shared look not found');
  await prisma.savedLook.upsert({
    where: { userId_wearLogId: { userId: req.user.id, wearLogId } },
    create: { userId: req.user.id, wearLogId },
    update: {},
  });
  res.json({ saved: true });
}

export async function unsaveLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  await prisma.savedLook.deleteMany({ where: { userId: req.user.id, wearLogId: String(req.params.id) } });
  res.json({ saved: false });
}

// GET /circle/saved — the board, newest saves first.
export async function circleSaved(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const saves = await prisma.savedLook.findMany({
    where: { userId: me },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: { wearLog: { include: { user: { select: { handle: true } } } } },
  });
  const { friendIds } = await graphFor(me);
  const logs = saves.map((s) => s.wearLog).filter((l) => l.sharedAt);
  res.json({ posts: await serializeLooks(logs, me, friendIds) });
}

// ---- Sharing your own looks ----------------------------------------------

// GET /circle/mine — your recent wears, with whether each is shared: the
// picker behind "Share a look".
export async function myRecentLooks(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const since = new Date(Date.now() - 14 * 86_400_000);
  const logs = await prisma.wearLog.findMany({
    where: { userId: req.user.id, wornOn: { gte: since } },
    orderBy: { wornOn: 'desc' },
    take: 20,
  });
  const byId = await itemsById(logs.flatMap((l) => l.itemIds));
  res.json({
    looks: logs.map((l) => ({
      id: l.id,
      wornOn: l.wornOn.toISOString(),
      eventType: l.eventType,
      shared: Boolean(l.sharedAt),
      items: l.itemIds.map((id) => byId.get(id)).filter(Boolean),
    })),
  });
}

// POST /looks/:id/share · DELETE — put a wear on (or take it off) the circle.
export async function shareLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const r = await prisma.wearLog.updateMany({ where: { id, userId: req.user.id }, data: { sharedAt: new Date() } });
  if (r.count === 0) throw new HttpError(404, 'Wear not found');
  res.json({ shared: true });
}

export async function unshareLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const r = await prisma.wearLog.updateMany({ where: { id, userId: req.user.id }, data: { sharedAt: null, featuredAt: null } });
  if (r.count === 0) throw new HttpError(404, 'Wear not found');
  res.json({ shared: false });
}
