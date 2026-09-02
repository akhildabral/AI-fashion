import { prisma } from './prisma';

// Who a viewer must not see, and who must not see them. A block hides both
// ways; a mute hides one way until it lapses. Every feed, rail, search and
// profile goes through here so the rule lives in one place.

/** Ids hidden from this viewer: people they blocked, people who blocked them, people they muted (still active). */
export async function hiddenIds(viewerId: string): Promise<Set<string>> {
  const now = new Date();
  const [blocks, mutes] = await Promise.all([
    prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.mute.findMany({
      where: { muterId: viewerId, OR: [{ until: null }, { until: { gt: now } }] },
      select: { mutedId: true },
    }),
  ]);
  const out = new Set<string>();
  for (const b of blocks) out.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
  for (const m of mutes) out.add(m.mutedId);
  return out;
}

/** True when either of the two has blocked the other. */
export async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const row = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true },
  });
  return !!row;
}

/** Filter a list of rows by an author field, dropping hidden people. */
export function dropHidden<T>(rows: T[], hidden: Set<string>, authorOf: (row: T) => string): T[] {
  if (hidden.size === 0) return rows;
  return rows.filter((r) => !hidden.has(authorOf(r)));
}
