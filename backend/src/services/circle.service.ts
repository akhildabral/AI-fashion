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

type LogRow = {
  id: string;
  userId: string;
  itemIds: string[];
  wornOn: Date;
  sharedAt: Date | null;
  featuredAt: Date | null;
  eventType: string | null;
  user: { handle: string | null };
};

/** Shape shared wear logs into look posts, with reactions attached. */
export async function serializeLooks(
  logs: LogRow[],
  viewerId: string,
  friendIds: Set<string>,
): Promise<LookPost[]> {
  if (logs.length === 0) return [];
  const [byId, reactions] = await Promise.all([
    itemsById(logs.flatMap((l) => l.itemIds)),
    prisma.lookReaction.findMany({
      where: { wearLogId: { in: logs.map((l) => l.id) } },
      select: { wearLogId: true, userId: true, kind: true, user: { select: { handle: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
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
    };
  });
}

// Ranking for "For you": recency decays over a couple of days; things that
// need the viewer (an open verdict they haven't voted on, a pick made for
// them) jump ahead; friends and lively looks get a nudge.
export function score(post: CirclePost, now: number): number {
  const ageHours = Math.max(0, (now - new Date(post.at).getTime()) / 3_600_000);
  let s = 100 * Math.exp(-ageHours / 36);
  // A look someone made for you outranks anything fresh for about two days.
  if (post.type === 'pick') s += 90;
  if (post.type === 'verdict') {
    if (!post.settled && !post.isMine && !post.myVote) s += 45;
    else if (post.settled && post.isMine) s += 25;
    else if (!post.settled) s += 10;
  }
  if (post.type === 'look') {
    if (post.isFriend) s += 8;
    s += Math.min(20, post.reactions.total * 2);
    if (post.featured) s += 5;
  }
  return s;
}
