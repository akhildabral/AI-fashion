import webpush from 'web-push';
import { env } from '../config/env';
import { prisma } from './prisma';

// Web push for the morning ritual. Configured only when VAPID keys exist;
// without them every send is a no-op and the UI hides the toggle.

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Send to one subscription; a dead endpoint (gone/expired) is removed. */
export async function sendPush(sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<boolean> {
  if (!pushEnabled) return false;
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
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    } else {
      console.error('push failed:', err instanceof Error ? err.message : err);
    }
    return false;
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
