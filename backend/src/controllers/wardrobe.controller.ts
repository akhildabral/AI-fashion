import type { Request, Response } from 'express';
import { z } from 'zod';
import sharp from 'sharp';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { deleteFile, keyFromStored, mimeForKey, readStored, saveImageBuffer } from '../lib/storage';
import { enqueue } from '../lib/jobs';
import { extForMime } from '../middleware/upload';
import {
  detectGarments,
  deriveReasoningAttributes,
  suggestOutfits,
  tagGarment,
  type DetectedGarment,
  type SuggestedOutfit,
} from '../services/wardrobe.service';
import { cleanGarmentImage, generativeCleanupAvailable } from '../services/cleanup.service';
import { getWeather, type Weather } from '../services/weather.service';
import {
  validateOutfit,
  type RecentWear,
  type ValidationResult,
} from '../services/validator.service';
import { extractPalette } from '../lib/color';
import { EVENT_TYPES, ITEM_STATES, type EventType } from '../lib/attributes';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';

const MIN_ITEMS_FOR_OUTFIT = 2;

// Background cataloging: matting → palette → vision tagging → derived
// attributes. The upload response never waits for any of this — that's what
// makes burst capture possible.
// Crop a detected garment's region (normalized box, with a generous margin)
// so extraction and tagging see that item dominating the frame instead of the
// whole multi-item scene. Falls back to the full photo on any doubt.
async function cropToRegion(
  image: Buffer,
  box: { x: number; y: number; w: number; h: number },
): Promise<Buffer> {
  try {
    if (box.w <= 0.02 || box.h <= 0.02 || box.w * box.h > 0.95) return image;
    const meta = await sharp(image).rotate().metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return image;
    const margin = 0.15;
    const left = Math.max(0, Math.floor((box.x - box.w * margin) * W));
    const top = Math.max(0, Math.floor((box.y - box.h * margin) * H));
    const width = Math.min(W - left, Math.ceil(box.w * (1 + 2 * margin) * W));
    const height = Math.min(H - top, Math.ceil(box.h * (1 + 2 * margin) * H));
    if (width < 32 || height < 32) return image;
    return await sharp(image).rotate().extract({ left, top, width, height }).png().toBuffer();
  } catch {
    return image;
  }
}

async function catalogItem(
  itemId: string,
  image: Buffer,
  mime: string,
  target?: string,
  region?: { x: number; y: number; w: number; h: number },
): Promise<void> {
  if (region) {
    image = await cropToRegion(image, region);
    mime = 'image/png';
  }
  let imageForTagging = image;
  let mimeForTagging = mime;
  let newImageUrl: string | null = null;
  let update: Prisma.WardrobeItemUncheckedUpdateInput = {};

  if (env.MATTING_ENABLED) {
    const cleaned = await cleanGarmentImage(image, mime, target);
    if (cleaned) {
      const stored = await saveImageBuffer(cleaned.png, 'png');
      newImageUrl = stored.url;
      update.imageUrl = stored.url;
      if (cleaned.rgba) {
        const palette = extractPalette(cleaned.rgba.data, cleaned.rgba.width, cleaned.rgba.height);
        if (palette.length > 0) update.colorPalette = palette as unknown as Prisma.InputJsonValue;
      }
      // Tag from the cutout — no background clutter to confuse the model.
      imageForTagging = cleaned.png;
      mimeForTagging = 'image/png';
    }
  }

  const previous = await prisma.wardrobeItem.findUnique({
    where: { id: itemId },
    select: { imageUrl: true, originalUrl: true },
  });
  // The item may have been deleted while processing.
  if (!previous) {
    if (newImageUrl) await deleteFile(newImageUrl);
    return;
  }

  try {
    const tags = await tagGarment(imageForTagging, mimeForTagging);
    const { attrConfidence, ...tagFields } = tags;
    update = {
      ...update,
      ...tagFields,
      ...deriveReasoningAttributes(tags),
      attrConfidence,
      status: 'ready',
    };
  } catch (err) {
    // Keep the item (and its cutout, if any); the user can tag it manually.
    console.error('Garment tagging failed:', err instanceof Error ? err.message : err);
    update.status = 'failed';
  }

  await prisma.wardrobeItem.update({ where: { id: itemId }, data: update });
  // Clean up a superseded cutout — but never the pristine original.
  if (
    newImageUrl &&
    previous.imageUrl !== newImageUrl &&
    previous.imageUrl !== previous.originalUrl
  ) {
    await deleteFile(previous.imageUrl);
  }
}

export async function addItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  if (!req.file) throw new HttpError(400, 'No image file provided');

  const { buffer, mimetype } = req.file;
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
        },
      });
      const target = garments.length > 1 || garment.description ? garment.description : undefined;
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
    select: { imageUrl: true, originalUrl: true, description: true, subtype: true, category: true },
  });
  if (!item) throw new HttpError(404, 'Item not found');

  // Always reprocess from the pristine upload when it exists.
  const source = item.originalUrl ?? item.imageUrl;
  let image: Buffer;
  try {
    image = await readStored(source);
  } catch {
    throw new HttpError(400, 'The item image could not be found');
  }

  const updated = await prisma.wardrobeItem.update({
    where: { id },
    data: { status: 'processing' },
  });
  // Name the garment so extraction stays targeted — the original photo may
  // contain other items (or a person wearing them).
  const target = item.description ?? item.subtype ?? item.category;
  enqueue(`recatalog:${id}`, () =>
    catalogItem(id, image, mimeForKey(keyFromStored(source)), target || undefined),
  );

  res.json({ item: updated });
}

export async function listItems(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const items = await prisma.wardrobeItem.findMany({
    where: { userId: req.user.id },
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
  layerRole: z.enum(['base', 'mid', 'outer', 'bottom', 'footwear', 'accessory', 'one-piece']).nullish(),
  warmthValue: z.number().int().min(0).max(10).nullish(),
  formalityScore: z.number().int().min(1).max(5).nullish(),
});

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

  await prisma.wardrobeItem.update({
    where: { id },
    data: { ...data, ...rederive, attrConfidence },
  });

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

// Only cataloged, available items are candidates for suggestions.
async function loadStyleableWardrobe(userId: string) {
  const items = await prisma.wardrobeItem.findMany({
    where: { userId, status: { not: 'processing' }, state: 'clean' },
    orderBy: { createdAt: 'desc' },
  });
  if (items.length < MIN_ITEMS_FOR_OUTFIT) {
    throw new HttpError(400, `Add at least ${MIN_ITEMS_FOR_OUTFIT} available wardrobe items first`);
  }
  return items;
}

async function loadRecentWear(userId: string): Promise<RecentWear[]> {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const logs = await prisma.wearLog.findMany({
    where: { userId, wornOn: { gte: since } },
    select: { itemIds: true, wornOn: true },
    orderBy: { wornOn: 'desc' },
    take: 50,
  });
  return logs;
}

export interface ValidatedOutfit extends SuggestedOutfit {
  validation: ValidationResult;
}

// LLM proposes, rules validate: hard-failed candidates are dropped (unless
// nothing passes — then the least-bad ones are returned with their violations
// attached so the client can say why they're a stretch), the rest are ranked.
function validateAndRank(
  outfits: SuggestedOutfit[],
  opts: { eventType?: EventType; weather?: Weather | null; recentWear: RecentWear[] },
): ValidatedOutfit[] {
  const validated = outfits.map((o) => ({
    ...o,
    validation: validateOutfit(o.items, {
      eventType: opts.eventType,
      weather: opts.weather ?? undefined,
      recentWear: opts.recentWear,
    }),
  }));
  const passing = validated.filter((o) => o.validation.ok);
  const pool = passing.length > 0 ? passing : validated;
  return pool.sort((a, b) => b.validation.score - a.validation.score);
}

const outfitSchema = z.object({
  occasion: z.string().min(2).max(300),
  eventType: z.enum(EVENT_TYPES).default('work'),
});

export async function mixAndMatch(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { occasion, eventType } = outfitSchema.parse(req.body);
  const items = await loadStyleableWardrobe(req.user.id);
  const recentWear = await loadRecentWear(req.user.id);
  const suggested = await suggestOutfits(items, `Occasion: ${occasion} (${eventType} setting)`);
  const outfits = validateAndRank(suggested, { eventType, recentWear });
  res.json({ outfits });
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
  const outfits = validateAndRank(suggested, { eventType, weather, recentWear });
  res.json({ weather, outfits });
}
