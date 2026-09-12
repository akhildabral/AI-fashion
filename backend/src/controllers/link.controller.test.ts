import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

// The link door's HTTP shapes: 201 with the candidate and the read, 422 with
// a LinkReadFailure for every honest failure (including a missing picture),
// re-read updating prices without touching the image, and preview creating
// nothing.

const mocks = vi.hoisted(() => ({
  readLink: vi.fn(),
  downloadImage: vi.fn(),
  saveImageBuffer: vi.fn(async () => ({ key: 'k.jpg', url: '/api/uploads/k.jpg' })),
  stripMetadata: vi.fn(async (b: Buffer) => b),
  enqueue: vi.fn(),
  catalogItem: vi.fn(),
  checkItemCapacity: vi.fn(async () => ({ allowed: true, used: 1, limit: 15 })),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  prisma: {
    wardrobeItem: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'item-1', ...data })),
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'item-1', ...data })),
    },
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../lib/jobs', () => ({ enqueue: mocks.enqueue }));
vi.mock('../lib/logger', () => ({ logger: mocks.logger }));
vi.mock('../lib/storage', () => ({ saveImageBuffer: mocks.saveImageBuffer }));
vi.mock('../middleware/upload', () => ({ stripMetadata: mocks.stripMetadata, extForMime: (m: string) => (m === 'image/png' ? 'png' : 'jpg') }));
vi.mock('../services/entitlements.service', () => ({ checkItemCapacity: mocks.checkItemCapacity }));
vi.mock('../services/link/image', () => ({ downloadImage: mocks.downloadImage }));
vi.mock('../services/link/read', () => ({ readLink: mocks.readLink }));
vi.mock('./wardrobe.controller', () => ({ catalogItem: mocks.catalogItem }));

import { fromLink, previewLink, rereadLink } from './link.controller';
import { retailerById } from '../services/link/registry';

function res() {
  const r = { status: vi.fn(), json: vi.fn() };
  r.status.mockReturnValue(r);
  return r as unknown as Response & typeof r;
}
const req = (over: Partial<Request> & { body?: unknown; query?: unknown; params?: unknown }) =>
  ({ user: { id: 'u1', email: 'm@example.com', role: 'user', plan: 'free' }, body: {}, query: {}, params: {}, ...over }) as unknown as Request;

const read = {
  ok: true as const,
  retailer: 'flipkart',
  canonicalUrl: 'https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU',
  productName: "Levi's Men Slim Fit Jeans",
  brand: "LEVI'S",
  price: 3799,
  salePrice: 1899.4,
  currency: 'INR',
  availability: 'in_stock' as const,
  images: ['https://rukminim2.flixcart.com/image/a.jpeg', 'https://rukminim2.flixcart.com/image/b.jpeg'],
  chosenColour: 'Blue',
  chosenSize: '32',
  sizeOptions: ['30', '32', '34'],
  asOf: '2026-09-12T10:00:00.000Z',
  method: 'jsonld' as const,
};
const blocked = { ok: false as const, reason: 'blocked' as const, retailer: 'ajio', message: "That shop keeps its pages closed. Send me a screenshot of the piece and I'll read it from there." };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readLink.mockResolvedValue({ result: read, extraction: { rungs: { jsonld: { name: 'x' } } }, retailer: retailerById('flipkart'), preparedUrl: read.canonicalUrl });
  mocks.downloadImage.mockResolvedValue({ buffer: Buffer.from('jpeg-bytes'), mime: 'image/jpeg', sourceUrl: read.images[0] });
});

describe('POST /wardrobe/from-link', () => {
  it('creates a link candidate with the shop facts and queues a catalog job with the studio pass (on-model shop)', async () => {
    const r = res();
    await fromLink(req({ body: { url: 'https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU&utm_source=x' } }), r);
    expect(r.status).toHaveBeenCalledWith(201);
    const body = r.json.mock.calls[0][0];
    expect(body.read).toEqual(read);
    expect(body.item).toMatchObject({
      id: 'item-1',
      userId: 'u1',
      owned: false,
      status: 'processing',
      category: 'other',
      ingestSource: 'link',
      imageUrl: '/api/uploads/k.jpg',
      originalUrl: null,
      sourceUrl: read.canonicalUrl,
      canonicalUrl: read.canonicalUrl,
      retailer: 'flipkart',
      store: 'Flipkart',
      productName: read.productName,
      brand: "LEVI'S",
      currency: 'INR',
      listPrice: 3799,
      salePrice: 1899.4,
      seenPrice: 1899,
      chosenColour: 'Blue',
      chosenSize: '32',
      sizeOptions: ['30', '32', '34'],
      availability: 'in_stock',
      sourceImages: read.images,
      lastCheckedAt: new Date(read.asOf),
      extraction: { rungs: { jsonld: { name: 'x' } } },
    });
    // The image: stripped, saved as the display image only, and handed to the job in memory.
    expect(mocks.stripMetadata).toHaveBeenCalledWith(Buffer.from('jpeg-bytes'), 'image/jpeg');
    expect(mocks.saveImageBuffer).toHaveBeenCalledWith(Buffer.from('jpeg-bytes'), 'jpg');
    expect(mocks.enqueue).toHaveBeenCalledWith('catalog:item-1', expect.any(Function));
    await mocks.enqueue.mock.calls[0][1]();
    expect(mocks.catalogItem).toHaveBeenCalledWith('item-1', Buffer.from('jpeg-bytes'), 'image/jpeg', undefined, undefined, { studio: true });
    // Usage events went to the log.
    const events = mocks.logger.info.mock.calls.map((c) => c[0].event);
    expect(events).toEqual(['import.started', 'import.read']);
  });

  it('answers 422 with the LinkReadFailure when the read fails, and logs import.failed', async () => {
    mocks.readLink.mockResolvedValue({ result: blocked, extraction: null, retailer: retailerById('ajio'), preparedUrl: 'https://www.ajio.com/x/p/441234567' });
    const r = res();
    await fromLink(req({ body: { url: 'https://www.ajio.com/x/p/441234567' } }), r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.json).toHaveBeenCalledWith(blocked);
    expect(mocks.prisma.wardrobeItem.create).not.toHaveBeenCalled();
    expect(mocks.logger.info.mock.calls.map((c) => c[0].event)).toEqual(['import.started', 'import.failed']);
    expect(mocks.logger.info.mock.calls[1][0]).toMatchObject({ reason: 'blocked', retailer: 'ajio' });
  });

  it('answers 422 when the shop will not hand over the picture; nothing is created', async () => {
    mocks.downloadImage.mockResolvedValue(null);
    const r = res();
    await fromLink(req({ body: { url: read.canonicalUrl } }), r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.json.mock.calls[0][0]).toMatchObject({ ok: false, reason: 'blocked', retailer: 'flipkart' });
    expect(r.json.mock.calls[0][0].message).toMatch(/screenshot/i);
    expect(mocks.prisma.wardrobeItem.create).not.toHaveBeenCalled();
  });

  it('validates the body and respects wardrobe capacity', async () => {
    await expect(fromLink(req({ body: {} }), res())).rejects.toThrow();
    mocks.checkItemCapacity.mockResolvedValueOnce({ allowed: false, used: 15, limit: 15 });
    await expect(fromLink(req({ body: { url: read.canonicalUrl } }), res())).rejects.toMatchObject({ status: 429 });
  });
});

describe('POST /wardrobe/:id/reread', () => {
  it('re-reads the source link and moves prices, availability and lastCheckedAt — never the image', async () => {
    mocks.prisma.wardrobeItem.findFirst.mockResolvedValue({ id: 'item-1', sourceUrl: read.canonicalUrl, canonicalUrl: read.canonicalUrl, ingestSource: 'link', productName: 'Old name', brand: null });
    mocks.readLink.mockResolvedValue({ result: { ...read, price: 3799, salePrice: 1499, availability: 'out_of_stock' }, extraction: { rungs: {} }, retailer: retailerById('flipkart'), preparedUrl: read.canonicalUrl });
    const r = res();
    await rereadLink(req({ params: { id: 'item-1' } }), r);
    const data = mocks.prisma.wardrobeItem.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ listPrice: 3799, salePrice: 1499, seenPrice: 1499, availability: 'out_of_stock', lastCheckedAt: new Date(read.asOf) });
    expect(data).not.toHaveProperty('imageUrl');
    expect(data).not.toHaveProperty('sourceImages');
    expect(mocks.downloadImage).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].read.availability).toBe('out_of_stock');
  });

  it('is 404 for someone else\'s item, 400 for a piece with no link, 422 when the shop blocks the re-read', async () => {
    mocks.prisma.wardrobeItem.findFirst.mockResolvedValueOnce(null);
    await expect(rereadLink(req({ params: { id: 'nope' } }), res())).rejects.toMatchObject({ status: 404 });
    mocks.prisma.wardrobeItem.findFirst.mockResolvedValueOnce({ id: 'item-2', sourceUrl: null, canonicalUrl: null, ingestSource: 'camera', productName: null, brand: null });
    await expect(rereadLink(req({ params: { id: 'item-2' } }), res())).rejects.toMatchObject({ status: 400 });
    mocks.prisma.wardrobeItem.findFirst.mockResolvedValueOnce({ id: 'item-1', sourceUrl: read.canonicalUrl, canonicalUrl: null, ingestSource: 'link', productName: 'x', brand: null });
    mocks.readLink.mockResolvedValueOnce({ result: blocked, extraction: null, retailer: null, preparedUrl: null });
    const r = res();
    await rereadLink(req({ params: { id: 'item-1' } }), r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(mocks.prisma.wardrobeItem.update).not.toHaveBeenCalled();
  });
});

describe('GET /link/preview', () => {
  it('returns the read and creates nothing', async () => {
    const r = res();
    await previewLink(req({ query: { url: read.canonicalUrl } }), r);
    expect(r.json).toHaveBeenCalledWith(read);
    expect(r.status).not.toHaveBeenCalled();
    expect(mocks.prisma.wardrobeItem.create).not.toHaveBeenCalled();
    expect(mocks.downloadImage).not.toHaveBeenCalled();
  });

  it('returns 422 with the failure shape', async () => {
    mocks.readLink.mockResolvedValue({ result: { ok: false, reason: 'not-product', retailer: 'myntra', message: 'x' }, extraction: null, retailer: retailerById('myntra'), preparedUrl: 'https://www.myntra.com/men-shirts' });
    const r = res();
    await previewLink(req({ query: { url: 'https://www.myntra.com/men-shirts' } }), r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.json).toHaveBeenCalledWith({ ok: false, reason: 'not-product', retailer: 'myntra', message: 'x' });
  });

  it('rejects a missing url with a validation error', async () => {
    await expect(previewLink(req({ query: {} }), res())).rejects.toThrow();
  });
});
