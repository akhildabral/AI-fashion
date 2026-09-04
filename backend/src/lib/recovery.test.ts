import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tryOnFindMany: vi.fn(),
  tryOnUpdate: vi.fn(),
  itemFindMany: vi.fn(),
  itemUpdate: vi.fn(),
  refundTryOn: vi.fn(),
  readCatalogSource: vi.fn(),
  enqueueCatalog: vi.fn(),
}));

vi.mock('./prisma', () => ({
  prisma: {
    tryOn: { findMany: mocks.tryOnFindMany, update: mocks.tryOnUpdate },
    wardrobeItem: { findMany: mocks.itemFindMany, update: mocks.itemUpdate },
  },
}));
vi.mock('../controllers/tryon.controller', () => ({ refundTryOn: mocks.refundTryOn }));
vi.mock('../controllers/wardrobe.controller', () => ({ readCatalogSource: mocks.readCatalogSource, enqueueCatalog: mocks.enqueueCatalog }));

import { sweepStaleJobs } from './recovery';

const before = new Date('2026-09-05T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tryOnUpdate.mockResolvedValue({});
  mocks.itemUpdate.mockResolvedValue({});
  mocks.refundTryOn.mockResolvedValue(undefined);
});

describe('sweepStaleJobs', () => {
  it('fails and refunds renders left queued or rendering by a previous process', async () => {
    mocks.tryOnFindMany.mockResolvedValue([{ id: 't1', usageEventId: 'u1' }, { id: 't2', usageEventId: null }]);
    mocks.itemFindMany.mockResolvedValue([]);
    const r = await sweepStaleJobs(before);
    expect(mocks.tryOnFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['queued', 'rendering'] }, createdAt: { lt: before } } }),
    );
    expect(mocks.tryOnUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.tryOnUpdate.mock.calls[0][0]).toMatchObject({ where: { id: 't1' }, data: { status: 'failed' } });
    expect(mocks.refundTryOn).toHaveBeenCalledWith('u1', 't1');
    expect(mocks.refundTryOn).toHaveBeenCalledWith(null, 't2');
    expect(r).toEqual({ rendersFailed: 2, itemsRequeued: 0, itemsFailed: 0 });
  });

  it('re-queues stuck wardrobe items from their stored source, failing unreadable ones', async () => {
    mocks.tryOnFindMany.mockResolvedValue([]);
    const good = { id: 'i1', imageUrl: '/api/uploads/a.png', originalUrl: null, description: null, subtype: null, category: 'top', cropped: false };
    const bad = { ...good, id: 'i2' };
    mocks.itemFindMany.mockResolvedValue([good, bad]);
    mocks.readCatalogSource.mockImplementation(async (item: { id: string }) => {
      if (item.id === 'i2') throw new Error('ENOENT');
      return Buffer.from('png');
    });
    const r = await sweepStaleJobs(before);
    expect(mocks.itemFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'processing', updatedAt: { lt: before } } }));
    expect(mocks.enqueueCatalog).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueCatalog).toHaveBeenCalledWith('i1', good, expect.any(Buffer));
    expect(mocks.itemUpdate).toHaveBeenCalledWith({ where: { id: 'i2' }, data: { status: 'failed' } });
    expect(r).toEqual({ rendersFailed: 0, itemsRequeued: 1, itemsFailed: 1 });
  });
});
