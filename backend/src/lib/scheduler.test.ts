import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  subFindMany: vi.fn(),
  sessionDeleteMany: vi.fn(),
}));

vi.mock('./prisma', () => ({
  prisma: { pushSubscription: { findMany: mocks.subFindMany }, session: { deleteMany: mocks.sessionDeleteMany } },
}));
vi.mock('../controllers/store.controller', () => ({ sendWishlistNudges: vi.fn() }));
vi.mock('../controllers/brief.controller', () => ({ ensureDailyBrief: vi.fn() }));
vi.mock('./notify', () => ({ notify: vi.fn() }));
vi.mock('./push', () => ({ expoPushEnabled: false, webPushEnabled: false, localNow: vi.fn(), sendPush: vi.fn() }));

import { allPushSubscriptions, guardedTick, pruneSessions } from './scheduler';

beforeEach(() => vi.clearAllMocks());

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('guardedTick', () => {
  it('never overlaps: a tick that fires mid-run is skipped', async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const fire = guardedTick('overlap', run);
    fire();
    fire();
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await tick();
    fire();
    expect(run).toHaveBeenCalledTimes(2);
    release();
  });

  it('releases the guard when the run fails', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    const fire = guardedTick('failing', run);
    fire();
    await tick();
    fire();
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('allPushSubscriptions', () => {
  it('walks every page by cursor', async () => {
    const page = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ id: `s${from + i}` }));
    mocks.subFindMany.mockResolvedValueOnce(page(500, 0)).mockResolvedValueOnce(page(3, 500));
    const all = await allPushSubscriptions();
    expect(all).toHaveLength(503);
    expect(mocks.subFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.subFindMany.mock.calls[0][0]).not.toHaveProperty('cursor');
    expect(mocks.subFindMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 's499' }, skip: 1 });
  });
});

describe('pruneSessions', () => {
  it('deletes rows expired or revoked for more than thirty days', async () => {
    mocks.sessionDeleteMany.mockResolvedValue({ count: 4 });
    const now = new Date('2026-09-05T00:00:00Z');
    await expect(pruneSessions(now)).resolves.toBe(4);
    const cutoff = new Date('2026-08-06T00:00:00Z');
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] } });
  });
});
