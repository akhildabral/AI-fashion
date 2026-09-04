import type { Request, Response } from 'express';
import { z } from 'zod';
import sharp from 'sharp';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { deleteFile, keyFromStored, mimeForKey, readStored, saveImageBuffer } from '../lib/storage';
import { enqueue } from '../lib/jobs';
import { extForMime, stripMetadata } from '../middleware/upload';
import { checkItemCapacity } from '../services/entitlements.service';
import {
  detectGarments,
  deriveReasoningAttributes,
  draftResaleListing,
  suggestOutfits,
  tagGarment,
  type DetectedGarment,
  type SuggestedOutfit, type GarmentTags } from '../services/wardrobe.service';
import { generativeCleanupAvailable, matteGarment, studioRender, type CleanedGarment } from '../services/cleanup.service';
import { fingerprintOf, matchPiece, SURE_AT } from '../services/closet-match.service';
import { getTripForecast, getWeather, type Weather } from '../services/weather.service';
import { planPacking } from '../services/packing.service';
import { outfitsAround } from '../services/pairing.service';
import {
  validateOutfit,
  type RecentWear,
  type ValidationResult,
} from '../services/validator.service';
import { extractPalette } from '../lib/color';
import { EVENT_TYPES, ITEM_STATES, type EventType } from '../lib/attributes';
import { wearSignalBonus } from '../lib/wear-signal';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';

const MIN_ITEMS_FOR_OUTFIT = 2;

// Background cataloging: matting → palette → vision tagging → derived
// attributes. The upload response never waits for any of this — that's what
// makes burst capture possible.
// Crop a detected garment's region (normalized box, with a generous margin)
// so extraction and tagging see that item dominating the frame instead of the
// whole multi-item scene. Falls back to the full photo on any doubt.
export async function cropToRegion(
  image: Buffer,
  box: { x: number; y: number; w: number; h: number },
): Promise<Buffer> {
  try {
    if (box.w <= 0.02 || box.h <= 0.02 || box.w * box.h > 0.95) return image;
    // The size after the EXIF rotation: metadata() reports the stored size,
    // which is swapped for a portrait phone photo.
    const { info } = await sharp(image).rotate().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    if (!W || !H) return image;
    const margin = 0.15;
    const left = Math.max(0, Math.floor((box.x - box.w * margin) * W));
    const top = Math.max(0, Math.floor((box.y - box.h * margin) * H));
    const width = Math.min(W - left, Math.ceil(box.w * (1 + 2 * margin) * W));
    const height = Math.min(H - top, Math.ceil(box.h * (1 + 2 * margin) * H));
    if (width < 32 || height < 32) return image;
    const crop = sharp(image).rotate().extract({ left, top, width, height });
    // A small thing in a big photo (a pair of boots under a chair) comes out
    // a few dozen pixels wide; the readers need more than that to see it.
    const MIN_SIDE = 384;
    if (Math.min(width, height) < MIN_SIDE) {
      const k = MIN_SIDE / Math.min(width, height);
      return await crop.resize({ width: Math.round(width * k), height: Math.round(height * k), kernel: 'lanczos3' }).png().toBuffer();
    }
    return await crop.png().toBuffer();
  } catch {
    return image;
  }
}

export async function catalogItem(
  itemId: string,
  image: Buffer,
  mime: string,
  target?: string,
  region?: { x: number; y: number; w: number; h: number },
): Promise<void> {
  // A piece out of a group photo: its region, with a margin, becomes its own
  // original from here on. The whole group photo stops mattering to it —
  // showing it as "the original" misleads, and re-reading from it means
  // guessing which garment was meant.
  if (region) {
    image = await cropToRegion(image, region);
    mime = 'image/png';
    const crop = await saveImageBuffer(image, 'png');
    const before = await prisma.wardrobeItem.findUnique({ where: { id: itemId }, select: { originalUrl: true, imageUrl: true } });
    await prisma.wardrobeItem.update({ where: { id: itemId }, data: { originalUrl: crop.url, imageUrl: crop.url, cropped: true } });
    // Each piece held its own copy of the group photo; this one's copy goes.
    if (before?.originalUrl && before.originalUrl !== crop.url) await deleteFile(before.originalUrl).catch(() => undefined);
  }
  let imageForTagging = image;
  let mimeForTagging = mime;
  let newImageUrl: string | null = null;
  let update: Prisma.WardrobeItemUncheckedUpdateInput = {};

  // 1. The photo's own cut-out: the ground truth for shape and colour, and
  //    the cleanest thing to read tags from.
  let local: CleanedGarment | null = null;
  if (env.MATTING_ENABLED && !target) {
    local = await matteGarment(image);
    if (local) {
      imageForTagging = local.png;
      mimeForTagging = 'image/png';
      if (local.rgba) {
        const palette = extractPalette(local.rgba.data, local.rgba.width, local.rgba.height);
        if (palette.length > 0) update.colorPalette = palette as unknown as Prisma.InputJsonValue;
      }
    }
  }

  const previous = await prisma.wardrobeItem.findUnique({
    where: { id: itemId },
    select: { imageUrl: true, originalUrl: true, userId: true, attrConfidence: true, category: true },
  });
  // The item may have been deleted while processing.
  if (!previous) {
    if (newImageUrl) await deleteFile(newImageUrl);
    return;
  }

  try {
    let display = local;
    let tags: GarmentTags;
    if (target) {
      // A named garment out of a photo that holds others: the studio isolates
      // it first (posed by the kind the detector saw), and the facts are read
      // from that isolated render — reading the crop would describe the
      // jacket over it or the trousers below it.
      if (env.MATTING_ENABLED) {
        display = (await studioRender(image, mime, { target, category: previous.category, local: null })) ?? (await matteGarment(image));
      }
      tags = display ? await tagGarment(display.png, 'image/png') : await tagGarment(imageForTagging, mimeForTagging);
    } else {
      tags = await tagGarment(imageForTagging, mimeForTagging);
      // 2. The studio re-render, now that the piece's kind is known (shoes and
      //    bags are shot from the side), checked against the photo's shape.
      if (env.MATTING_ENABLED) {
        const studio = await studioRender(image, mime, { target, category: tags.category, local });
        if (studio) display = studio;
      }
    }
    if (display) {
      const stored = await saveImageBuffer(display.png, 'png');
      newImageUrl = stored.url;
      update.imageUrl = stored.url;
      if (!update.colorPalette && display.rgba) {
        const palette = extractPalette(display.rgba.data, display.rgba.width, display.rgba.height);
        if (palette.length > 0) update.colorPalette = palette as unknown as Prisma.InputJsonValue;
      }
    }
    const { attrConfidence, details, ...tagFields } = tags;
    // A fact you set stays yours: a re-read never overwrites full-confidence fields.
    const prior = (previous.attrConfidence as Record<string, number> | null) ?? {};
    const fields: Record<string, unknown> = { ...tagFields };
    for (const k of Object.keys(fields)) if ((prior[k] ?? 0) >= 1) delete fields[k];
    const conf: Record<string, number> = { ...attrConfidence };
    for (const k of Object.keys(prior)) if (prior[k] >= 1) conf[k] = 1;
    // Who it's cut for: when the photo can't settle it, assume your side of the closet, as a guess.
    if (!fields.cutFor && (prior.cutFor ?? 0) < 1) {
      const profile = await prisma.styleProfile.findUnique({ where: { userId: previous.userId }, select: { styleFor: true } });
      fields.cutFor = profile?.styleFor === 'female' ? 'womens' : profile?.styleFor === 'male' ? 'mens' : 'unisex';
      conf.cutFor = 0.4;
    }
    // The fingerprint of the cut-out: the same photo again is the surest twin.
    try {
      update.fingerprint = await fingerprintOf(local?.png ?? display?.png ?? image);
    } catch {
      /* a fingerprint is a nicety */
    }
    update = {
      ...update,
      ...(fields as Prisma.WardrobeItemUncheckedUpdateInput),
      ...((prior.details ?? 0) >= 1 ? {} : { details: (details ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull }),
      ...deriveReasoningAttributes(tags),
      attrConfidence: conf,
      status: 'ready',
    };
  } catch (err) {
    // Keep the item (and its cutout, if any); the user can tag it manually.
    console.error('Garment tagging failed:', err instanceof Error ? err.message : err);
    update.status = 'failed';
  }

  await prisma.wardrobeItem.update({ where: { id: itemId }, data: update });
  if (update.status === 'ready') await flagTwin(itemId).catch((err) => console.error('twin check failed:', err instanceof Error ? err.message : err));
  // Clean up a superseded cutout — but never the pristine original.
  if (
    newImageUrl &&
    previous.imageUrl !== newImageUrl &&
    previous.imageUrl !== previous.originalUrl
  ) {
    await deleteFile(previous.imageUrl);
  }
}

/**
 * Is this piece one the closet already has? Scores it against every owned,
 * ready piece of its category and flags a sure match. Never acts alone.
 */
export async function flagTwin(itemId: string): Promise<void> {
  const item = await prisma.wardrobeItem.findUnique({ where: { id: itemId } });
  if (!item || !item.owned || item.twinResolvedAt) return;
  const closet = await prisma.wardrobeItem.findMany({
    where: { userId: item.userId, owned: true, status: 'ready', category: item.category, id: { not: item.id }, state: { not: 'retired' } },
  });
  const exclude = new Set([...item.twinDismissed, ...closet.filter((c) => c.twinDismissed.includes(item.id) || c.twinOfId === item.id).map((c) => c.id)]);
  const [best] = matchPiece(item, closet, { exclude, limit: 1 });
  if (best && best.score >= SURE_AT) {
    await prisma.wardrobeItem.update({ where: { id: item.id }, data: { twinOfId: best.candidate.id, twinScore: best.score } });
  } else if (item.twinOfId) {
    await prisma.wardrobeItem.update({ where: { id: item.id }, data: { twinOfId: null, twinScore: null } });
  }
}

const twinSchema = z.object({
  resolution: z.enum(['same', 'different']),
  // Same piece, but this newer photo is the better one: it moves to the kept piece.
  keepPhoto: z.boolean().optional(),
});

/** The person's answer to a twin flag. */
export async function resolveTwin(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const { resolution, keepPhoto } = twinSchema.parse(req.body);
  const item = await prisma.wardrobeItem.findFirst({ where: { id, userId: req.user.id } });
  if (!item) throw new HttpError(404, 'Item not found');
  if (!item.twinOfId) throw new HttpError(400, 'This piece is not flagged as a twin');
  const kept = await prisma.wardrobeItem.findFirst({ where: { id: item.twinOfId, userId: req.user.id } });

  if (resolution === 'different') {
    await prisma.wardrobeItem.update({ where: { id }, data: { twinOfId: null, twinScore: null, twinResolvedAt: new Date(), twinDismissed: { push: item.twinOfId } } });
    if (kept) await prisma.wardrobeItem.update({ where: { id: kept.id }, data: { twinDismissed: { push: id } } });
    const updated = await prisma.wardrobeItem.findUnique({ where: { id } });
    return res.json({ item: updated, kept: null });
  }

  // The same piece: the newer row goes; its photo may move to the kept piece.
  if (kept && keepPhoto) {
    const old = { imageUrl: kept.imageUrl, originalUrl: kept.originalUrl };
    await prisma.wardrobeItem.update({
      where: { id: kept.id },
      data: { imageUrl: item.imageUrl, originalUrl: item.originalUrl, colorPalette: item.colorPalette ?? undefined, fingerprint: item.fingerprint, cropped: item.cropped },
    });
    await prisma.wardrobeItem.delete({ where: { id } });
    await deleteFile(old.imageUrl).catch(() => undefined);
    if (old.originalUrl && old.originalUrl !== old.imageUrl) await deleteFile(old.originalUrl).catch(() => undefined);
  } else {
    await prisma.wardrobeItem.delete({ where: { id } });
    await deleteFile(item.imageUrl).catch(() => undefined);
    if (item.originalUrl && item.originalUrl !== item.imageUrl) await deleteFile(item.originalUrl).catch(() => undefined);
  }
  const keptNow = kept ? await prisma.wardrobeItem.findUnique({ where: { id: kept.id } }) : null;
  res.json({ item: null, kept: keptNow });
}

export async function addItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  if (!req.file) throw new HttpError(400, 'No image file provided');
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  const candidate = body.owned === 'false';
  const candidateStore = candidate && body.store ? String(body.store).slice(0, 120) : null;
  const candidatePrice = candidate && body.seenPrice && /^\d+$/.test(body.seenPrice) ? Number(body.seenPrice) : null;

  if (req.user.role !== 'admin') {
    const capacity = await checkItemCapacity(req.user.id, req.user.plan);
    if (!capacity.allowed) {
      throw new HttpError(
        429,
        `Your wardrobe is full (${capacity.limit} items on your plan) — upgrade to add more`,
      );
    }
  }

  // The stored original never carries EXIF (location, device); orientation
  // is baked into the pixels so every later .rotate() is a no-op.
  const { mimetype } = req.file;
  const buffer = await stripMetadata(req.file.buffer, mimetype);
  const userId = req.user.id;

  // One photo can hold several garments (a flat-lay, a rack, or a person
  // wearing an outfit). When targeted extraction is available, enumerate them
  // and catalog each as its own item; otherwise treat the photo as one item.
  let garments: DetectedGarment[] = [];
  if (env.MATTING_ENABLED && generativeCleanupAvailable()) {
    try {
      garments = await detectGarments(buffer, mimetype);
    } catch (err) {
      console.error('Garment detection failed:', err instanceof Error ? err.message : err);
    }
  }
  if (garments.length === 0) {
    garments = [{ description: '', category: 'other', box: { x: 0, y: 0, w: 1, h: 1 } }];
  }

  // Each item keeps its own copy of the original photo so deletes stay
  // independent. Cataloging runs async; clients poll until status is ready.
  const items = await Promise.all(
    garments.map(async (garment) => {
      const stored = await saveImageBuffer(buffer, extForMime(mimetype));
      const item = await prisma.wardrobeItem.create({
        data: {
          userId,
          imageUrl: stored.url,
          originalUrl: stored.url,
          status: 'processing',
          category: garment.category,
          ...(garment.description ? { description: garment.description } : {}),
          // In the store: a candidate piece, not owned yet.
          ...(candidate ? { owned: false, seenAt: new Date(), store: candidateStore, seenPrice: candidatePrice } : {}),
        },
      });
      // Only force generative extraction when a photo holds several garments.
      // A single-garment upload passes no target, so cleanup tries a local
      // matte first (proportion-preserving, free) and only re-renders
      // generatively if that photo is too cluttered to matte confidently.
      const target = garments.length > 1 ? garment.description : undefined;
      const region = garments.length > 1 ? garment.box : undefined;
      enqueue(`catalog:${item.id}`, () =>
        catalogItem(item.id, buffer, mimetype, target || undefined, region),
      );
      return item;
    }),
  );

  res.status(201).json({ items, item: items[0] });
}

// Re-run the cataloging pipeline (matting + tagging) on an existing item —
// e.g. after a failed run, or to benefit from pipeline improvements. Works
// from the currently stored image.
export async function recatalogItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);

  const item = await prisma.wardrobeItem.findFirst({
    where: { id, userId: req.user.id },
    select: { imageUrl: true, originalUrl: true, description: true, subtype: true, category: true, cropped: true },
  });
  if (!item) throw new HttpError(404, 'Item not found');

  let image: Buffer;
  try {
    image = await readCatalogSource(item);
  } catch {
    throw new HttpError(400, 'The item image could not be found');
  }

  const updated = await prisma.wardrobeItem.update({
    where: { id },
    data: { status: 'processing' },
  });
  enqueueCatalog(id, item, image);

  res.json({ item: updated });
}

type CatalogSource = { imageUrl: string; originalUrl: string | null; description: string | null; subtype: string | null; category: string; cropped: boolean };

/** The pristine upload when it exists, else the display image. */
export function readCatalogSource(item: Pick<CatalogSource, 'imageUrl' | 'originalUrl'>): Promise<Buffer> {
  return readStored(item.originalUrl ?? item.imageUrl);
}

/**
 * Queue the cataloging pipeline for an existing item from its stored source
 * — a re-read, or the boot sweep re-queuing a piece a restart left in
 * `processing`. The item must already be marked `processing`.
 */
export function enqueueCatalog(id: string, item: CatalogSource, image: Buffer): void {
  const source = item.originalUrl ?? item.imageUrl;
  // Name the garment so extraction stays targeted when the original is a
  // group photo. A piece's own crop is a single garment: no target, so the
  // read is the predictable single-garment one.
  const target = item.cropped ? undefined : (item.description ?? item.subtype ?? item.category);
  enqueue(`recatalog:${id}`, () =>
    catalogItem(id, image, mimeForKey(keyFromStored(source)), target || undefined),
  );
}

export async function listItems(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  // Owned pieces by default; ?owned=false is the wishlist; ?owned=all is both.
  const owned = req.query.owned === 'false' ? { owned: false } : req.query.owned === 'all' ? {} : { owned: true };
  const items = await prisma.wardrobeItem.findMany({
    where: { userId: req.user.id, ...owned },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items });
}

const updateSchema = z.object({
  category: z.enum(['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'dress', 'other']).optional(),
  subtype: z.string().max(60).nullish(),
  primaryColor: z.string().max(40).nullish(),
  pattern: z.string().max(40).nullish(),
  formality: z.string().max(40).nullish(),
  season: z.array(z.enum(['spring', 'summer', 'fall', 'winter'])).optional(),
  material: z.string().max(60).nullish(),
  description: z.string().max(300).nullish(),
  state: z.enum(ITEM_STATES).optional(),
  suppressed: z.boolean().optional(),
  price: z.number().min(0).max(1_000_000).nullish(),
  visibility: z.enum(['private', 'public']).optional(),
  layerRole: z.enum(['base', 'mid', 'outer', 'bottom', 'footwear', 'accessory', 'one-piece']).nullish(),
  warmthValue: z.number().int().min(0).max(10).nullish(),
  formalityScore: z.number().int().min(1).max(5).nullish(),
  brand: z.string().max(60).nullish(),
  size: z.string().max(30).nullish(),
  // Tags, second edition.
  cutFor: z.enum(['womens', 'mens', 'unisex']).nullish(),
  secondaryColor: z.string().max(40).nullish(),
  fit: z.enum(['slim', 'regular', 'relaxed', 'oversized']).nullish(),
  length: z.enum(['cropped', 'regular', 'long']).nullish(),
  texture: z.enum(['smooth', 'woven', 'knit', 'ribbed', 'fuzzy', 'glossy', 'other']).nullish(),
  weight: z.enum(['light', 'mid', 'heavy']).nullish(),
  occasions: z.array(z.enum(EVENT_TYPES)).max(5).optional(),
  details: z.record(z.string().max(40)).nullish(),
  note: z.string().max(400).nullish(),
  care: z.string().max(60).nullish(),
  renderNotes: z.string().max(900).nullish(),
  // Wishlist: where you saw it, for how much, and when to be nudged. "Bought
  // it" is owned: true.
  owned: z.boolean().optional(),
  store: z.string().max(120).nullish(),
  seenPrice: z.number().int().min(0).max(10_000_000).nullish(),
  nudgeAt: z.coerce.date().nullish(),
});

/** One piece, yours. */
export async function getItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const item = await prisma.wardrobeItem.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!item) throw new HttpError(404, 'Item not found');
  res.json({ item });
}

export async function updateItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const data = updateSchema.parse(req.body);

  const existing = await prisma.wardrobeItem.findFirst({
    where: { id, userId: req.user.id },
    select: { attrConfidence: true, category: true, subtype: true, material: true, formality: true },
  });
  if (!existing) throw new HttpError(404, 'Item not found');

  // An explicit user edit is authoritative: record full confidence for the
  // edited fields so no later inference overrides them.
  const editedFields = Object.keys(data);
  const attrConfidence = {
    ...((existing.attrConfidence as Record<string, number> | null) ?? {}),
    ...Object.fromEntries(editedFields.map((f) => [f, 1])),
  };

  // Re-derive reasoning attributes when their tag inputs change — unless the
  // user set them directly in the same request (direct edits win).
  const merged = { ...existing, ...data };
  const derived = deriveReasoningAttributes({
    category: merged.category,
    subtype: merged.subtype ?? null,
    material: merged.material ?? null,
    formality: merged.formality ?? null,
  });
  const rederive: Prisma.WardrobeItemUncheckedUpdateInput = {};
  if (data.layerRole === undefined && (data.category || data.subtype !== undefined)) {
    rederive.layerRole = derived.layerRole;
  }
  if (data.warmthValue === undefined && (data.category || data.subtype !== undefined || data.material !== undefined)) {
    rederive.warmthValue = derived.warmthValue;
  }
  if (data.formalityScore === undefined && data.formality !== undefined) {
    rederive.formalityScore = derived.formalityScore;
  }

  // Back from the wash resets the count; buying a wishlist piece carries its
  // seen price into the ledger.
  const side: Prisma.WardrobeItemUncheckedUpdateInput = {};
  if (data.state === 'clean') Object.assign(side, { wearsSinceWash: 0, washedAt: new Date() });
  if (data.owned === true) {
    const w = await prisma.wardrobeItem.findUnique({ where: { id }, select: { owned: true, seenPrice: true, price: true } });
    if (w && !w.owned && w.price == null && w.seenPrice != null) side.price = w.seenPrice;
    side.nudgeAt = null;
  }

  const { details, ...plain } = data;
  await prisma.wardrobeItem.update({
    where: { id },
    data: {
      ...plain,
      ...(details !== undefined ? { details: (details ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull } : {}),
      ...rederive,
      ...side,
      attrConfidence,
    },
  });

  if (data.owned === true) await flagTwin(id).catch(() => undefined);
  const item = await prisma.wardrobeItem.findUnique({ where: { id } });
  res.json({ item });
}

export async function deleteItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);

  const item = await prisma.wardrobeItem.findFirst({
    where: { id, userId: req.user.id },
    select: { imageUrl: true, originalUrl: true },
  });
  if (!item) throw new HttpError(404, 'Item not found');

  await prisma.wardrobeItem.delete({ where: { id } });
  await deleteFile(item.imageUrl);
  if (item.originalUrl && item.originalUrl !== item.imageUrl) {
    await deleteFile(item.originalUrl);
  }
  res.status(204).send();
}

// Move items between the private and public wardrobe in bulk.
const visibilitySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(100),
  visibility: z.enum(['private', 'public']),
});

export async function setVisibility(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { itemIds, visibility } = visibilitySchema.parse(req.body);
  const result = await prisma.wardrobeItem.updateMany({
    where: { id: { in: itemIds }, userId: req.user.id },
    data: { visibility },
  });
  res.json({ updated: result.count });
}

// Only cataloged, available, non-suppressed items are suggestion candidates.
// Wear counts ride along: revealed preference for both the proposer (the LLM
// sees what actually gets worn) and the ranker (most-loved pieces score up).
export type StyleableItem = Awaited<ReturnType<typeof loadStyleableWardrobe>>[number];

export async function loadStyleableWardrobe(userId: string) {
  const profile = await prisma.styleProfile.findUnique({ where: { userId }, select: { styleFor: true } });
  // Your side of the closet: never the other side's pieces; unknown and unisex pass.
  const notForYou = profile?.styleFor === 'female' ? 'mens' : profile?.styleFor === 'male' ? 'womens' : null;
  const [items, logs, polls, tryOns] = await Promise.all([
    prisma.wardrobeItem.findMany({
      where: { userId, owned: true, status: { not: 'processing' }, state: 'clean', suppressed: false, ...(notForYou ? { NOT: { cutFor: notForYou } } : {}) },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.wearLog.findMany({
      where: { userId },
      select: { itemIds: true, suggestedItemIds: true, woreInstead: true },
      take: 500,
      orderBy: { wornOn: 'desc' },
    }),
    prisma.poll.findMany({
      where: { userId },
      include: { votes: { select: { optionId: true } } },
      take: 50,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tryOn.findMany({
      where: { userId, itemIds: { isEmpty: false } },
      select: { imageUrl: true, itemIds: true },
      take: 200,
    }),
  ]);
  if (items.length < MIN_ITEMS_FOR_OUTFIT) {
    throw new HttpError(400, `Add at least ${MIN_ITEMS_FOR_OUTFIT} available wardrobe items first`);
  }
  const wearCounts = new Map<string, number>();
  // Days corrected from a photo teach the most: what was laid out and left
  // on the chair, and what was reached for instead.
  const passedOver = new Map<string, number>();
  const chosenInstead = new Map<string, number>();
  for (const log of logs) {
    for (const id of log.itemIds) wearCounts.set(id, (wearCounts.get(id) ?? 0) + 1);
    if (!log.woreInstead) continue;
    for (const id of log.suggestedItemIds) if (!log.itemIds.includes(id)) passedOver.set(id, (passedOver.get(id) ?? 0) + 1);
    for (const id of log.itemIds) if (!log.suggestedItemIds.includes(id)) chosenInstead.set(id, (chosenInstead.get(id) ?? 0) + 1);
  }

  // Friends' verdicts as a preference signal: a poll's winning option maps
  // back (via the try-on's recorded itemIds) to the garments friends chose.
  const itemsByTryOnUrl = new Map(tryOns.map((t) => [t.imageUrl, t.itemIds]));
  const pollWins = new Map<string, number>();
  for (const poll of polls) {
    if (poll.votes.length === 0) continue;
    const counts: Record<string, number> = {};
    for (const v of poll.votes) counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    // Only a clear winner counts — ties teach nothing.
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) continue;
    const options = poll.options as unknown as { id: string; imageUrl: string }[];
    const winnerUrl = options.find((o) => o.id === sorted[0][0])?.imageUrl;
    for (const id of itemsByTryOnUrl.get(winnerUrl ?? '') ?? []) {
      pollWins.set(id, (pollWins.get(id) ?? 0) + 1);
    }
  }

  return items.map((item) => ({
    ...item,
    wearCount: wearCounts.get(item.id) ?? 0,
    pollWins: pollWins.get(item.id) ?? 0,
    passedOver: passedOver.get(item.id) ?? 0,
    chosenInstead: chosenInstead.get(item.id) ?? 0,
  }));
}

export async function loadRecentWear(userId: string): Promise<RecentWear[]> {
  const since = new Date(Date.now() - 14 * 86_400_000);
  // The last fortnight for repeat avoidance, plus everything ever marked
  // "not this one" so the brief never proposes it again.
  const [recent, disliked] = await Promise.all([
    prisma.wearLog.findMany({
      where: { userId, wornOn: { gte: since } },
      select: { itemIds: true, wornOn: true, rating: true },
      orderBy: { wornOn: 'desc' },
      take: 50,
    }),
    prisma.wearLog.findMany({
      where: { userId, rating: 1, wornOn: { lt: since } },
      select: { itemIds: true, wornOn: true, rating: true },
      orderBy: { wornOn: 'desc' },
      take: 100,
    }),
  ]);
  return [...recent, ...disliked];
}

export interface ValidatedOutfit extends SuggestedOutfit {
  validation: ValidationResult;
}

// LLM proposes, rules validate: hard-failed candidates are dropped (unless
// nothing passes — then the least-bad ones are returned with their violations
// attached so the client can say why they're a stretch), the rest are ranked
// by validator score plus a revealed-preference bonus for well-worn pieces.
export function validateAndRank(
  outfits: SuggestedOutfit[],
  opts: {
    eventType?: EventType;
    weather?: Weather | null;
    recentWear: RecentWear[];
    wearCounts?: Map<string, number>;
    pollWins?: Map<string, number>;
    /** From days corrected by a photo: laid out but not worn, and worn instead. */
    wearSignals?: Map<string, { passedOver: number; chosenInstead: number }>;
  },
): ValidatedOutfit[] {
  const validated = outfits.map((o) => {
    const validation = validateOutfit(o.items, {
      eventType: opts.eventType,
      weather: opts.weather ?? undefined,
      recentWear: opts.recentWear,
    });
    const preferenceBonus = o.items.reduce(
      (sum, item) =>
        sum +
        Math.min(opts.wearCounts?.get(item.id) ?? 0, 5) * 2 +
        // Friend-approved pieces (clear poll wins) get an extra nudge.
        Math.min(opts.pollWins?.get(item.id) ?? 0, 3) * 3 +
        wearSignalBonus(opts.wearSignals?.get(item.id)),
      0,
    );
    return { ...o, validation: { ...validation, score: validation.score + preferenceBonus } };
  });
  const passing = validated.filter((o) => o.validation.ok);
  const pool = passing.length > 0 ? passing : validated;
  return pool.sort((a, b) => b.validation.score - a.validation.score);
}

const outfitSchema = z.object({
  occasion: z.string().min(2).max(300),
  eventType: z.enum(EVENT_TYPES).default('work'),
  // A piece every outfit must be built around ("Goes with", the store verdict).
  pin: z.string().uuid().optional(),
  count: z.number().int().min(1).max(4).optional(),
});

export async function mixAndMatch(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { occasion, eventType, pin, count } = outfitSchema.parse(req.body);
  const items = await loadStyleableWardrobe(req.user.id);
  const recentWear = await loadRecentWear(req.user.id);
  const pinned = pin ? items.find((i) => i.id === pin) : undefined;
  if (pin && !pinned) throw new HttpError(400, 'That piece is not available to style right now');
  const context = `Occasion: ${occasion} (${eventType} setting)` + (pinned ? `. EVERY outfit MUST include the item with id=${pinned.id} (${pinned.subtype ?? pinned.category}).` : '');
  const proposed = await suggestOutfits(items, context, count ?? 2);
  const suggested = pinned ? proposed.filter((o) => o.items.some((i) => i.id === pinned.id)) : proposed;
  const wearCounts = new Map(items.map((i) => [i.id, i.wearCount]));
  const wearSignals = new Map(items.map((i) => [i.id, { passedOver: i.passedOver, chosenInstead: i.chosenInstead }]));
  const pollWins = new Map(items.map((i) => [i.id, i.pollWins]));
  const outfits = validateAndRank(suggested, { eventType, recentWear, wearCounts, pollWins, wearSignals });
  res.json({ outfits });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const packSchema = z
  .object({
    destination: z.string().min(1).max(120),
    startDate: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
    endDate: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
    activities: z.string().max(400).optional(),
  })
  .refine((d) => Date.parse(d.endDate) >= Date.parse(d.startDate), {
    message: 'The trip must end on or after it starts',
  })
  .refine((d) => Date.parse(d.endDate) - Date.parse(d.startDate) <= 21 * 86_400_000, {
    message: 'Trips longer than 21 days are not supported yet',
  });

// Travel packing: a capsule from the real wardrobe + a day-by-day plan +
// a checklist of non-wardrobe essentials.
export async function packForTrip(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { destination, startDate, endDate, activities } = packSchema.parse(req.body);

  const items = await loadStyleableWardrobe(req.user.id);
  const forecast = await getTripForecast(destination, startDate, endDate);
  const plan = await planPacking(items, forecast, { startDate, endDate, activities });

  res.json({ forecast, plan });
}

// POST /wardrobe/pack/look — compose one more distinct outfit from a proposed
// capsule, for adding a second look to a trip day before the trip is saved.
const packLookSchema = z.object({
  capsuleItemIds: z.array(z.string().uuid()).min(2).max(40),
  avoid: z.array(z.array(z.string())).max(12).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
});
export async function packLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { capsuleItemIds, avoid, eventType } = packLookSchema.parse(req.body);
  const capsule = await prisma.wardrobeItem.findMany({ where: { id: { in: capsuleItemIds }, userId: req.user.id } });
  if (capsule.length < 2) throw new HttpError(400, 'Pack a few more pieces first');
  const avoidSets = (avoid ?? []).map((a) => new Set(a));
  const same = (ids: string[]) => avoidSets.some((s) => ids.length === s.size && ids.every((id) => s.has(id)));
  const seen = new Set<string>();
  let best: { itemIds: string[]; score: number } | null = null;
  for (const piece of capsule) {
    for (const o of outfitsAround(piece, capsule, { eventType, limit: 8 })) {
      const key = [...o.itemIds].sort().join('|');
      if (seen.has(key) || same(o.itemIds)) continue;
      seen.add(key);
      if (!best || o.score > best.score) best = o;
    }
  }
  if (!best) throw new HttpError(400, 'The capsule can only make this one outfit');
  const byId = new Map(capsule.map((i) => [i.id, i]));
  res.json({ items: best.itemIds.map((id) => byId.get(id)).filter(Boolean) });
}

// Inline correction (plan §4.3): the user experiences this as complaining
// about a suggestion; we receive it as a labeled correction on the item.
// Adjustments, not overwrites — and explicit user edits are never moved.
const feedbackSchema = z.object({
  signal: z.enum([
    'too-formal',
    'too-casual',
    'too-warm',
    'not-warm-enough',
    'wrong-color',
    'dont-suggest',
  ]),
});

export async function itemFeedback(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const { signal } = feedbackSchema.parse(req.body);

  const item = await prisma.wardrobeItem.findFirst({
    where: { id, userId: req.user.id },
  });
  if (!item) throw new HttpError(404, 'Item not found');

  const conf = (item.attrConfidence as Record<string, number> | null) ?? {};
  const userSet = (field: string) => (conf[field] ?? 0) >= 1;

  const data: Prisma.WardrobeItemUncheckedUpdateInput = {};
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  switch (signal) {
    case 'too-formal':
      if (!userSet('formalityScore') && item.formalityScore != null) {
        data.formalityScore = clamp(item.formalityScore - 1, 1, 5);
      }
      break;
    case 'too-casual':
      if (!userSet('formalityScore') && item.formalityScore != null) {
        data.formalityScore = clamp(item.formalityScore + 1, 1, 5);
      }
      break;
    case 'too-warm':
      if (!userSet('warmthValue') && item.warmthValue != null) {
        data.warmthValue = clamp(item.warmthValue - 1, 0, 10);
      }
      break;
    case 'not-warm-enough':
      if (!userSet('warmthValue') && item.warmthValue != null) {
        data.warmthValue = clamp(item.warmthValue + 1, 0, 10);
      }
      break;
    case 'wrong-color':
      // Wrong data is worse than missing data: drop the color so the engine
      // stops reasoning from it; the user can set the right one any time.
      if (!userSet('primaryColor')) {
        data.primaryColor = null;
        data.colorPalette = Prisma.DbNull;
      }
      break;
    case 'dont-suggest':
      data.suppressed = true;
      break;
  }

  if (Object.keys(data).length === 0) {
    // Nothing to move (user-set field, or no value yet) — still a 200: the
    // feedback was heard even when no adjustment applies.
    res.json({ item, adjusted: false });
    return;
  }

  const updated = await prisma.wardrobeItem.update({ where: { id }, data });
  res.json({ item: updated, adjusted: true });
}

// A ready-to-post marketplace listing draft for an item (usually an orphan).
export async function resaleDraft(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);

  const item = await prisma.wardrobeItem.findFirst({
    where: { id, userId: req.user.id },
  });
  if (!item) throw new HttpError(404, 'Item not found');

  const draft = await draftResaleListing(item);
  res.json({ draft, imageUrl: item.imageUrl });
}

const todaySchema = z.object({
  location: z.string().min(1).max(120),
  eventType: z.enum(EVENT_TYPES).default('work'),
});

export async function whatToWearToday(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { location, eventType } = todaySchema.parse(req.body);
  const items = await loadStyleableWardrobe(req.user.id);
  const recentWear = await loadRecentWear(req.user.id);
  const weather = await getWeather(location);
  const context =
    `Dressing for today's weather in ${weather.location}: ${weather.temperatureC}°C, ` +
    `${weather.description}. The setting is ${eventType}. Choose weather-appropriate items.`;
  const suggested = await suggestOutfits(items, context);
  const wearCounts = new Map(items.map((i) => [i.id, i.wearCount]));
  const wearSignals = new Map(items.map((i) => [i.id, { passedOver: i.passedOver, chosenInstead: i.chosenInstead }]));
  const pollWins = new Map(items.map((i) => [i.id, i.pollWins]));
  const outfits = validateAndRank(suggested, { eventType, weather, recentWear, wearCounts, pollWins, wearSignals });
  res.json({ weather, outfits });
}
