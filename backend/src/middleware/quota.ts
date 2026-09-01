import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { HttpError } from './error';

export type UsageKind = 'tryon' | 'looks' | 'catalog';

const LIMITS: Record<UsageKind, () => number> = {
  tryon: () => env.QUOTA_TRYONS_PER_DAY,
  looks: () => env.QUOTA_LOOKS_PER_DAY,
  catalog: () => env.QUOTA_CATALOG_PER_DAY,
};

const LABELS: Record<UsageKind, string> = {
  tryon: 'try-ons',
  looks: 'generated looks',
  catalog: 'wardrobe scans',
};

/**
 * Per-user daily cap on AI-powered endpoints (rolling 24h window).
 * Every generation call costs real money, so approved users get a
 * daily allowance; admins are exempt. A limit of 0 disables the cap.
 * The attempt is recorded up front so retries and failures still count.
 */
export function quota(kind: UsageKind) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) throw new HttpError(401, 'Authentication required');

      const limit = LIMITS[kind]();
      if (limit > 0 && user.role !== 'admin') {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const used = await prisma.usageEvent.count({
          where: { userId: user.id, kind, createdAt: { gte: since } },
        });
        if (used >= limit) {
          throw new HttpError(
            429,
            `Daily limit reached (${limit} ${LABELS[kind]} per day) — try again tomorrow`,
          );
        }
      }

      await prisma.usageEvent.create({ data: { userId: user.id, kind } });
      next();
    } catch (err) {
      next(err);
    }
  };
}
