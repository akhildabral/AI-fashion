import webpush from 'web-push';
import { Expo } from 'expo-server-sdk';
import type { ExpoPushMessage, ExpoPushReceiptId, ExpoPushTicket } from 'expo-server-sdk';
import { env } from '../config/env';
import { prisma } from './prisma';

// Push, two ways. Browsers get web push and need VAPID keys; without them
// every web send is a no-op and the web UI hides the toggle. The apps get
// Expo push, which needs no keys at all. Every payload carries an in-app
// `route` (the app deep-links to it) next to the legacy web `url`.

export const webPushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
/** Kept for the web client's contract: "push is configured" means web push. */
export const pushEnabled = webPushEnabled;
export const expoPushEnabled = true;
if (webPushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

const expo = new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {});

export type PushPlatform = 'web' | 'ios' | 'android';

export interface PushPayload {
  title: string;
  body: string;
  /** Web: where the notification click opens. */
  url?: string;
  /** App: the in-app path to open (/today, /mirror/render/:id, /circle/post/:type/:id, /circle/notifications). */
  route?: string;
  tag?: string;
}

export interface PushTarget {
  id: string;
  platform: string;
  endpoint: string;
  expoToken?: string | null;
  p256dh?: string | null;
  auth?: string | null;
}

export function isExpoPushToken(token: unknown): token is string {
  return Expo.isExpoPushToken(token);
}

/** The endpoint an Expo row is stored under, so the unique key holds. */
export function expoEndpoint(expoToken: string): string {
  return `expo:${expoToken}`;
}

export function toExpoMessage(to: string, payload: PushPayload): ExpoPushMessage {
  // Android channels: the daily ritual and everything else, so a person can
  // quiet one without the other.
  const channelId = payload.tag && /^(ritual|layout)/.test(payload.tag) ? 'ritual' : 'events';
  return {
    to,
    title: payload.title,
    body: payload.body,
    sound: 'default',
    priority: 'high',
    channelId,
    data: { route: payload.route ?? '/today', url: payload.url ?? '/', tag: payload.tag ?? null },
  };
}

async function dropSubscription(id: string) {
  await prisma.pushSubscription.delete({ where: { id } }).catch(() => undefined);
}

async function dropByExpoToken(token: string) {
  await prisma.pushSubscription.deleteMany({ where: { expoToken: token } }).catch(() => undefined);
}

async function sendWebPush(sub: PushTarget, payload: PushPayload): Promise<boolean> {
  if (!webPushEnabled) return false;
  if (!sub.p256dh || !sub.auth) return false;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 6 * 3600 },
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await dropSubscription(sub.id);
    } else {
      console.error('push failed:', err instanceof Error ? err.message : err);
    }
    return false;
  }
}

// Expo answers a send with tickets (accepted or not) and, a little later,
// receipts (delivered or not). A DeviceNotRegistered in either means the app
// was uninstalled or the token rotated: the row goes.
const RECEIPT_DELAY_MS = 15 * 60_000;

/** Which tokens to drop from a batch of tickets (paired with their messages). */
export function deadTokensFromTickets(messages: ExpoPushMessage[], tickets: ExpoPushTicket[]): string[] {
  const dead: string[] = [];
  tickets.forEach((t, i) => {
    if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
      const to = t.details.expoPushToken ?? messages[i]?.to;
      if (typeof to === 'string') dead.push(to);
    }
  });
  return dead;
}

export async function checkExpoReceipts(receiptIds: ExpoPushReceiptId[]): Promise<string[]> {
  const dead: string[] = [];
  for (const chunk of expo.chunkPushNotificationReceiptIds(receiptIds)) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const r of Object.values(receipts)) {
        if (r.status === 'error') {
          if (r.details?.error === 'DeviceNotRegistered' && r.details.expoPushToken) dead.push(r.details.expoPushToken);
          else console.error('expo push receipt error:', r.message);
        }
      }
    } catch (err) {
      console.error('expo receipts failed:', err instanceof Error ? err.message : err);
    }
  }
  for (const token of dead) await dropByExpoToken(token);
  return dead;
}

function scheduleReceiptCheck(receiptIds: ExpoPushReceiptId[]) {
  if (receiptIds.length === 0) return;
  const t = setTimeout(() => {
    checkExpoReceipts(receiptIds).catch(() => undefined);
  }, RECEIPT_DELAY_MS);
  t.unref();
}

/** Send one payload to many Expo devices; returns how many were accepted. */
export async function sendExpoPush(subs: PushTarget[], payload: PushPayload): Promise<number> {
  const messages = subs
    .map((s) => s.expoToken)
    .filter((t): t is string => typeof t === 'string' && Expo.isExpoPushToken(t))
    .map((to) => toExpoMessage(to, payload));
  if (messages.length === 0) return 0;
  let accepted = 0;
  const receiptIds: ExpoPushReceiptId[] = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    let tickets: ExpoPushTicket[];
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('expo push failed:', err instanceof Error ? err.message : err);
      continue;
    }
    for (const token of deadTokensFromTickets(chunk, tickets)) await dropByExpoToken(token);
    for (const t of tickets) {
      if (t.status === 'ok') {
        accepted++;
        receiptIds.push(t.id);
      } else if (t.details?.error !== 'DeviceNotRegistered') {
        console.error('expo push ticket error:', t.message);
      }
    }
  }
  scheduleReceiptCheck(receiptIds);
  return accepted;
}

/** Send to one subscription, whichever kind; a dead device is removed. */
export async function sendPush(sub: PushTarget, payload: PushPayload): Promise<boolean> {
  if (sub.platform === 'web' || !sub.platform) return sendWebPush(sub, payload);
  return (await sendExpoPush([sub], payload)) > 0;
}

/**
 * An event push, to the apps only: circle activity and finished renders are
 * not worth waking a browser tab for. Each device opts out per kind.
 */
export async function sendNativeEvent(
  userId: string,
  kind: 'circle' | 'renders',
  payload: PushPayload,
): Promise<number> {
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId, platform: { not: 'web' }, ...(kind === 'circle' ? { eventsCircle: true } : { eventsRenders: true }) },
      take: 10,
    });
    if (subs.length === 0) return 0;
    return await sendExpoPush(subs, payload);
  } catch (err) {
    console.error('event push failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Local date (YYYY-MM-DD) and hour in a person's zone. */
export function localNow(timezone: string, at = new Date()): { date: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
  } catch {
    return { date: at.toISOString().slice(0, 10), hour: at.getUTCHours() };
  }
}
