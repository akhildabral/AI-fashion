import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('./prisma', () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { dbAlive } from './health';

beforeEach(() => vi.clearAllMocks());

describe('dbAlive', () => {
  it('is true when SELECT 1 answers in time', async () => {
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(dbAlive(1000)).resolves.toBe(true);
  });

  it('is false when the database throws', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(dbAlive(1000)).resolves.toBe(false);
  });

  it('is false when the database is slower than the cap', async () => {
    mocks.queryRaw.mockReturnValue(new Promise(() => undefined));
    await expect(dbAlive(20)).resolves.toBe(false);
  });
});
