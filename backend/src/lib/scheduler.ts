import { prisma } from './prisma';
import { notify } from './notify';

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
      await notify(poll.userId, 'verdict_settled', null, payload);
      // Signed-in voters hear how it went too.
      const voterIds = [...new Set(poll.votes.map((v) => v.voterKey).filter((k) => k.startsWith('user:')).map((k) => k.slice(5)))];
      for (const uid of voterIds) {
        if (uid !== poll.userId) await notify(uid, 'verdict_settled', poll.userId, payload);
      }
      notified++;
    }
    await prisma.poll.update({ where: { id: poll.id }, data: { settledNotifiedAt: now } });
  }
  return notified;
}

export function startScheduler(): () => void {
  const tick = () => {
    settleVerdicts().catch((err) => console.error('settleVerdicts failed:', err instanceof Error ? err.message : err));
  };
  tick();
  const id = setInterval(tick, SETTLE_EVERY_MS);
  return () => clearInterval(id);
}
