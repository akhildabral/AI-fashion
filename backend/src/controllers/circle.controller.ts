import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { mentionedHandles, notify } from '../lib/notify';
import { saveImageBuffer } from '../lib/storage';
import { dropHidden, hiddenIds } from '../lib/hidden';
import { displayName, type PersonRow } from '../lib/people';
import { extForMime } from '../middleware/upload';
import {
  EMPTY_REACTIONS,
  REACTION_KINDS,
  affinityFor,
  commentCounts,
  graphFor,
  itemsById,
  reactionSummaries,
  score,
  serializeLooks,
  voterKeyFor,
  type CirclePost,
  type PickPost,
  type PostItem,
  type PostTarget,
  type VerdictPost,
  type WeekPost,
} from '../services/circle.service';

type PollRow = { id: string; userId: string; question: string; options: unknown; expiresAt: Date; createdAt: Date; audience: string; audienceIds: string[]; votes: { optionId: string; voterKey: string }[]; user: PersonRow };
type PickRow = { id: string; byUserId: string; forUserId: string; itemIds: string[]; note: string | null; forDay: string | null; thanksAt: Date | null; reply: string | null; wornAt: Date | null; wornLogId: string | null; createdAt: Date; byUser: PersonRow; forUser: PersonRow };

/**
 * Sunday's gathering: the last seven days across the viewer's circle (and
 * themselves), as one card. Null when the week was quiet.
 */
async function weekFor(me: string, circle: string[]): Promise<WeekPost | null> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const people = [me, ...circle];
  const [logs, polls, picks] = await Promise.all([
    prisma.wearLog.findMany({
      where: { userId: { in: people }, sharedAt: { gte: since, not: null } },
      include: { user: { select: { handle: true, firstName: true, lastName: true } } },
    }),
    prisma.poll.findMany({
      where: { userId: { in: people }, expiresAt: { gte: since, lt: now }, audience: { not: 'link' } },
      include: { votes: { select: { optionId: true } }, user: { select: { handle: true, firstName: true, lastName: true } } },
    }),
    prisma.friendPick.findMany({
      where: { createdAt: { gte: since }, withdrawnAt: null, OR: [{ byUserId: { in: people } }, { forUserId: { in: people } }] },
      include: PICK_INCLUDE,
    }),
  ]);
  if (logs.length + polls.length + picks.length < 2) return null;

  const byId = await itemsById(logs.flatMap((l) => l.itemIds));
  // The most-shared piece.
  const pieceCount = new Map<string, { count: number; by: Set<string> }>();
  for (const l of logs) for (const id of new Set(l.itemIds)) {
    const e = pieceCount.get(id) ?? { count: 0, by: new Set<string>() };
    e.count += 1;
    e.by.add(displayName(l.user));
    pieceCount.set(id, e);
  }
  const top = [...pieceCount.entries()].filter(([id]) => byId.has(id)).sort((a, b) => b[1].count - a[1].count)[0];
  const mostWorn = top && top[1].count >= 2 ? { item: byId.get(top[0]) as PostItem, count: top[1].count, by: [...top[1].by].slice(0, 3) } : null;

  // The look with the most would-wears.
  const reactions = logs.length ? await prisma.reaction.groupBy({ by: ['targetId'], where: { targetType: 'look', targetId: { in: logs.map((l) => l.id) }, kind: 'would_wear' }, _count: { _all: true } }) : [];
  const ww = new Map(reactions.map((r) => [r.targetId, r._count._all]));
  const best = [...logs].sort((a, b) => (ww.get(b.id) ?? 0) - (ww.get(a.id) ?? 0))[0];
  const topLook = best && (ww.get(best.id) ?? 0) > 0 ? { id: best.id, name: displayName(best.user), items: best.itemIds.map((id) => byId.get(id)).filter((i): i is PostItem => Boolean(i)), photoUrl: best.photoUrl, wouldWear: ww.get(best.id) ?? 0 } : null;

  // The verdict that drew the most votes.
  const poll = [...polls].sort((a, b) => b.votes.length - a.votes.length)[0];
  let bestVerdict: WeekPost['bestVerdict'] = null;
  if (poll && poll.votes.length > 0) {
    const counts: Record<string, number> = {};
    for (const v of poll.votes) counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const winner = sorted.length > 1 && sorted[0][1] === sorted[1][1] ? null : sorted[0][0].toUpperCase();
    bestVerdict = { id: poll.id, name: displayName(poll.user), question: poll.question, winner, votes: poll.votes.length };
  }

  const dressed = picks.slice(0, 6).map((p) => ({ by: displayName(p.byUser), for: displayName(p.forUser), worn: Boolean(p.wornAt) }));
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return {
    type: 'week',
    id: `week-${monday.toISOString().slice(0, 10)}`,
    at: now.toISOString(),
    handle: null,
    name: 'Your circle',
    from: since.toISOString(),
    to: now.toISOString(),
    looksShared: logs.length,
    people: new Set(logs.map((l) => l.userId)).size,
    mostWorn,
    topLook,
    bestVerdict,
    dressed,
  };
}

/** Shape polls into verdict posts from the viewer's side. */
async function serializeVerdicts(polls: PollRow[], me: string, now = Date.now()): Promise<VerdictPost[]> {
  if (polls.length === 0) return [];
  const ids = polls.map((p) => p.id);
  const [comments, reactions] = await Promise.all([commentCounts('verdict', ids), reactionSummaries('verdict', ids, me)]);
  const myKey = voterKeyFor(me);
  // Names for the people a verdict was asked of, and for signed-in voters (the asker sees who answered).
  const peopleIds = new Set<string>();
  for (const p of polls) {
    for (const id of p.audienceIds) peopleIds.add(id);
    if (p.userId === me) for (const v of p.votes) if (v.voterKey.startsWith('user:')) peopleIds.add(v.voterKey.slice(5));
  }
  const people = peopleIds.size ? await prisma.user.findMany({ where: { id: { in: [...peopleIds] } }, select: { id: true, handle: true, firstName: true, lastName: true } }) : [];
  const nameOf = new Map(people.map((p) => [p.id, displayName(p)]));
  return polls.map((poll) => {
    const isMine = poll.userId === me;
    const settled = poll.expiresAt.getTime() < now;
    const myVote = poll.votes.find((v) => v.voterKey === myKey)?.optionId ?? null;
    const counts: Record<string, number> = {};
    for (const v of poll.votes) counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
    return {
      type: 'verdict',
      id: poll.id,
      at: (settled ? poll.expiresAt : poll.createdAt).toISOString(),
      handle: poll.user.handle,
      name: displayName(poll.user),
      isMine,
      question: poll.question,
      options: poll.options as unknown as { id: string; imageUrl: string }[],
      expiresAt: poll.expiresAt.toISOString(),
      settled,
      counts: isMine || settled || myVote ? counts : null,
      totalVotes: poll.votes.length,
      myVote,
      comments: comments.get(poll.id) ?? 0,
      reactions: reactions.get(poll.id) ?? EMPTY_REACTIONS,
      audience: poll.audience as 'circle' | 'friends' | 'link',
      askedOf: poll.audienceIds.map((id) => nameOf.get(id)).filter((n): n is string => Boolean(n)),
      askedMe: poll.audienceIds.includes(me),
      voters: isMine ? poll.votes.filter((v) => v.voterKey.startsWith('user:')).map((v) => ({ name: nameOf.get(v.voterKey.slice(5)) ?? 'Someone', optionId: v.optionId })) : [],
    };
  });
}

/** Shape friend picks into pick posts, from whichever side the viewer is on. */
async function serializePicks(picks: PickRow[], me: string): Promise<PickPost[]> {
  if (picks.length === 0) return [];
  const ids = picks.map((p) => p.id);
  const wornIds = picks.map((p) => p.wornLogId).filter((x): x is string => Boolean(x));
  const [items, comments, reactions, wornLogs] = await Promise.all([
    itemsById(picks.flatMap((p) => p.itemIds)),
    commentCounts('pick', ids),
    reactionSummaries('pick', ids, me),
    wornIds.length ? prisma.wearLog.findMany({ where: { id: { in: wornIds } }, select: { id: true, photoUrl: true } }) : [],
  ]);
  const photoOf = new Map(wornLogs.map((w) => [w.id, w.photoUrl]));
  return picks.map((p) => {
    const byMe = p.byUserId === me;
    const other = byMe ? p.forUser : p.byUser;
    return {
      type: 'pick',
      id: p.id,
      at: p.createdAt.toISOString(),
      handle: other.handle,
      name: displayName(other),
      role: byMe ? 'by_me' : 'for_me',
      forDay: p.forDay,
      note: p.note,
      items: p.itemIds.map((id) => items.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i)),
      reactions: reactions.get(p.id) ?? EMPTY_REACTIONS,
      comments: comments.get(p.id) ?? 0,
      thanksAt: p.thanksAt ? p.thanksAt.toISOString() : null,
      reply: p.reply,
      wornAt: p.wornAt ? p.wornAt.toISOString() : null,
      photoUrl: p.wornLogId ? (photoOf.get(p.wornLogId) ?? null) : null,
      wornLogId: byMe ? null : p.wornLogId,
    };
  });
}

const PICK_INCLUDE = { byUser: { select: { handle: true, firstName: true, lastName: true } }, forUser: { select: { handle: true, firstName: true, lastName: true } } } as const;

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

  const [{ followingIds, friendIds }, hidden] = await Promise.all([graphFor(me), hiddenIds(me)]);
  const circle = [...followingIds].filter((id) => !hidden.has(id));

  const [logs, polls, picksRaw] = await Promise.all([
    circle.length === 0
      ? Promise.resolve([])
      : prisma.wearLog.findMany({
          where: { userId: { in: circle }, sharedAt: { gte: monthAgo, not: null } },
          orderBy: { sharedAt: 'desc' },
          take: 80,
          include: { user: { select: { handle: true, firstName: true, lastName: true } } },
        }),
    prisma.poll.findMany({
      where: {
        OR: [
          { userId: me, createdAt: { gte: monthAgo } },
          // Your circle's verdicts asked of everyone: open ones you can still
          // weigh in on, and recently settled ones so you see how it went.
          ...(circle.length > 0
            ? [{ userId: { in: circle }, audience: 'circle', OR: [{ expiresAt: { gt: new Date(now) } }, { expiresAt: { gte: weekAgo } }] }]
            : []),
          // Verdicts asked of you by name.
          { audienceIds: { has: me }, userId: { notIn: [...hidden] }, OR: [{ expiresAt: { gt: new Date(now) } }, { expiresAt: { gte: weekAgo } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { votes: { select: { optionId: true, voterKey: true } }, user: { select: { handle: true, firstName: true, lastName: true } } },
    }),
    prisma.friendPick.findMany({
      // Ones made for you (not withdrawn), and ones you made — the conversation runs both ways.
      where: { OR: [{ forUserId: me, withdrawnAt: null }, { byUserId: me, withdrawnAt: null }], createdAt: { gte: monthAgo } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: PICK_INCLUDE,
    }),
  ]);

  const picks = dropHidden(picksRaw, hidden, (p) => (p.byUserId === me ? p.forUserId : p.byUserId));
  const posts: CirclePost[] = [];
  posts.push(...(await serializeLooks(logs, me, friendIds)));
  posts.push(...(await serializeVerdicts(polls, me, now)));
  posts.push(...(await serializePicks(picks, me)));
  if (lens === 'foryou' && offset === 0) {
    const week = await weekFor(me, circle);
    if (week) posts.push(week);
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

// GET /circle/post/:type/:id — one post, for a notification to land on.
export async function getPost(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const type = String(req.params.type) as PostTarget;
  const id = String(req.params.id);
  const hidden = await hiddenIds(me);
  if (type === 'look') {
    const log = await prisma.wearLog.findFirst({ where: { id, sharedAt: { not: null } }, include: { user: { select: { handle: true, firstName: true, lastName: true } } } });
    if (!log || hidden.has(log.userId)) throw new HttpError(404, 'That look isn’t on the circle');
    const { friendIds } = await graphFor(me);
    const [post] = await serializeLooks([log], me, friendIds);
    res.json({ post });
    return;
  }
  if (type === 'verdict') {
    const poll = await prisma.poll.findUnique({ where: { id }, include: { votes: { select: { optionId: true, voterKey: true } }, user: { select: { handle: true, firstName: true, lastName: true } } } });
    if (!poll || hidden.has(poll.userId)) throw new HttpError(404, 'That verdict isn’t here');
    const [post] = await serializeVerdicts([poll], me);
    res.json({ post });
    return;
  }
  if (type === 'pick') {
    const pick = await prisma.friendPick.findFirst({ where: { id, OR: [{ forUserId: me }, { byUserId: me }] }, include: PICK_INCLUDE });
    if (!pick || hidden.has(pick.byUserId === me ? pick.forUserId : pick.byUserId)) throw new HttpError(404, 'That pick isn’t here');
    const [post] = await serializePicks([pick], me);
    res.json({ post });
    return;
  }
  throw new HttpError(400, 'Unknown kind of post');
}

// GET /circle/today — the rail: who in your circle shared a look today.
export async function circleToday(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [{ followingIds, friendIds }, hidden] = await Promise.all([graphFor(me), hiddenIds(me)]);
  const ids = [me, ...[...followingIds].filter((id) => !hidden.has(id))];
  const logs = await prisma.wearLog.findMany({
    where: { userId: { in: ids }, sharedAt: { gte: since, not: null } },
    orderBy: { sharedAt: 'desc' },
    include: { user: { select: { handle: true, firstName: true, lastName: true } } },
  });
  // One entry per person — their latest.
  const seen = new Set<string>();
  const latest = logs.filter((l) => (seen.has(l.userId) ? false : (seen.add(l.userId), true)));
  const looks = await serializeLooks(latest, me, friendIds);
  res.json({ entries: looks });
}

// Explore, in the same post shape as the feed so one renderer serves both.
const exploreQuery = z.object({
  occasion: z.enum(['work', 'casual', 'evening', 'occasion', 'athletic']).optional(),
  // Only people whose taste signals overlap yours.
  kindred: z.coerce.boolean().optional(),
});

export async function circleExplore(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const me = req.user.id;
  const { occasion, kindred } = exploreQuery.parse(req.query);
  const [{ friendIds }, hidden] = await Promise.all([graphFor(me), hiddenIds(me)]);
  let authors: string[] | null = null;
  if (kindred) {
    const mine = await prisma.styleProfile.findUnique({ where: { userId: me }, select: { styleSignals: true } });
    const signals = new Set(((mine?.styleSignals as { signals?: string[] } | null)?.signals ?? []).map((s) => s.toLowerCase()));
    const others = await prisma.styleProfile.findMany({ where: { userId: { not: me } }, select: { userId: true, styleSignals: true } });
    authors = others.filter((o) => (((o.styleSignals as { signals?: string[] } | null)?.signals ?? []).some((s) => signals.has(s.toLowerCase())))).map((o) => o.userId);
  }
  const logs = await prisma.wearLog.findMany({
    where: {
      sharedAt: { not: null },
      userId: authors ? { in: authors.filter((a) => a !== me && !hidden.has(a)) } : { not: me, notIn: [...hidden] },
      ...(occasion ? { eventType: occasion } : {}),
    },
    orderBy: [{ featuredAt: { sort: 'desc', nulls: 'last' } }, { sharedAt: 'desc' }],
    take: 40,
    include: { user: { select: { handle: true, firstName: true, lastName: true } } },
  });
  res.json({ posts: await serializeLooks(logs, me, friendIds) });
}

// ---- Reactions -------------------------------------------------------------

const reactSchema = z.object({ kind: z.enum(REACTION_KINDS) });
const postTypeSchema = z.enum(['look', 'verdict', 'pick']);

async function summaryOf(target: PostTarget, id: string, viewerId: string) {
  return (await reactionSummaries(target, [id], viewerId)).get(id) ?? EMPTY_REACTIONS;
}

// POST /posts/:type/:id/react — set (or change) your reaction to any post.
export async function reactToPost(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = postTypeSchema.parse(req.params.type ?? 'look');
  const id = String(req.params.id);
  const { kind } = reactSchema.parse(req.body);
  const { ownerId } = await assertTarget(target, id);
  const key = { userId_targetType_targetId: { userId: req.user.id, targetType: target, targetId: id } };
  const existing = await prisma.reaction.findUnique({ where: key });
  await prisma.reaction.upsert({ where: key, create: { userId: req.user.id, targetType: target, targetId: id, kind }, update: { kind } });
  if (!existing) {
    void notify(ownerId, 'look_reacted', req.user.id, { target, targetId: id, kind, wearLogId: target === 'look' ? id : undefined }, { dedupeKey: `react:${target}:${id}` });
  }
  res.json({ reactions: await summaryOf(target, id, req.user.id) });
}

// DELETE /posts/:type/:id/react — take it back.
export async function unreactToPost(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = postTypeSchema.parse(req.params.type ?? 'look');
  const id = String(req.params.id);
  await prisma.reaction.deleteMany({ where: { userId: req.user.id, targetType: target, targetId: id } });
  res.json({ reactions: await summaryOf(target, id, req.user.id) });
}

// The old look-only routes keep working.
export const reactToLook = reactToPost;
export const unreactToLook = unreactToPost;

// ---- Notifications ---------------------------------------------------------

// GET /notifications — what happened to you, newest first, plus the unread count.
export async function listNotifications(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { actor: { select: { handle: true, firstName: true, lastName: true } } },
    }),
    prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
  ]);
  res.json({
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      actorHandle: n.actor?.handle ?? null,
      actorName: n.actor ? displayName(n.actor) : null,
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
  target: z.enum(['look', 'verdict', 'pick']),
  id: z.string().uuid(),
});
const commentSchema = targetSchema.extend({ body: z.string().trim().min(1).max(500) });

/** The post exists; who should hear about it (the owner, and for a pick the one it was made for too). */
async function assertTarget(targetType: PostTarget, targetId: string): Promise<{ ownerId: string; alsoId?: string }> {
  if (targetType === 'look') {
    const log = await prisma.wearLog.findUnique({ where: { id: targetId }, select: { userId: true, sharedAt: true } });
    if (!log || !log.sharedAt) throw new HttpError(404, 'Shared look not found');
    return { ownerId: log.userId };
  }
  if (targetType === 'pick') {
    const pick = await prisma.friendPick.findUnique({ where: { id: targetId }, select: { byUserId: true, forUserId: true } });
    if (!pick) throw new HttpError(404, 'Pick not found');
    return { ownerId: pick.byUserId, alsoId: pick.forUserId };
  }
  const poll = await prisma.poll.findUnique({ where: { id: targetId }, select: { userId: true } });
  if (!poll) throw new HttpError(404, 'Verdict not found');
  return { ownerId: poll.userId };
}

function serializeComment(c: { id: string; body: string; createdAt: Date; userId: string; user: PersonRow }, me: string) {
  return { id: c.id, body: c.body, at: c.createdAt.toISOString(), handle: c.user.handle, name: displayName(c.user), isMine: c.userId === me };
}

// GET /comments?target=look|verdict&id=… — oldest first, like a thread.
export async function listComments(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { target, id } = targetSchema.parse(req.query);
  const rows = await prisma.comment.findMany({
    where: { targetType: target, targetId: id },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { user: { select: { handle: true, firstName: true, lastName: true } } },
  });
  const hidden = await hiddenIds(req.user.id);
  res.json({ comments: dropHidden(rows, hidden, (c) => c.userId).map((c) => serializeComment(c, req.user!.id)) });
}

// POST /comments — a note on a look or verdict; @handles are notified.
export async function addComment(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { target, id, body } = commentSchema.parse(req.body);
  const { ownerId, alsoId } = await assertTarget(target, id);
  const comment = await prisma.comment.create({
    data: { userId: req.user.id, targetType: target, targetId: id, body },
    include: { user: { select: { handle: true, firstName: true, lastName: true } } },
  });

  const payload = { target, targetId: id, commentId: comment.id, preview: body.slice(0, 80) };
  void notify(ownerId, 'commented', req.user.id, payload);
  if (alsoId && alsoId !== ownerId) void notify(alsoId, 'commented', req.user.id, payload);
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
    const { ownerId } = await assertTarget(c.targetType as PostTarget, c.targetId).catch(() => ({ ownerId: '' }));
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
    include: { wearLog: { include: { user: { select: { handle: true, firstName: true, lastName: true } } } } },
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
      photoUrl: l.photoUrl,
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
  await Promise.all([
    prisma.comment.deleteMany({ where: { targetType: 'look', targetId: id } }),
    prisma.reaction.deleteMany({ where: { targetType: 'look', targetId: id } }),
    prisma.savedLook.deleteMany({ where: { wearLogId: id } }),
  ]);
  res.json({ shared: false });
}

// ---- The OOTD photo ---------------------------------------------------------

// POST /looks/:id/photo (multipart "photo") — a photo of you in the look.
export async function setLookPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  if (!req.file) throw new HttpError(400, 'Attach a photo');
  const id = String(req.params.id);
  const log = await prisma.wearLog.findFirst({ where: { id, userId: req.user.id }, select: { id: true } });
  if (!log) throw new HttpError(404, 'Wear not found');
  const stored = await saveImageBuffer(req.file.buffer, extForMime(req.file.mimetype));
  await prisma.wearLog.update({ where: { id }, data: { photoUrl: stored.url } });
  res.json({ photoUrl: stored.url });
}

// POST /looks/:id/photo-from-render { tryOnId } — use a Mirror render as the photo.
const fromRenderSchema = z.object({ tryOnId: z.string().uuid() });
export async function setLookPhotoFromRender(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const { tryOnId } = fromRenderSchema.parse(req.body);
  const [log, render] = await Promise.all([
    prisma.wearLog.findFirst({ where: { id, userId: req.user.id }, select: { id: true } }),
    prisma.tryOn.findFirst({ where: { id: tryOnId, userId: req.user.id }, select: { imageUrl: true } }),
  ]);
  if (!log) throw new HttpError(404, 'Wear not found');
  if (!render) throw new HttpError(404, 'Render not found');
  await prisma.wearLog.update({ where: { id }, data: { photoUrl: render.imageUrl } });
  res.json({ photoUrl: render.imageUrl });
}

export async function clearLookPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const r = await prisma.wearLog.updateMany({ where: { id, userId: req.user.id }, data: { photoUrl: null } });
  if (r.count === 0) throw new HttpError(404, 'Wear not found');
  res.json({ photoUrl: null });
}
