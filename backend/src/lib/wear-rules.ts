import { prisma } from './prisma';
import { notify } from './notify';

// The basket, as a rule rather than a chore. Every logged wear counts against
// a garment's tolerance; past it the piece flips to in-wash and leaves the
// stylist's pool until it comes back. Shoes, bags and jewellery never wash.

const NEVER = new Set(['footwear', 'accessory', 'other']);

/** Wears a piece takes before it needs a wash. 0 = never tracked. */
export function washTolerance(item: { category: string; subtype: string | null }): number {
  const c = (item.category ?? '').toLowerCase();
  const s = (item.subtype ?? '').toLowerCase();
  if (NEVER.has(c) || /bag|belt|hat|cap|scarf|sunglass|jewel|watch/.test(s)) return 0;
  if (/coat|trench|parka|blazer|jacket|overshirt/.test(s) || c === 'outerwear') return 8;
  if (/jean|denim/.test(s)) return 5;
  if (/sweater|jumper|knit|cardigan|hoodie|sweatshirt/.test(s)) return 3;
  if (/trouser|pant|chino|skirt|short/.test(s) || c === 'bottom') return 3;
  // Anything worn against the skin: shirts, tees, tanks, dresses, activewear.
  return 1;
}

/** How many in-wash pieces make a load worth the trip. */
export const LOAD_WORTH = 4;

/**
 * Count the wears and flip what's past tolerance. Called after every wear
 * log. Returns the ids that just went into the wash.
 */
export async function applyWear(userId: string, itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const items = await prisma.wardrobeItem.findMany({
    where: { id: { in: itemIds }, userId },
    select: { id: true, category: true, subtype: true, state: true, wearsSinceWash: true },
  });
  const flipped: string[] = [];
  await Promise.all(
    items.map(async (it) => {
      const tol = washTolerance(it);
      if (tol === 0) return;
      const wears = it.wearsSinceWash + 1;
      const dirty = it.state === 'clean' && wears >= tol;
      if (dirty) flipped.push(it.id);
      await prisma.wardrobeItem.update({
        where: { id: it.id },
        data: { wearsSinceWash: wears, ...(dirty ? { state: 'in-wash' } : {}) },
      });
    }),
  );
  void laundryCheck(userId);
  return flipped;
}

/** Mark pieces clean (all in-wash when no ids given). Returns the count. */
export async function markClean(userId: string, itemIds?: string[]): Promise<number> {
  const r = await prisma.wardrobeItem.updateMany({
    where: { userId, ...(itemIds ? { id: { in: itemIds } } : { state: 'in-wash' }) },
    data: { state: 'clean', wearsSinceWash: 0, washedAt: new Date() },
  });
  return r.count;
}

/** Once the basket is worth a load, say so — at most every three days. */
export async function laundryCheck(userId: string): Promise<void> {
  const n = await prisma.wardrobeItem.count({ where: { userId, owned: true, state: 'in-wash' } });
  if (n < LOAD_WORTH) return;
  const day = Math.floor(Date.now() / (3 * 86_400_000));
  await notify(userId, 'laundry_due', null, { count: n }, { dedupeKey: `laundry:${day}` });
}
