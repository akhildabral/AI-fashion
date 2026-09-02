import { prisma } from '../lib/prisma';
import { displayName, type PersonRow } from '../lib/people';

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
  name: string;
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
  photoUrl: string | null;
}

export interface ReactionSummary {
  counts: Record<string, number>;
  total: number;
  sample: string[];
  mine: ReactionKind | null;
}

export type PostTarget = 'look' | 'verdict' | 'pick';

export interface VerdictPost {
  type: 'verdict';
  id: string; // pollId
  at: string;
  handle: string | null;
  name: string;
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
  reactions: ReactionSummary;
}

export interface PickPost {
  type: 'pick';
  id: string; // pickId
  at: string;
  handle: string | null; // who styled you
  name: string;
  note: string | null;
  items: PostItem[];
  reactions: ReactionSummary;
  comments: number;
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

/** Reaction summaries per post id, for one kind of post, from the viewer's side. */
export async function reactionSummaries(targetType: PostTarget, ids: string[], viewerId: string): Promise<Map<string, ReactionSummary>> {
  const out = new Map<string, ReactionSummary>();
  if (ids.length === 0) return out;
  const rows = await prisma.reaction.findMany({
    where: { targetType, targetId: { in: ids } },
    select: { targetId: true, userId: true, kind: true, user: { select: { handle: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const by = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = by.get(r.targetId) ?? [];
    list.push(r);
    by.set(r.targetId, list);
  }
  for (const id of ids) {
    const rs = by.get(id) ?? [];
    const counts: Record<string, number> = {};
    for (const r of rs) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    const mine = rs.find((r) => r.userId === viewerId)?.kind ?? null;
    out.set(id, {
      counts,
      total: rs.length,
      sample: rs.filter((r) => r.userId !== viewerId).slice(0, 3).map((r) => displayName(r.user)),
      mine: (REACTION_KINDS as readonly string[]).includes(mine ?? '') ? (mine as ReactionKind) : null,
    });
  }
  return out;
}

export const EMPTY_REACTIONS: ReactionSummary = { counts: {}, total: 0, sample: [], mine: null };

/** Comment counts per target id, for one target type. */
export async function commentCounts(targetType: PostTarget, ids: string[]): Promise<Map<string, number>> {
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
  photoUrl: string | null;
  user: PersonRow;
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
    reactionSummaries('look', ids, viewerId),
    commentCounts('look', ids),
    prisma.savedLook.findMany({ where: { userId: viewerId, wearLogId: { in: ids } }, select: { wearLogId: true } }),
    prisma.savedLook.groupBy({ by: ['wearLogId'], where: { wearLogId: { in: ids } }, _count: { _all: true } }),
  ]);
  const savedSet = new Set(saved.map((s) => s.wearLogId));
  const savesBy = new Map(saveCounts.map((s) => [s.wearLogId, s._count._all]));
  return logs.map((l) => {
    return {
      type: 'look',
      id: l.id,
      at: (l.sharedAt ?? l.wornOn).toISOString(),
      handle: l.user.handle,
      name: displayName(l.user),
      isMine: l.userId === viewerId,
      isFriend: friendIds.has(l.userId),
      eventType: l.eventType,
      featured: Boolean(l.featuredAt),
      items: l.itemIds.map((id) => byId.get(id)).filter((i): i is PostItem => Boolean(i)),
      reactions: reactions.get(l.id) ?? EMPTY_REACTIONS,
      comments: comments.get(l.id) ?? 0,
      saved: savedSet.has(l.id),
      saves: savesBy.get(l.id) ?? 0,
      recreates: l.recreatedCount,
      photoUrl: l.photoUrl,
    };
  });
}

// Earned standing — verified by what actually happened, never purchasable.
export async function standingFor(userId: string) {
  const [picksWorn, recreated, looksShared, wouldWear] = await Promise.all([
    prisma.notification.count({ where: { userId, type: 'pick_worn' } }),
    prisma.wearLog.aggregate({ where: { userId }, _sum: { recreatedCount: true } }).then((r) => r._sum.recreatedCount ?? 0),
    prisma.wearLog.count({ where: { userId, sharedAt: { not: null } } }),
    prisma.wearLog
      .findMany({ where: { userId, sharedAt: { not: null } }, select: { id: true } })
      .then((logs) => (logs.length ? prisma.reaction.count({ where: { targetType: 'look', kind: 'would_wear', targetId: { in: logs.map((l) => l.id) } } }) : 0)),
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
    prisma.reaction.findMany({ where: { userId: viewerId, createdAt: { gte: since } }, select: { targetType: true, targetId: true } }),
    prisma.comment.findMany({ where: { userId: viewerId, createdAt: { gte: since } }, select: { targetType: true, targetId: true } }),
    prisma.savedLook.findMany({
      where: { userId: viewerId, createdAt: { gte: since } },
      select: { wearLog: { select: { user: { select: { handle: true, firstName: true, lastName: true } } } } },
    }),
    prisma.notification.findMany({
      where: { actorId: viewerId, type: 'look_recreated', createdAt: { gte: since } },
      select: { user: { select: { handle: true, firstName: true, lastName: true } } },
    }),
  ]);
  const m = new Map<string, number>();
  const add = (h: string | null | undefined, w: number) => {
    if (h) m.set(h, (m.get(h) ?? 0) + w);
  };
  for (const s of saves) add(s.wearLog.user.handle, 2);
  for (const r of recreates) add(r.user.handle, 3);
  // Reactions and notes: resolve who owns each post, then credit them.
  const touched = [...reactions.map((r) => ({ ...r, w: 1 })), ...comments.map((c) => ({ ...c, w: 2 }))];
  if (touched.length > 0) {
    const ids = (t: string) => touched.filter((x) => x.targetType === t).map((x) => x.targetId);
    const [logs, polls, picks] = await Promise.all([
      ids('look').length ? prisma.wearLog.findMany({ where: { id: { in: ids('look') } }, select: { id: true, user: { select: { handle: true, firstName: true, lastName: true } } } }) : [],
      ids('verdict').length ? prisma.poll.findMany({ where: { id: { in: ids('verdict') } }, select: { id: true, user: { select: { handle: true, firstName: true, lastName: true } } } }) : [],
      ids('pick').length ? prisma.friendPick.findMany({ where: { id: { in: ids('pick') } }, select: { id: true, byUser: { select: { handle: true, firstName: true, lastName: true } } } }) : [],
    ]);
    const owner = new Map<string, string | null>([
      ...logs.map((l) => [l.id, l.user.handle] as const),
      ...polls.map((p) => [p.id, p.user.handle] as const),
      ...picks.map((p) => [p.id, p.byUser.handle] as const),
    ]);
    for (const t of touched) add(owner.get(t.targetId), t.w);
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
    s += Math.min(8, (post.reactions?.total ?? 0) * 2);
  }
  if (post.type === 'pick') s += Math.min(6, (post.comments ?? 0) * 3);
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
