import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { getProfile } from '../services/profile.service';
import { loadMe } from './auth.controller';
import { briefFor } from './brief.controller';
import { pushStatusFor } from './push.controller';
import { billingSummaryFor } from './billing.controller';

// The app's first call after launch: everything the home screen needs in
// one round trip. Each section is what its own endpoint returns (/auth/me,
// /profile, /brief, /notifications/unread, /push/status, /billing/summary),
// and each stands alone: one failing (the weather, the gateway) comes back
// null instead of taking the screen down with it.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const bootstrapSchema = z.object({
  // The person's own date, since the server's clock is not theirs.
  date: z.string().regex(DATE_RE).optional(),
});

async function section<T>(name: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    console.error(`bootstrap ${name} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export function clientConfig() {
  return {
    minSupportedClient: env.MIN_SUPPORTED_CLIENT,
    googleClientIds: env.GOOGLE_CLIENT_IDS,
    appleBundleIds: env.APPLE_BUNDLE_IDS,
  };
}

// GET /bootstrap?date=YYYY-MM-DD
export async function bootstrap(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { date } = bootstrapSchema.parse(req.query);
  const userId = req.user.id;
  const [user, profile, brief, unread, push, plan] = await Promise.all([
    section('user', () => loadMe(userId)),
    section('profile', () => getProfile(userId)),
    section('brief', () => briefFor(userId, { date: date ?? today() })),
    section('unread', () => prisma.notification.count({ where: { userId, readAt: null } })),
    section('push', () => pushStatusFor(userId)),
    section('plan', () => billingSummaryFor(userId)),
  ]);
  res.json({ user, profile, brief, unread, push, plan, config: clientConfig() });
}
