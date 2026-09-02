import { prisma } from '../lib/prisma';

// The Circle feed: shared looks, verdicts (polls) and picks from the people
// you follow, shaped into posts and ranked so what needs you rises. This is
// the one place that decides what a "post" looks like — the controller only
// gathers and the client only renders.

export const REACTION_KINDS = ['would_wear', 'bold', 'love'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export interface PostItem {
  id: string;
  imageUrl: string;
  subtype: string | null;
  category: string;
}

export interface LookPost {
  type: 'look';
  id: string; // wearLogId
  at: string;
  handle: string | null;
  isMine: boolean;
  isFriend: boolean;
  eventType: string | null;
  featured: boolean;
  items: PostItem[];
  reactions: { counts: Record<string, number>; total: number; sample: string[]; mine: ReactionKind | null };
  comments: number;
  saved: boolean;
  saves: number;
  recreates: number;
}

export interface VerdictPost {
  type: 'verdict';
  id: string; // pollId
  at: string;
  handle: string | null;
  isMine: boolean;
  question: string;
  options: { id: string; imageUrl: string }[];
  expiresAt: string;
  settled: boolean;
  // Counts are shown once you've weighed in, or when it's settled, or it's yours.
  counts: Record<string, number> | null;
  totalVotes: number;
  myVote: string | null;
  comments: number;
}

export interface PickPost {
  type: 'pick';
  id: string; // pickId
  at: string;
  handle: string | null; // who styled you
  note: string | null;
  items: PostItem[];
}

export type CirclePost = LookPost | VerdictPost | PickPost;

export function voterKeyFor(userId: string): string {
  return `user:${userId}`;
}

export async function itemsById(ids: string[]): Promise<Map<string, PostItem>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const items = await prisma.wardrobeItem.findMany({
    where: { id: { in: unique } },
    select: { id: true, imageUrl: true, subtype: true, category: true },
  });
  return new Map(items.map((i) => [i.id, i]));
}

/** Who the viewer follows and who follows them back. */
export async function graphFor(userId: string) {
  const [following, followers] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true } }),
  ]);
  const followingIds = new Set(following.map((f) => f.followingId));
  const followerIds = new Set(followers.map((f) => f.followerId));
  const friendIds = new Set([...followingIds].filter((id) => followerIds.has(id)));
  return { followingIds, followerIds, friendIds };
}

/** Comment counts per target id, for one target type. */
export async function commentCounts(targetType: 'look' | 'verdict', ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.comment.groupBy({
    by: ['targetId'],
    where: { targetType, targetId: { in: ids } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.targetId, r._count._all]));
}

type LogRow = {
  id: string;
  userId: string;
  itemIds: string[];
  wornOn: Date;
  sharedAt: Date | null;
  featuredAt: Date | null;
  eventType: string | null;
  recreatedCount: number;
  user: { handle: string | null };
};

/** Shape shared wear logs into look posts, with reactions attached. */
export async function serializeLooks(
  logs: LogRow[],
  viewerId: string,
  friendIds: Set<string>,
): Promise<LookPost[]> {
  if (logs.length === 0) return [];
  const ids = logs.map((l) => l.id);
  const [byId, reactions, comments, saved, saveCounts] = await Promise.all([
    itemsById(logs.flatMap((l) => l.itemIds)),
    prisma.lookReaction.findMany({
      where: { wearLogId: { in: ids } },
      select: { wearLogId: true, userId: true, kind: true, user: { select: { handle: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    commentCounts('look', ids),
    prisma.savedLook.findMany({ where: { userId: viewerId, wearLogId: { in: ids } }, select: { wearLogId: true } }),
    prisma.savedLook.groupBy({ by: ['wearLogId'], where: { wearLogId: { in: ids } }, _count: { _all: true } }),
  ]);
  const savedSet = new Set(saved.map((s) => s.wearLogId));
  const savesBy = new Map(saveCounts.map((s) => [s.wearLogId, s._count._all]));
  const byLog = new Map<string, typeof reactions>();
  for (const r of reactions) {
    const list = byLog.get(r.wearLogId) ?? [];
    list.push(r);
    byLog.set(r.wearLogId, list);
  }
  return logs.map((l) => {
    const rs = byLog.get(l.id) ?? [];
    const counts: Record<string, number> = {};
    for (const r of rs) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    const mine = rs.find((r) => r.userId === viewerId)?.kind ?? null;
    return {
      type: 'look',
      id: l.id,
      at: (l.sharedAt ?? l.wornOn).toISOString(),
      handle: l.user.handle,
      isMine: l.userId === viewerId,
      isFriend: friendIds.has(l.userId),
      eventType: l.eventType,
      featured: Boolean(l.featuredAt),
      items: l.itemIds.map((id) => byId.get(id)).filter((i): i is PostItem => Boolean(i)),
      reactions: {
        counts,
        total: rs.length,
        sample: rs
          .filter((r) => r.userId !== viewerId && r.user.handle)
          .slice(0, 3)
          .map((r) => r.user.handle as string),
        mine: (REACTION_KINDS as readonly string[]).includes(mine ?? '') ? (mine as ReactionKind) : null,
      },
      comments: comments.get(l.id) ?? 0,
      saved: savedSet.has(l.id),
      saves: savesBy.get(l.id) ?? 0,
      recreates: l.recreatedCount,
    };
  });
}

// Earned standing — verified by what actually happened, never purchasable.
export async function standingFor(userId: string) {
  const [picksWorn, recreated, looksShared, wouldWear] = await Promise.all([
    prisma.notification.count({ where: { userId, type: 'pick_worn' } }),
    prisma.wearLog.aggregate({ where: { userId }, _sum: { recreatedCount: true } }).then((r) => r._sum.recreatedCount ?? 0),
    prisma.wearLog.count({ where: { userId, sharedAt: { not: null } } }),
    prisma.lookReaction.count({ where: { wearLog: { userId }, kind: 'would_wear' } }),
  ]);
  return { picksWorn, recreated, looksShared, wouldWear };
}

/**
 * Affinity: whose things the viewer actually engages with (reactions, notes,
 * saves, recreates over the last 60 days), keyed by author handle. This is
 * the personal half of "For you" — the other half is what's lively.
 */
export async function affinityFor(viewerId: string): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 60 * 86_400_000);
  const [reactions, comments, saves, recreates] = await Promise.all([
    prisma.lookReaction.findMany({
      where: { userId: viewerId, createdAt: { gte: since } },
      select: { wearLog: { select: { user: { select: { handle: true } } } } },
    }),
    prisma.comment.findMany({ where: { userId: viewerId, createdAt: { gte: since } }, select: { targetType: true, targetId: true } }),
    prisma.savedLook.findMany({
      where: { userId: viewerId, createdAt: { gte: since } },
      select: { wearLog: { select: { user: { select: { handle: true } } } } },
    }),
    prisma.notification.findMany({
      where: { actorId: viewerId, type: 'look_recreated', createdAt: { gte: since } },
      select: { user: { select: { handle: true } } },
    }),
  ]);
  const m = new Map<string, number>();
  const add = (h: string | null | undefined, w: number) => {
    if (h) m.set(h, (m.get(h) ?? 0) + w);
  };
  for (const r of reactions) add(r.wearLog.user.handle, 1);
  for (const s of saves) add(s.wearLog.user.handle, 2);
  for (const r of recreates) add(r.user.handle, 3);
  if (comments.length > 0) {
    const lookIds = comments.filter((c) => c.targetType === 'look').map((c) => c.targetId);
    const pollIds = comments.filter((c) => c.targetType === 'verdict').map((c) => c.targetId);
    const [logs, polls] = await Promise.all([
      lookIds.length ? prisma.wearLog.findMany({ where: { id: { in: lookIds } }, select: { id: true, user: { select: { handle: true } } } }) : [],
      pollIds.length ? prisma.poll.findMany({ where: { id: { in: pollIds } }, select: { id: true, user: { select: { handle: true } } } }) : [],
    ]);
    const owner = new Map<string, string | null>([...logs.map((l) => [l.id, l.user.handle] as const), ...polls.map((p) => [p.id, p.user.handle] as const)]);
    for (const c of comments) add(owner.get(c.targetId), 2);
  }
  return m;
}

export interface RankContext {
  /** Author handle → how much the viewer engages with them. */
  affinity?: Map<string, number>;
}

// Ranking for "For you": recency decays over a couple of days; things that
// need the viewer (an open verdict they haven't voted on, a pick made for
// them) jump ahead; then what's lively (notes, saves, recreates, reactions)
// and who the viewer actually engages with get a nudge.
export function score(post: CirclePost, now: number, ctx: RankContext = {}): number {
  const ageHours = Math.max(0, (now - new Date(post.at).getTime()) / 3_600_000);
  let s = 100 * Math.exp(-ageHours / 36);
  // A look someone made for you outranks anything fresh for about two days.
  if (post.type === 'pick') s += 90;
  if (post.type === 'verdict') {
    if (!post.settled && !post.isMine && !post.myVote) s += 45;
    else if (post.settled && post.isMine) s += 25;
    else if (!post.settled) s += 10;
    s += Math.min(12, post.comments * 3);
  }
  if (post.type === 'look') {
    if (post.isFriend) s += 8;
    if (post.featured) s += 5;
    // Lively: what the room is doing with it.
    s += Math.min(20, post.reactions.total * 2);
    s += Math.min(12, post.comments * 3);
    s += Math.min(12, post.saves * 4);
    s += Math.min(18, post.recreates * 6);
    // Already kept it — you've seen it; let others through.
    if (post.saved) s -= 10;
  }
  if (post.type !== 'pick' && post.handle && ctx.affinity) {
    s += Math.min(20, (ctx.affinity.get(post.handle) ?? 0) * 4);
  }
  return s;
}
