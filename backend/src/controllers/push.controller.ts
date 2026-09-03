import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { env } from '../config/env';
import { expoEndpoint, expoPushEnabled, isExpoPushToken, pushEnabled, sendPush, webPushEnabled } from '../lib/push';

// The morning ritual: a device asks to be woken at its own hour. Browsers
// bring a web-push subscription; the apps bring an Expo push token.

export function pushKey(_req: Request, res: Response) {
  res.json({ enabled: pushEnabled, publicKey: pushEnabled ? env.VAPID_PUBLIC_KEY : null });
}

const webSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  timezone: z.string().min(1).max(64).default('UTC'),
  hour: z.number().int().min(4).max(12).default(7),
});

const expoSubscribeSchema = z.object({
  expoToken: z.string().min(1).max(200).refine(isExpoPushToken, 'Not an Expo push token'),
  platform: z.enum(['ios', 'android']),
  timezone: z.string().min(1).max(64).default('UTC'),
  hour: z.number().int().min(4).max(12).default(7),
});

function serialize(sub: { id: string; platform: string; hour: number; timezone: string; eventsCircle: boolean; eventsRenders: boolean }) {
  return { id: sub.id, platform: sub.platform, hour: sub.hour, timezone: sub.timezone, events: { circle: sub.eventsCircle, renders: sub.eventsRenders } };
}

export async function subscribePush(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const body = (req.body ?? {}) as Record<string, unknown>;

  if ('expoToken' in body) {
    if (!expoPushEnabled) throw new HttpError(503, 'Push is not configured');
    const { expoToken, platform, timezone, hour } = expoSubscribeSchema.parse(body);
    const endpoint = expoEndpoint(expoToken);
    // A device belongs to one account: a token already registered to someone
    // else is never re-bound. (Signing out and in on the same phone is the
    // same account, and just refreshes the row.)
    const owned = await prisma.pushSubscription.findUnique({ where: { expoToken }, select: { userId: true } });
    if (owned && owned.userId !== req.user.id) throw new HttpError(409, 'That device is already registered to another account');
    const sub = await prisma.pushSubscription.upsert({
      where: { expoToken },
      create: { userId: req.user.id, platform, endpoint, expoToken, timezone, hour },
      update: { userId: req.user.id, platform, endpoint, timezone, hour },
    });
    res.status(201).json(serialize(sub));
    return;
  }

  if (!webPushEnabled) throw new HttpError(503, 'Push is not configured');
  const { subscription, timezone, hour } = webSubscribeSchema.parse(body);
  // A push endpoint belongs to one account. Don't let a caller re-bind
  // someone else's endpoint to themselves (or hijack their briefs).
  const owned = await prisma.pushSubscription.findUnique({ where: { endpoint: subscription.endpoint }, select: { userId: true } });
  if (owned && owned.userId !== req.user.id) throw new HttpError(409, 'That device is already registered to another account');
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { userId: req.user.id, platform: 'web', endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, timezone, hour },
    update: { userId: req.user.id, platform: 'web', p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, timezone, hour },
  });
  res.status(201).json({ id: sub.id, hour: sub.hour, timezone: sub.timezone });
}

const settingsSchema = z.object({
  hour: z.number().int().min(4).max(12).optional(),
  eveningPush: z.boolean().optional(),
  events: z.object({ circle: z.boolean().optional(), renders: z.boolean().optional() }).optional(),
});

/** Change the hour (and the rest) for every device this person has. */
export async function updatePushSettings(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { hour, eveningPush, events } = settingsSchema.parse(req.body);
  await prisma.pushSubscription.updateMany({
    where: { userId: req.user.id },
    data: {
      ...(hour !== undefined ? { hour } : {}),
      ...(eveningPush !== undefined ? { eveningPush } : {}),
      ...(events?.circle !== undefined ? { eventsCircle: events.circle } : {}),
      ...(events?.renders !== undefined ? { eventsRenders: events.renders } : {}),
    },
  });
  res.json({ hour, eveningPush, ...(events ? { events } : {}) });
}

// One device, named either way: the browser's endpoint or the app's token.
const deviceSchema = z.union([
  z.object({ endpoint: z.string().url().max(2000) }),
  z.object({ expoToken: z.string().min(1).max(200) }),
]);

function deviceWhere(userId: string, device: z.infer<typeof deviceSchema>) {
  return 'endpoint' in device ? { userId, endpoint: device.endpoint } : { userId, expoToken: device.expoToken };
}

export async function unsubscribePush(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const device = deviceSchema.parse(req.body);
  await prisma.pushSubscription.deleteMany({ where: deviceWhere(req.user.id, device) });
  res.status(204).send();
}

/** The person's push picture, as GET /push/status returns it. */
export async function pushStatusFor(userId: string) {
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { platform: true, endpoint: true, expoToken: true, hour: true, timezone: true, eveningPush: true, eventsCircle: true, eventsRenders: true },
  });
  return {
    // `enabled` is the web contract: VAPID configured. The apps read `native`.
    enabled: pushEnabled,
    native: expoPushEnabled,
    devices: subs.length,
    hour: subs[0]?.hour ?? 7,
    timezone: subs[0]?.timezone ?? null,
    eveningPush: subs.some((s) => s.eveningPush),
    events: { circle: subs.length === 0 || subs.some((s) => s.eventsCircle), renders: subs.length === 0 || subs.some((s) => s.eventsRenders) },
    endpoints: subs.map((s) => s.endpoint),
    subscriptions: subs.map((s) => ({ platform: s.platform, endpoint: s.endpoint, expoToken: s.expoToken })),
  };
}

export async function pushStatus(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  res.json(await pushStatusFor(req.user.id));
}

/** POST /push/test — send this device a test nudge right now. */
export async function pushTest(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const device = deviceSchema.parse(req.body);
  const sub = await prisma.pushSubscription.findFirst({ where: deviceWhere(req.user.id, device) });
  if (!sub) throw new HttpError(404, 'This device is not subscribed');
  const ok = await sendPush(sub, { title: 'This is how mornings will feel.', body: 'Your look will be waiting here, composed from what you own.', url: '/', route: '/today', tag: 'ritual-test' });
  res.json({ sent: ok });
}
