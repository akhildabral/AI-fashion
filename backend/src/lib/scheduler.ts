import { prisma } from './prisma';
import { sendWishlistNudges } from '../controllers/store.controller';
import { notify } from './notify';
import { expoPushEnabled, localNow, sendPush, webPushEnabled } from './push';
import { ensureDailyBrief } from '../controllers/brief.controller';
import { logger } from './logger';

// Small in-process scheduler for things that happen on a clock rather than
// on a request. One job for now: telling people a verdict has settled.

const SETTLE_EVERY_MS = 2 * 60_000;
// Polls that expired before this window get marked without a notification —
// a fresh deploy shouldn't wake everyone about last month.
const SETTLE_LOOKBACK_MS = 24 * 3_600_000;

export async function settleVerdicts(now = new Date()): Promise<number> {
  const due = await prisma.poll.findMany({
    where: { expiresAt: { lt: now }, settledNotifiedAt: null },
    include: { votes: { select: { optionId: true, voterKey: true } } },
    take: 100,
  });
  let notified = 0;
  for (const poll of due) {
    const stale = now.getTime() - poll.expiresAt.getTime() > SETTLE_LOOKBACK_MS;
    if (!stale) {
      const counts: Record<string, number> = {};
      for (const v of poll.votes) counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const winner = ranked[0]?.[0] ?? null;
      const tie = ranked.length > 1 && ranked[0][1] === ranked[1][1];
      const payload = { pollId: poll.id, winner: tie ? null : winner, counts, totalVotes: poll.votes.length, question: poll.question };
      await notify(poll.userId, 'verdict_settled', null, { ...payload, target: 'verdict', targetId: poll.id });
      // Signed-in voters hear how it went too.
      const voterIds = [...new Set(poll.votes.map((v) => v.voterKey).filter((k) => k.startsWith('user:')).map((k) => k.slice(5)))];
      for (const uid of voterIds) {
        if (uid !== poll.userId) await notify(uid, 'verdict_settled', poll.userId, { ...payload, target: 'verdict', targetId: poll.id });
      }
      notified++;
    }
    await prisma.poll.update({ where: { id: poll.id }, data: { settledNotifiedAt: now } });
  }
  return notified;
}

// The morning ritual: at each person's chosen hour in their own zone,
// compose today's brief (if it isn't already) and wake their devices with
// it. Runs every few minutes; each device is woken once per local day.
const RITUAL_EVERY_MS = 5 * 60_000;

// Every device row, a page at a time by id, so the ritual reaches everyone
// however many devices there are (a flat `take: 500` silently dropped the rest).
const SUBSCRIPTION_PAGE = 500;
export async function allPushSubscriptions() {
  const out: Awaited<ReturnType<typeof prisma.pushSubscription.findMany>> = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.pushSubscription.findMany({
      take: SUBSCRIPTION_PAGE,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    out.push(...page);
    if (page.length < SUBSCRIPTION_PAGE) return out;
    cursor = page[page.length - 1].id;
  }
}

export async function sendMorningBriefs(now = new Date()): Promise<number> {
  if (!webPushEnabled && !expoPushEnabled) return 0;
  const subs = await allPushSubscriptions();
  const due = subs.filter((s) => {
    const { date, hour } = localNow(s.timezone, now);
    return hour === s.hour && s.lastSentOn !== date;
  });
  let sent = 0;
  const byUser = new Map<string, typeof due>();
  for (const s of due) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  for (const [userId, devices] of byUser) {
    const { date } = localNow(devices[0].timezone, now);
    let payload: { title: string; body: string };
    try {
      const brief = await ensureDailyBrief(userId, date);
      if (brief?.rest) {
        // A home day: no look, no push. Mark the devices so we don't retry all morning.
        for (const d of devices) await prisma.pushSubscription.update({ where: { id: d.id }, data: { lastSentOn: date } }).catch(() => undefined);
        continue;
      }
      const laidOut = brief?.plannedAt ? 'Laid out last night: ' : '';
      payload = brief
        ? { title: `${laidOut}${brief.payload.title || 'your look is ready.'}`, body: brief.payload.rationale || 'Composed from what you own. Tap to see it.' }
        : { title: 'Good morning.', body: 'Add a few pieces to your closet and your stylist will dress you tomorrow.' };
    } catch {
      payload = { title: 'Your look is ready.', body: 'Open the app to see today’s outfit.' };
    }
    for (const d of devices) {
      const ok = await sendPush(d, { ...payload, url: '/', route: '/today', tag: `ritual-${date}` });
      await prisma.pushSubscription.update({ where: { id: d.id }, data: { lastSentOn: date } }).catch(() => undefined);
      if (ok) sent++;
    }
  }
  return sent;
}

/**
 * Tomorrow, laid out tonight: at eight in the evening (local), compose the
 * next day for everyone with a device, and tell the ones who asked.
 */
export async function layOutTomorrow(now = new Date()): Promise<number> {
  if (!webPushEnabled && !expoPushEnabled) return 0;
  const subs = await allPushSubscriptions();
  const due = subs.filter((s) => {
    const { date, hour } = localNow(s.timezone, now);
    return hour === 20 && s.lastEveningOn !== date;
  });
  let sent = 0;
  const byUser = new Map<string, typeof due>();
  for (const s of due) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  for (const [userId, devices] of byUser) {
    const { date } = localNow(devices[0].timezone, now);
    const tomorrow = new Date(`${date}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tKey = tomorrow.toISOString().slice(0, 10);
    let brief: Awaited<ReturnType<typeof ensureDailyBrief>> = null;
    try {
      brief = await ensureDailyBrief(userId, tKey, { plannedAt: now });
    } catch {
      brief = null;
    }
    for (const d of devices) {
      if (d.eveningPush && brief && !brief.rest) {
        const ok = await sendPush(d, { title: `Laid out for tomorrow: ${brief.payload.title}`, body: brief.payload.rationale || 'Change the day with a tap; the morning push will confirm.', url: '/', route: '/today', tag: `layout-${tKey}` });
        if (ok) sent++;
      }
      await prisma.pushSubscription.update({ where: { id: d.id }, data: { lastEveningOn: date } }).catch(() => undefined);
    }
  }
  return sent;
}

/**
 * Session hygiene, once a day: refresh-token rows that expired, or were
 * revoked, more than thirty days ago are gone. Live rows and recently
 * ended ones stay (a revoked row is what makes a reused token a clean 401).
 */
const SESSION_RETENTION_MS = 30 * 24 * 3_600_000;
const PRUNE_EVERY_MS = 24 * 3_600_000;
export async function pruneSessions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SESSION_RETENTION_MS);
  const { count } = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return count;
}

// A tick that is still running when its interval fires again is skipped,
// not doubled: a slow database or a long push fan-out must never stack
// copies of the same job on top of each other.
const inFlight = new Set<string>();
export function guardedTick(name: string, run: () => Promise<unknown>): () => void {
  return () => {
    if (inFlight.has(name)) {
      logger.warn({ job: name }, 'Scheduler tick skipped: previous run still in flight');
      return;
    }
    inFlight.add(name);
    run()
      .catch((err) => logger.error({ err, job: name }, 'Scheduler job failed'))
      .finally(() => inFlight.delete(name));
  };
}

export function startScheduler(): () => void {
  const settle = guardedTick('settleVerdicts', settleVerdicts);
  const ritual = guardedTick('sendMorningBriefs', sendMorningBriefs);
  const layout = guardedTick('layOutTomorrow', layOutTomorrow);
  const wish = guardedTick('sendWishlistNudges', sendWishlistNudges);
  const prune = guardedTick('pruneSessions', pruneSessions);
  settle();
  ritual();
  wish();
  const a = setInterval(settle, SETTLE_EVERY_MS);
  const b = setInterval(ritual, RITUAL_EVERY_MS);
  const d = setInterval(layout, RITUAL_EVERY_MS);
  layout();
  const c = setInterval(wish, 10 * 60 * 1000);
  prune();
  const e = setInterval(prune, PRUNE_EVERY_MS);
  return () => {
    clearInterval(a);
    clearInterval(b);
    clearInterval(c);
    clearInterval(d);
    clearInterval(e);
  };
}
