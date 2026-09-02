import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { env } from '../config/env';
import { pushEnabled, sendPush } from '../lib/push';

// The morning ritual: a browser asks to be woken at its own hour.

export function pushKey(_req: Request, res: Response) {
  res.json({ enabled: pushEnabled, publicKey: pushEnabled ? env.VAPID_PUBLIC_KEY : null });
}

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  timezone: z.string().min(1).max(64).default('UTC'),
  hour: z.number().int().min(4).max(12).default(7),
});

export async function subscribePush(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  if (!pushEnabled) throw new HttpError(503, 'Push is not configured');
  const { subscription, timezone, hour } = subscribeSchema.parse(req.body);
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { userId: req.user.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, timezone, hour },
    update: { userId: req.user.id, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, timezone, hour },
  });
  res.status(201).json({ id: sub.id, hour: sub.hour, timezone: sub.timezone });
}

const settingsSchema = z.object({ hour: z.number().int().min(4).max(12).optional(), eveningPush: z.boolean().optional() });

/** Change the hour for every device this person has. */
export async function updatePushSettings(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { hour, eveningPush } = settingsSchema.parse(req.body);
  await prisma.pushSubscription.updateMany({ where: { userId: req.user.id }, data: { ...(hour !== undefined ? { hour } : {}), ...(eveningPush !== undefined ? { eveningPush } : {}) } });
  res.json({ hour, eveningPush });
}

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });

export async function unsubscribePush(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { endpoint } = unsubscribeSchema.parse(req.body);
  await prisma.pushSubscription.deleteMany({ where: { userId: req.user.id, endpoint } });
  res.status(204).send();
}

export async function pushStatus(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const subs = await prisma.pushSubscription.findMany({ where: { userId: req.user.id }, select: { endpoint: true, hour: true, timezone: true, eveningPush: true } });
  res.json({ enabled: pushEnabled, devices: subs.length, hour: subs[0]?.hour ?? 7, timezone: subs[0]?.timezone ?? null, eveningPush: subs.some((s) => s.eveningPush), endpoints: subs.map((s) => s.endpoint) });
}

/** POST /push/test — send this device a test nudge right now. */
export async function pushTest(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { endpoint } = unsubscribeSchema.parse(req.body);
  const sub = await prisma.pushSubscription.findFirst({ where: { userId: req.user.id, endpoint } });
  if (!sub) throw new HttpError(404, 'This device is not subscribed');
  const ok = await sendPush(sub, { title: 'This is how mornings will feel.', body: 'Your look will be waiting here, composed from what you own.', url: '/', tag: 'ritual-test' });
  res.json({ sent: ok });
}
