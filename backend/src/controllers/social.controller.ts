import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

// The community layer: handles, an asymmetric follow graph (mutual follows
// are "friends"), visitable profiles that expose ONLY public items, and the
// first collaborative act — a friend assembling an outfit for you from your
// public wardrobe.

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

const handleSchema = z.object({
  handle: z
    .string()
    .transform((h) => h.trim().toLowerCase())
    .pipe(z.string().regex(HANDLE_RE, '3-20 characters: a-z, 0-9, underscore')),
});

export async function setHandle(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { handle } = handleSchema.parse(req.body);

  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { handle },
      select: { id: true, email: true, handle: true },
    });
    res.json({ user });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, 'That handle is taken — try another');
    }
    throw err;
  }
}

export async function socialMe(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const [user, followers, following, picks] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user.id }, select: { handle: true } }),
    prisma.follow.count({ where: { followingId: req.user.id } }),
    prisma.follow.count({ where: { followerId: req.user.id } }),
    prisma.friendPick.count({ where: { forUserId: req.user.id } }),
  ]);
  res.json({ handle: user?.handle ?? null, followers, following, picks });
}

export async function searchUsers(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const q = String(req.query.q ?? '')
    .trim()
    .toLowerCase();
  if (q.length < 2) {
    res.json({ users: [] });
    return;
  }
  const users = await prisma.user.findMany({
    where: { handle: { contains: q }, id: { not: req.user.id } },
    select: { handle: true },
    take: 10,
  });
  res.json({ users });
}

async function isMutual(aId: string, bId: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    prisma.follow.findFirst({ where: { followerId: aId, followingId: bId } }),
    prisma.follow.findFirst({ where: { followerId: bId, followingId: aId } }),
  ]);
  return !!ab && !!ba;
}

async function userByHandle(handle: string) {
  const user = await prisma.user.findUnique({
    where: { handle: handle.toLowerCase() },
    select: { id: true, handle: true },
  });
  if (!user) throw new HttpError(404, 'No one goes by that handle');
  return user;
}

// A visitable profile: counts, relationship, and PUBLIC items only.
export async function getProfileByHandle(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = await userByHandle(String(req.params.handle));

  const [followers, following, publicItems, iFollow, followsMe] = await Promise.all([
    prisma.follow.count({ where: { followingId: target.id } }),
    prisma.follow.count({ where: { followerId: target.id } }),
    prisma.wardrobeItem.findMany({
      where: { userId: target.id, visibility: 'public', status: { not: 'processing' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        imageUrl: true,
        category: true,
        subtype: true,
        primaryColor: true,
        pattern: true,
        formality: true,
        season: true,
      },
    }),
    prisma.follow.findFirst({ where: { followerId: req.user.id, followingId: target.id } }),
    prisma.follow.findFirst({ where: { followerId: target.id, followingId: req.user.id } }),
  ]);

  res.json({
    user: { handle: target.handle },
    counts: { followers, following, publicItems: publicItems.length },
    isFollowing: !!iFollow,
    followsYou: !!followsMe,
    isFriend: !!iFollow && !!followsMe,
    isMe: target.id === req.user.id,
    publicItems,
  });
}

export async function followUser(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = await userByHandle(String(req.params.handle));
  if (target.id === req.user.id) throw new HttpError(400, "You can't follow yourself");

  try {
    await prisma.follow.create({ data: { followerId: req.user.id, followingId: target.id } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
  }
  res.json({ ok: true, isFriend: await isMutual(req.user.id, target.id) });
}

export async function unfollowUser(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = await userByHandle(String(req.params.handle));
  await prisma.follow.deleteMany({
    where: { followerId: req.user.id, followingId: target.id },
  });
  res.status(204).send();
}

export async function network(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const [followingRows, followerRows] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: req.user.id },
      include: { following: { select: { id: true, handle: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.findMany({
      where: { followingId: req.user.id },
      include: { follower: { select: { id: true, handle: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const followingIds = new Set(followingRows.map((f) => f.following.id));
  const followerIds = new Set(followerRows.map((f) => f.follower.id));

  res.json({
    following: followingRows.map((f) => ({
      handle: f.following.handle,
      isFriend: followerIds.has(f.following.id),
    })),
    followers: followerRows.map((f) => ({
      handle: f.follower.handle,
      isFriend: followingIds.has(f.follower.id),
    })),
  });
}

// ---- Friend picks: a friend dresses you from your public wardrobe --------

const pickSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(2).max(8),
  note: z.string().max(280).optional(),
});

export async function createPick(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = await userByHandle(String(req.params.handle));
  if (target.id === req.user.id) throw new HttpError(400, 'Pick outfits for your friends, not yourself');
  if (!(await isMutual(req.user.id, target.id))) {
    throw new HttpError(403, 'You can only pick outfits for friends (you follow each other)');
  }
  const { itemIds, note } = pickSchema.parse(req.body);

  // Only the target's PUBLIC items — privacy holds even between friends.
  const items = await prisma.wardrobeItem.findMany({
    where: { id: { in: itemIds }, userId: target.id, visibility: 'public' },
    select: { id: true },
  });
  if (items.length !== new Set(itemIds).size) {
    throw new HttpError(400, 'All items must come from their public wardrobe');
  }

  const pick = await prisma.friendPick.create({
    data: { forUserId: target.id, byUserId: req.user.id, itemIds, note: note?.trim() || null },
  });
  res.status(201).json({ pick });
}

export async function listPicks(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const picks = await prisma.friendPick.findMany({
    where: { forUserId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { byUser: { select: { handle: true } } },
  });

  const allIds = [...new Set(picks.flatMap((p) => p.itemIds))];
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: allIds } } });
  const byId = new Map(items.map((i) => [i.id, i]));

  res.json({
    picks: picks.map((p) => ({
      id: p.id,
      byHandle: p.byUser.handle,
      note: p.note,
      createdAt: p.createdAt,
      items: p.itemIds.map((id) => byId.get(id)).filter(Boolean),
    })),
  });
}

export async function deletePick(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const result = await prisma.friendPick.deleteMany({
    where: { id, forUserId: req.user.id },
  });
  if (result.count === 0) throw new HttpError(404, 'Pick not found');
  res.status(204).send();
}

// ---- Copy-a-look, wardrobe edition: "you own similar pieces" -------------

interface MatchableItem {
  id: string;
  imageUrl: string;
  category: string;
  subtype: string | null;
  primaryColor: string | null;
  pattern: string | null;
}

// Deterministic similarity: same category plus at least two of
// subtype / color / pattern agreeing.
function itemsSimilar(a: MatchableItem, b: MatchableItem): boolean {
  if (a.category !== b.category) return false;
  let score = 0;
  const subA = (a.subtype ?? '').toLowerCase();
  const subB = (b.subtype ?? '').toLowerCase();
  if (subA && subB && (subA.includes(subB) || subB.includes(subA))) score += 2;
  if (a.primaryColor && a.primaryColor === b.primaryColor) score += 1;
  if (a.pattern && a.pattern === b.pattern) score += 1;
  return score >= 2;
}

// How much of someone's public wardrobe you could recreate from your own.
export async function wardrobeOverlap(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const target = await userByHandle(String(req.params.handle));
  if (target.id === req.user.id) throw new HttpError(400, 'That is your own wardrobe');

  const select = {
    id: true,
    imageUrl: true,
    category: true,
    subtype: true,
    primaryColor: true,
    pattern: true,
  };
  const [theirs, mine] = await Promise.all([
    prisma.wardrobeItem.findMany({
      where: { userId: target.id, visibility: 'public', status: { not: 'processing' } },
      select,
    }),
    prisma.wardrobeItem.findMany({
      where: { userId: req.user.id, status: { not: 'processing' } },
      select,
    }),
  ]);

  const matches = theirs
    .map((theirItem) => {
      const mineMatch = mine.find((m) => itemsSimilar(theirItem, m));
      return mineMatch ? { theirs: theirItem, yours: mineMatch } : null;
    })
    .filter((m): m is { theirs: MatchableItem; yours: MatchableItem } => !!m);

  res.json({
    theirCount: theirs.length,
    matchedCount: matches.length,
    matches,
  });
}

// ---- Style twins: people whose taste looks like yours --------------------

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const inter = [...setA].filter((x) => setB.has(x)).length;
  return inter / new Set([...a, ...b]).size;
}

function wardrobeProfile(items: { category: string; primaryColor: string | null }[]) {
  const counts = new Map<string, number>();
  for (const it of items) {
    const key = `${it.category}:${it.primaryColor ?? '-'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const v of a.values()) magA += v * v;
  for (const v of b.values()) magB += v * v;
  if (!magA || !magB) return 0;
  for (const [k, v] of a) dot += v * (b.get(k) ?? 0);
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Match by taste, not follower count: quiz signals + wardrobe make-up.
export async function styleTwins(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');

  const [me, myItems, myFollowing, candidates] = await Promise.all([
    prisma.styleProfile.findUnique({ where: { userId: req.user.id } }),
    prisma.wardrobeItem.findMany({
      where: { userId: req.user.id },
      select: { category: true, primaryColor: true },
    }),
    prisma.follow.findMany({ where: { followerId: req.user.id }, select: { followingId: true } }),
    prisma.user.findMany({
      where: { handle: { not: null }, id: { not: req.user.id } },
      select: {
        id: true,
        handle: true,
        profile: { select: { styleSignals: true } },
        wardrobe: {
          where: { status: { not: 'processing' } },
          select: { category: true, primaryColor: true },
        },
      },
      take: 100,
    }),
  ]);

  const mySignals = ((me?.styleSignals as { signals?: string[] } | null)?.signals ?? []);
  const myWardrobe = wardrobeProfile(myItems);
  const followingIds = new Set(myFollowing.map((f) => f.followingId));

  const twins = candidates
    .map((candidate) => {
      const theirSignals =
        ((candidate.profile?.styleSignals as { signals?: string[] } | null)?.signals ?? []);
      const signalSim = jaccard(mySignals, theirSignals);
      const wardrobeSim = cosine(myWardrobe, wardrobeProfile(candidate.wardrobe));
      const score = signalSim * 0.6 + wardrobeSim * 0.4;
      const shared = mySignals.filter((s) => theirSignals.includes(s)).slice(0, 3);
      return {
        handle: candidate.handle,
        match: Math.round(score * 100),
        sharedTaste: shared,
        isFollowing: followingIds.has(candidate.id),
      };
    })
    .filter((t) => t.match >= 15)
    .sort((a, b) => b.match - a.match)
    .slice(0, 5);

  res.json({ twins });
}
