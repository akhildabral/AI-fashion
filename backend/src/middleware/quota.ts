import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { HttpError } from './error';
import {
  checkGenerationQuota,
  planLimits,
  type MeteredKind,
} from '../services/entitlements.service';

const LABELS: Record<MeteredKind, string> = {
  tryon: 'try-ons',
  looks: 'generated looks',
  catalog: 'wardrobe scans',
};

/**
 * Plan-based cap on AI-powered endpoints. Free is a one-time trial
 * allowance; paid plans refill on a rolling 30-day window. Admins are
 * exempt. The attempt is recorded up front so retries and failures count —
 * every call costs real money whether or not the user likes the result.
 */
export function quota(kind: MeteredKind) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) throw new HttpError(401, 'Authentication required');

      // Reserve the usage first, then verify against a window that already
      // counts this reservation — so a burst of concurrent requests can't all
      // slip past a stale count and run up real AI cost. Over the limit, the
      // reservation is rolled back.
      const event = await prisma.usageEvent.create({ data: { userId: user.id, kind } });
      if (user.role !== 'admin') {
        const { used, limit } = await checkGenerationQuota(user.id, user.plan, kind);
        if (used > limit) {
          await prisma.usageEvent.delete({ where: { id: event.id } }).catch(() => undefined);
          const limits = planLimits(user.plan);
          throw new HttpError(
            429,
            limits.lifetime
              ? `You've used all ${limit} free ${LABELS[kind]} — upgrade to keep going`
              : `You've reached your ${limits.label} plan's ${limit} ${LABELS[kind]} for this month — upgrade or try again later`,
          );
        }
      }
      req.usageEventId = event.id;
      next();
    } catch (err) {
      next(err);
    }
  };
}
