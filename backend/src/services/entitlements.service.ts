import { prisma } from '../lib/prisma';

export type Plan = 'free' | 'plus' | 'pro' | 'founder';
export type MeteredKind = 'tryon' | 'looks' | 'catalog';

export interface PlanLimits {
  /** Max wardrobe items (unsuppressed) the account can hold. */
  items: number;
  /** AI generations per period, by kind. */
  looks: number;
  tryons: number;
  catalog: number;
  /**
   * Free is a one-time trial allowance: usage counts for the account's
   * lifetime. Paid plans refill on a rolling 30-day window.
   */
  lifetime: boolean;
  label: string;
}

// The single source of truth for what each tier allows. `catalog` is higher
// than `items` on paid plans so recataloging/replacing items isn't starved.
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { items: 15, looks: 10, tryons: 5, catalog: 20, lifetime: true, label: 'Free' },
  plus: { items: 100, looks: 30, tryons: 30, catalog: 120, lifetime: false, label: 'Plus' },
  pro: { items: 500, looks: 100, tryons: 100, catalog: 600, lifetime: false, label: 'Pro' },
  // Waitlist cohort grandfathered before billing existed: Pro-level, free.
  founder: { items: 500, looks: 100, tryons: 100, catalog: 600, lifetime: false, label: 'Founder' },
};

export function planLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[(plan as Plan) in PLAN_LIMITS ? (plan as Plan) : 'free'];
}

const KIND_TO_LIMIT: Record<MeteredKind, keyof Pick<PlanLimits, 'looks' | 'tryons' | 'catalog'>> = {
  looks: 'looks',
  tryon: 'tryons',
  catalog: 'catalog',
};

export function usageWindowStart(limits: PlanLimits): Date | undefined {
  return limits.lifetime ? undefined : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

/** How many `kind` generations the user has used in the current window. */
export async function usedInWindow(userId: string, kind: MeteredKind, limits: PlanLimits) {
  const since = usageWindowStart(limits);
  return prisma.usageEvent.count({
    where: { userId, kind, ...(since ? { createdAt: { gte: since } } : {}) },
  });
}

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

export async function checkGenerationQuota(
  userId: string,
  plan: string,
  kind: MeteredKind,
): Promise<QuotaCheck> {
  const limits = planLimits(plan);
  const limit = limits[KIND_TO_LIMIT[kind]];
  const used = await usedInWindow(userId, kind, limits);
  return { allowed: used < limit, used, limit };
}

export async function checkItemCapacity(userId: string, plan: string): Promise<QuotaCheck> {
  const limits = planLimits(plan);
  const used = await prisma.wardrobeItem.count({ where: { userId, owned: true, suppressed: false } });
  return { allowed: used < limits.items, used, limit: limits.items };
}

/** Everything the billing page needs to render plan + usage meters. */
export async function usageSummary(userId: string, plan: string) {
  const limits = planLimits(plan);
  const [looks, tryons, catalog, items] = await Promise.all([
    usedInWindow(userId, 'looks', limits),
    usedInWindow(userId, 'tryon', limits),
    usedInWindow(userId, 'catalog', limits),
    prisma.wardrobeItem.count({ where: { userId, suppressed: false } }),
  ]);
  return {
    plan,
    label: limits.label,
    lifetime: limits.lifetime,
    usage: {
      looks: { used: looks, limit: limits.looks },
      tryons: { used: tryons, limit: limits.tryons },
      catalog: { used: catalog, limit: limits.catalog },
      items: { used: items, limit: limits.items },
    },
  };
}
