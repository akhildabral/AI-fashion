import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { enqueue } from '../lib/jobs';
import { logger } from '../lib/logger';
import { saveImageBuffer } from '../lib/storage';
import { extForMime, stripMetadata } from '../middleware/upload';
import { HttpError } from '../middleware/error';
import { checkItemCapacity } from '../services/entitlements.service';
import { downloadImage } from '../services/link/image';
import { readLink } from '../services/link/read';
import { regionOf, retailerById } from '../services/link/registry';
import { failure, type LinkRead, type LinkReadFailure } from '../services/link/types';
import { catalogItem } from './wardrobe.controller';

// The Fitting Room's link door. A pasted shop link becomes a wishlist
// candidate: the page is read once (member-initiated, never crawled), the
// product image is fetched for cataloguing and try-on only, and the item
// keeps the link, the prices with their date, and the raw facts — not the
// page. Imports are unmetered (owner decision): no quota() on these routes.

const linkBody = z.object({ url: z.string().trim().min(8).max(2048) });

function usage(event: 'import.started' | 'import.read' | 'import.failed', fields: Record<string, unknown>): void {
  logger.info({ event, ...fields }, event);
}

/** The columns a read fills on a WardrobeItem; shared by import and re-read. */
function columnsFrom(read: LinkRead, extraction: Record<string, unknown> | null, sourceUrl: string): Prisma.WardrobeItemUncheckedUpdateInput {
  const seen = read.salePrice ?? read.price;
  return {
    sourceUrl,
    canonicalUrl: read.canonicalUrl,
    retailer: read.retailer,
    productName: read.productName,
    currency: read.currency,
    listPrice: read.price,
    salePrice: read.salePrice,
    chosenColour: read.chosenColour,
    chosenSize: read.chosenSize,
    sizeOptions: read.sizeOptions,
    availability: read.availability,
    sourceImages: read.images,
    lastCheckedAt: new Date(read.asOf),
    extraction: (extraction ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    store: retailerById(read.retailer)?.name ?? read.retailer,
    seenPrice: seen != null ? Math.round(seen) : null,
    ...(read.brand ? { brand: read.brand } : {}),
  };
}

function respondFailure(res: Response, fail: LinkReadFailure, userId: string, ms: number): void {
  usage('import.failed', { userId, retailer: fail.retailer, reason: fail.reason, ms });
  res.status(422).json(fail);
}

/** POST /api/wardrobe/from-link { url } → 201 FromLinkResponse | 422 LinkReadFailure */
export async function fromLink(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { url } = linkBody.parse(req.body ?? {});
  const userId = req.user.id;
  const started = Date.now();
  usage('import.started', { userId, door: 'link', host: hostOf(url) });

  if (req.user.role !== 'admin') {
    const capacity = await checkItemCapacity(userId, req.user.plan);
    if (!capacity.allowed) {
      throw new HttpError(429, `Your wardrobe is full (${capacity.limit} items on your plan) — upgrade to add more`);
    }
  }

  const outcome = await readLink(url);
  if (!outcome.result.ok) return respondFailure(res, outcome.result, userId, Date.now() - started);
  const read = outcome.result;
  const retailer = outcome.retailer!;
  usage('import.read', { userId, retailer: read.retailer, method: read.method, ms: Date.now() - started, images: read.images.length, priced: read.price != null });

  // The best image: the shop's own product shot, transient from here on.
  const image = await downloadImage(read.images, { region: regionOf(retailer, new URL(read.canonicalUrl)), referer: read.canonicalUrl });
  if (!image) {
    return respondFailure(
      res,
      failure('blocked', read.retailer, "I could read the piece but the shop wouldn't hand over its picture. Send me a screenshot and I'll read it from there."),
      userId,
      Date.now() - started,
    );
  }
  const buffer = await stripMetadata(image.buffer, image.mime);

  // The stripped product shot is the display image while the catalog job
  // runs; the job replaces it with the cut-out and deletes it (it is not the
  // `originalUrl`, so the cleanup path treats it as a superseded display).
  // The bytes themselves go to the job in memory. sourceImages keeps URLs.
  const stored = await saveImageBuffer(buffer, extForMime(image.mime));
  const item = await prisma.wardrobeItem.create({
    data: {
      ...(columnsFrom(read, outcome.extraction, outcome.preparedUrl ?? url) as Prisma.WardrobeItemUncheckedCreateInput),
      userId,
      imageUrl: stored.url,
      originalUrl: null,
      status: 'processing',
      category: 'other',
      owned: false,
      seenAt: new Date(),
      ingestSource: 'link',
    },
  });
  // Garment detection never runs on a product page's own image (it is one
  // piece). The studio re-render does, because most shops photograph on a
  // model and the matte would keep the person; only shops flagged as flat
  // photography in the registry skip it.
  enqueue(`catalog:${item.id}`, () => catalogItem(item.id, buffer, image.mime, undefined, undefined, { studio: !retailer.flatShots }));

  res.status(201).json({ item, read });
}

/** POST /api/wardrobe/:id/reread → re-run the read on a link candidate; prices, availability, lastCheckedAt move. No image re-download. */
export async function rereadLink(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const userId = req.user.id;
  const item = await prisma.wardrobeItem.findFirst({
    where: { id, userId },
    select: { id: true, sourceUrl: true, canonicalUrl: true, ingestSource: true, productName: true, brand: true },
  });
  if (!item) throw new HttpError(404, 'Item not found');
  const source = item.sourceUrl ?? item.canonicalUrl;
  if (!source) throw new HttpError(400, 'This piece did not come from a link');

  const started = Date.now();
  usage('import.started', { userId, door: 'reread', itemId: id, host: hostOf(source) });
  const outcome = await readLink(source);
  if (!outcome.result.ok) return respondFailure(res, outcome.result, userId, Date.now() - started);
  const read = outcome.result;
  usage('import.read', { userId, retailer: read.retailer, method: read.method, ms: Date.now() - started, reread: true });

  const cols = columnsFrom(read, outcome.extraction, item.sourceUrl ?? source);
  // A re-read refreshes the shop's facts; it never blanks a name the member already has.
  if (!read.productName && item.productName) delete cols.productName;
  if (!read.brand) delete cols.brand;
  delete cols.sourceImages;
  const updated = await prisma.wardrobeItem.update({ where: { id }, data: cols });
  res.json({ item: updated, read });
}

/** GET /api/link/preview?url= → 200 LinkRead | 422 LinkReadFailure. Reads only; creates nothing. */
export async function previewLink(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { url } = linkBody.parse({ url: req.query.url });
  const userId = req.user.id;
  const started = Date.now();
  usage('import.started', { userId, door: 'preview', host: hostOf(url) });
  const outcome = await readLink(url);
  if (!outcome.result.ok) return respondFailure(res, outcome.result, userId, Date.now() - started);
  usage('import.read', { userId, retailer: outcome.result.retailer, method: outcome.result.method, ms: Date.now() - started, preview: true });
  res.json(outcome.result);
}

function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}
