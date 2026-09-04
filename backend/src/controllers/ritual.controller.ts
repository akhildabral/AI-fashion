import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { closetGapsFor } from '../services/pairing.service';

// The "earned, not gamified" numbers. Everything here derives from the wear
// log and item prices — nothing is a point, everything is a fact.

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function ritualStats(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const userId = req.user.id;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const quarterAgo = new Date(now.getTime() - 90 * 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [logs, items] = await Promise.all([
    prisma.wearLog.findMany({
      where: { userId },
      select: { itemIds: true, wornOn: true },
      orderBy: { wornOn: 'desc' },
      take: 1000,
    }),
    prisma.wardrobeItem.findMany({
      where: { userId, suppressed: false },
      select: { id: true, price: true, subtype: true, category: true, description: true },
    }),
  ]);

  // Total wears per item (all time) — cost-per-wear denominators.
  const wearsByItem = new Map<string, number>();
  for (const log of logs) {
    for (const id of log.itemIds) wearsByItem.set(id, (wearsByItem.get(id) ?? 0) + 1);
  }
  const priceById = new Map(items.map((i) => [i.id, i.price ?? null]));

  // Streak: consecutive days with at least one wear, ending today or yesterday.
  const daysWithWear = new Set(logs.map((l) => dayKey(l.wornOn)));
  let streak = 0;
  const cursor = new Date(now);
  if (!daysWithWear.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daysWithWear.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Monthly payback: each wear this month "earns back" the item's current
  // per-wear value (price / total wears). Honest, simple, monotonic.
  let monthlyPayback = 0;
  for (const log of logs) {
    if (log.wornOn < monthStart) continue;
    for (const id of log.itemIds) {
      const price = priceById.get(id);
      const wears = wearsByItem.get(id) ?? 1;
      if (price && wears > 0) monthlyPayback += price / wears;
    }
  }

  // Rotation: share of the active closet worn in the last 90 days.
  const wornRecently = new Set(
    logs.filter((l) => l.wornOn >= quarterAgo).flatMap((l) => l.itemIds),
  );
  const activeCount = items.length;
  const rotationPct =
    activeCount === 0 ? 0 : Math.round((wornRecently.size / activeCount) * 100);

  // Price breaks: items whose cost-per-wear crossed under a round threshold
  // because of a wear in the last 7 days.
  const THRESHOLDS = [1000, 500, 250, 100, 50, 25];
  const recentWears = new Map<string, number>();
  for (const log of logs) {
    if (log.wornOn < weekAgo) continue;
    for (const id of log.itemIds) recentWears.set(id, (recentWears.get(id) ?? 0) + 1);
  }
  const priceBreaks: { itemId: string; label: string; cpw: number; threshold: number }[] = [];
  for (const [id, recent] of recentWears) {
    const price = priceById.get(id);
    const total = wearsByItem.get(id) ?? 0;
    if (!price || total <= recent) continue;
    const nowCpw = price / total;
    const beforeCpw = price / (total - recent);
    const crossed = THRESHOLDS.find((t) => beforeCpw > t && nowCpw <= t);
    if (crossed) {
      const item = items.find((i) => i.id === id);
      priceBreaks.push({
        itemId: id,
        label: item?.subtype ?? item?.category ?? 'item',
        cpw: Math.round(nowCpw),
        threshold: crossed,
      });
    }
  }

  res.json({
    streak,
    wearsLogged: logs.length,
    monthlyPayback: Math.round(monthlyPayback),
    rotationPct,
    activeItems: activeCount,
    wornThisQuarter: wornRecently.size,
    priceBreaks: priceBreaks.slice(0, 3),
    outfitsThisWeek: logs.filter((l) => l.wornOn >= weekAgo).length,
  });
}

// Gap-filler: which single purchase unlocks the most new outfits? A ghost
// piece per slot × colour × formality band is dropped into the real closet
// and the outfits it would join are enumerated and validated — so the answer
// depends on what's actually hanging there, not on category counts.
export async function closetGaps(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const closet = await prisma.wardrobeItem.findMany({
    where: {
      userId: req.user.id,
      owned: true,
      suppressed: false,
      status: 'ready',
      state: 'clean',
      twinOfId: null,
      category: { not: 'other' },
    },
  });
  const { suggestions, outfitsPossible } = closetGapsFor(closet);
  res.json({ suggestions, outfitsPossible });
}
