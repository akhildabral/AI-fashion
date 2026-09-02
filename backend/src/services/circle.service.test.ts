import { describe, expect, it } from 'vitest';
import { score, type CirclePost } from './circle.service';

const now = Date.parse('2026-09-03T12:00:00Z');
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

function look(over: Partial<Extract<CirclePost, { type: 'look' }>> = {}): CirclePost {
  return {
    type: 'look',
    id: 'l',
    at: hoursAgo(1),
    handle: 'a',
    isMine: false,
    isFriend: false,
    eventType: null,
    featured: false,
    items: [],
    reactions: { counts: {}, total: 0, sample: [], mine: null },
    ...over,
  };
}

describe('circle feed ranking', () => {
  it('lets an unanswered verdict outrank a fresher plain look', () => {
    const verdict: CirclePost = {
      type: 'verdict',
      id: 'v',
      at: hoursAgo(20),
      handle: 'b',
      isMine: false,
      question: '?',
      options: [],
      expiresAt: hoursAgo(-2),
      settled: false,
      counts: null,
      totalVotes: 0,
      myVote: null,
    };
    expect(score(verdict, now)).toBeGreaterThan(score(look({ at: hoursAgo(1) }), now));
  });

  it('puts a pick made for you first', () => {
    const pick: CirclePost = { type: 'pick', id: 'p', at: hoursAgo(30), handle: 'c', note: null, items: [] };
    expect(score(pick, now)).toBeGreaterThan(score(look({ at: hoursAgo(0), isFriend: true }), now));
  });

  it('decays with age and rewards friends and reactions', () => {
    const fresh = score(look({ at: hoursAgo(1) }), now);
    const stale = score(look({ at: hoursAgo(72) }), now);
    expect(fresh).toBeGreaterThan(stale);
    const lively = score(look({ reactions: { counts: { would_wear: 4 }, total: 4, sample: [], mine: null }, isFriend: true }), now);
    expect(lively).toBeGreaterThan(fresh);
  });
});
