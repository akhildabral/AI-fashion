import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), createMany: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { styleEvent: { create: mocks.create, createMany: mocks.createMany } } }));
vi.mock('../lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { occurredAt, recordFeedback, recordSwap, recordWoreInstead } from './taste-events';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({});
  mocks.createMany.mockResolvedValue({ count: 1 });
});

describe('occurredAt', () => {
  it('puts a day key at noon UTC and passes dates through', () => {
    expect(occurredAt('2026-06-15').toISOString()).toBe('2026-06-15T12:00:00.000Z');
    const d = new Date('2026-06-15T08:30:00Z');
    expect(occurredAt(d)).toBe(d);
    expect(occurredAt(undefined).getTime()).toBeGreaterThan(0);
  });
});

describe('recordSwap', () => {
  it('stores out, in and the rest of the look without the outgoing piece', async () => {
    await recordSwap('u1', { date: '2026-06-15', eventType: 'work', slot: 'morning', outId: 'a', inId: 'b', itemIds: ['a', 'c', 'd'] });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ userId: 'u1', kind: 'swap', outId: 'a', inId: 'b', itemIds: ['c', 'd'], eventType: 'work', slot: 'morning' });
  });

  it('never throws when the write fails', async () => {
    mocks.create.mockRejectedValueOnce(new Error('down'));
    await expect(recordSwap('u1', { date: '2026-06-15', outId: 'a', inId: 'b' })).resolves.toBeUndefined();
  });
});

describe('recordWoreInstead', () => {
  it('emits one passed_over per piece left on the chair and one wore_instead', async () => {
    await recordWoreInstead('u1', { date: '2026-06-15', eventType: 'work', suggested: ['s1', 's2', 'k'], worn: ['k', 'w1'] });
    const rows = mocks.createMany.mock.calls[0][0].data as { kind: string; outId: string | null; itemIds: string[] }[];
    expect(rows.filter((r) => r.kind === 'passed_over').map((r) => r.outId)).toEqual(['s1', 's2']);
    const instead = rows.find((r) => r.kind === 'wore_instead');
    expect(instead?.itemIds).toEqual(['k', 'w1']);
  });

  it('records nothing when the worn set is the laid-out set', async () => {
    await recordWoreInstead('u1', { date: '2026-06-15', suggested: ['a', 'b'], worn: ['b', 'a'] });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});

describe('recordFeedback', () => {
  it('keeps the signal in meta', async () => {
    await recordFeedback('u1', { itemId: 'x', signal: 'too-formal' });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ kind: 'feedback', outId: 'x', meta: { signal: 'too-formal' } });
  });
});
