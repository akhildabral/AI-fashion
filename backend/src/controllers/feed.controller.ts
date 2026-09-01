import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

// Circle ring 1: the feed is action cards aggregated from what already
// exists — picks received, poll results, new followers, friends to style.

interface FeedCard {
  type: 'ootd' | 'pick_received' | 'poll_result' | 'poll_open' | 'new_follower' | 'style_a_friend';
  at: string;
  [key: string]: unknown;
}

export async function getFeed(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const userId = req.user.id;
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000);

  const [picks, polls, followers, following] = await Promise.all([
    prisma.friendPick.findMany({
      where: { forUserId: userId, createdAt: { gte: twoWeeksAgo } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { byUser: { select: { handle: true } } },
    }),
    prisma.poll.findMany({
      where: { userId, createdAt: { gte: twoWeeksAgo } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { votes: { select: { optionId: true } } },
    }),
    prisma.follow.findMany({
      where: { followingId: userId, createdAt: { gte: twoWeeksAgo } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { follower: { select: { handle: true } } },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: { id: true, handle: true } } },
      take: 50,
    }),
  ]);

  const cards: FeedCard[] = [];

  // Friends' shared outfits-of-the-day — the zero-effort content loop.
  const followingIds = following.map((fl) => fl.following.id);
  if (followingIds.length > 0) {
    const ootds = await prisma.wearLog.findMany({
      where: { userId: { in: followingIds }, sharedAt: { gte: twoWeeksAgo, not: null } },
      orderBy: { sharedAt: 'desc' },
      take: 12,
      include: { user: { select: { handle: true } } },
    });
    const ootdItemIds = [...new Set(ootds.flatMap((o) => o.itemIds))];
    const ootdItems = await prisma.wardrobeItem.findMany({
      where: { id: { in: ootdItemIds } },
      select: { id: true, imageUrl: true, subtype: true, category: true },
    });
    const ootdItemById = new Map(ootdItems.map((i) => [i.id, i]));
    for (const o of ootds) {
      cards.push({
        type: 'ootd',
        at: (o.sharedAt ?? o.wornOn).toISOString(),
        handle: o.user.handle,
        wornOn: o.wornOn.toISOString(),
        eventType: o.eventType,
        items: o.itemIds.map((id) => ootdItemById.get(id)).filter(Boolean),
      });
    }
  }

  const pickItemIds = [...new Set(picks.flatMap((p) => p.itemIds))];
  const pickItems = await prisma.wardrobeItem.findMany({
    where: { id: { in: pickItemIds } },
    select: { id: true, imageUrl: true, subtype: true, category: true },
  });
  const itemById = new Map(pickItems.map((i) => [i.id, i]));

  for (const p of picks) {
    cards.push({
      type: 'pick_received',
      at: p.createdAt.toISOString(),
      pickId: p.id,
      byHandle: p.byUser.handle,
      note: p.note,
      items: p.itemIds.map((id) => itemById.get(id)).filter(Boolean),
    });
  }

  const now = new Date();
  for (const poll of polls) {
    const counts: Record<string, number> = {};
    for (const v of poll.votes) counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
    const ended = poll.expiresAt < now;
    cards.push({
      type: ended ? 'poll_result' : 'poll_open',
      at: (ended ? poll.expiresAt : poll.createdAt).toISOString(),
      pollId: poll.id,
      question: poll.question,
      options: poll.options,
      counts,
      totalVotes: poll.votes.length,
      expiresAt: poll.expiresAt.toISOString(),
    });
  }

  for (const f of followers) {
    cards.push({
      type: 'new_follower',
      at: f.createdAt.toISOString(),
      handle: f.follower.handle,
    });
  }

  // One standing invitation: mutual friends you could style.
  const friendHandles = following
    .map((f) => f.following.handle)
    .filter((h): h is string => Boolean(h))
    .slice(0, 6);
  if (friendHandles.length > 0) {
    cards.push({ type: 'style_a_friend', at: new Date(0).toISOString(), handles: friendHandles });
  }

  cards.sort((a, b) => (a.at < b.at ? 1 : -1));
  res.json({ cards });
}
