import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { deleteFile, readStored, saveImageBuffer } from '../lib/storage';
import { enqueue } from '../lib/jobs';
import { extForMime } from '../middleware/upload';
import { HttpError } from '../middleware/error';
import { applyWear, unapplyWear } from '../lib/wear-rules';
import { extractPalette } from '../lib/color';
import { EVENT_TYPES } from '../lib/attributes';
import { env } from '../config/env';
import { detectGarments, deriveReasoningAttributes, tagGarment, type DetectedGarment } from '../services/wardrobe.service';
import { matteGarment } from '../services/cleanup.service';
import { fingerprintOf, matchPiece, type Band, type MatchCandidate } from '../services/closet-match.service';
import { catalogItem, cropToRegion } from './wardrobe.controller';

// "This is what I wore." A photo of the day is read into garments; each one
// is matched against the closet — yours for sure, probably yours, or new —
// and the wearer confirms every row before anything is written. The day's
// wear log then records what was really worn, with the stylist's suggestion
// kept beside it so the ranker can learn from the difference.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 8;
// A garment read out of a photo of the day is a harder read than a re-upload
// (light, drape, a colour called "dark"), and asking "yours?" costs one tap
// where a miss costs a duplicate piece. So the photo asks from a lower line.
const PHOTO_NEAR_AT = 4.5;

export interface PhotoRow {
  index: number;
  /** The garment's crop out of the photo, kept as a file (it may become a piece). */
  cropUrl: string;
  description: string;
  category: string;
  subtype: string | null;
  color: string | null;
  band: Band;
  matches: { itemId: string; score: number; reasons: string[] }[];
}

function noonOf(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

async function readPhoto(jobId: string, buffer: Buffer, mime: string): Promise<void> {
  const job = await prisma.wearPhotoJob.findUnique({ where: { id: jobId }, select: { userId: true } });
  if (!job) return;
  let garments: DetectedGarment[] = [];
  try {
    garments = (await detectGarments(buffer, mime)).slice(0, MAX_ROWS);
  } catch (err) {
    console.error('Wear photo: detection failed:', err instanceof Error ? err.message : err);
  }
  if (garments.length === 0) {
    await prisma.wearPhotoJob.update({ where: { id: jobId }, data: { status: 'ready', rows: [] } });
    return;
  }

  const closet = await prisma.wardrobeItem.findMany({
    where: { userId: job.userId, owned: true, status: 'ready', state: { not: 'retired' } },
    select: {
      id: true, category: true, subtype: true, primaryColor: true, formalityScore: true, warmthValue: true,
      pattern: true, colorPalette: true, fingerprint: true, material: true,
    },
  });
  const candidates: MatchCandidate[] = closet;

  const rows: PhotoRow[] = [];
  for (const [index, g] of garments.entries()) {
    try {
      const crop = await cropToRegion(buffer, g.box);
      const stored = await saveImageBuffer(crop, 'png');
      // The cut-out is what tags, palette and fingerprint are read from —
      // the same ground truth a catalogued piece is measured by.
      const local = env.MATTING_ENABLED ? await matteGarment(crop) : null;
      const readFrom = local?.png ?? crop;
      const tags = await tagGarment(readFrom, 'image/png');
      // The detector saw the whole scene; the tagger only a crop. When they
      // disagree on what kind of thing it is, the scene wins and the crop's
      // type is not trusted either.
      const category = g.category !== 'other' ? g.category : tags.category;
      // Neither reader could call it clothing: a cushion, a bag strap, a shadow.
      if (category === 'other') continue;
      if (tags.category !== category) tags.subtype = null;
      tags.category = category;
      // The same derived numbers a catalogued piece carries; without them a
      // photo of a plain black top scores under the line against that very top.
      const derived = deriveReasoningAttributes(tags);
      const palette = local?.rgba ? extractPalette(local.rgba.data, local.rgba.width, local.rgba.height) : [];
      const fingerprint = await fingerprintOf(readFrom);
      const matches = matchPiece(
        {
          id: `photo-${index}`,
          category: tags.category,
          subtype: tags.subtype,
          primaryColor: tags.primaryColor,
          formalityScore: derived.formalityScore,
          warmthValue: derived.warmthValue,
          pattern: tags.pattern,
          colorPalette: palette,
          fingerprint,
          material: tags.material,
        },
        candidates,
        { limit: 3 },
      );
      rows.push({
        index,
        cropUrl: stored.url,
        description: g.description || tags.description || `${tags.primaryColor ?? ''} ${tags.subtype ?? tags.category}`.trim(),
        category: tags.category,
        subtype: tags.subtype,
        color: tags.primaryColor,
        band: matches[0] ? (matches[0].band !== 'new' ? matches[0].band : matches[0].score >= PHOTO_NEAR_AT ? 'near' : 'new') : 'new',
        matches: matches.filter((m) => m.score >= PHOTO_NEAR_AT).map((m) => ({ itemId: m.candidate.id, score: m.score, reasons: m.reasons })),
      });
    } catch (err) {
      console.error('Wear photo: a garment could not be read:', err instanceof Error ? err.message : err);
    }
  }
  await prisma.wearPhotoJob.update({ where: { id: jobId }, data: { status: 'ready', rows: rows as unknown as Prisma.InputJsonValue } });
}

async function hydrate(userId: string, job: { id: string; date: string; photoUrl: string; status: string; rows: Prisma.JsonValue | null; error: string | null; confirmedLogId: string | null }) {
  const rows = (job.rows as unknown as PhotoRow[] | null) ?? [];
  const ids = [...new Set(rows.flatMap((r) => r.matches.map((m) => m.itemId)))];
  const items = ids.length ? await prisma.wardrobeItem.findMany({ where: { id: { in: ids }, userId } }) : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    id: job.id,
    date: job.date,
    photoUrl: job.photoUrl,
    status: job.status,
    error: job.error,
    confirmedLogId: job.confirmedLogId,
    rows: rows.map((r) => ({
      ...r,
      matches: r.matches.map((m) => ({ ...m, item: byId.get(m.itemId) ?? null })).filter((m) => m.item),
    })),
  };
}

// POST /wear/photo  (multipart: photo, date)
export async function readWearPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  if (!req.file) throw new HttpError(400, 'Attach a photo of the day');
  const date = String((req.body ?? {}).date ?? '');
  if (!DATE_RE.test(date)) throw new HttpError(400, 'Which day? Send date as YYYY-MM-DD');
  const { buffer, mimetype } = req.file;
  const stored = await saveImageBuffer(buffer, extForMime(mimetype));
  const job = await prisma.wearPhotoJob.create({ data: { userId: req.user.id, date, photoUrl: stored.url } });
  enqueue(`wear-photo:${job.id}`, async () => {
    try {
      await readPhoto(job.id, buffer, mimetype);
    } catch (err) {
      console.error('Wear photo failed:', err instanceof Error ? err.message : err);
      await prisma.wearPhotoJob.update({ where: { id: job.id }, data: { status: 'failed', error: 'The photo could not be read. Try one in better light.' } }).catch(() => undefined);
    }
  });
  res.status(202).json({ job: await hydrate(req.user.id, job) });
}

// GET /wear/photo/:id
export async function getWearPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const job = await prisma.wearPhotoJob.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!job) throw new HttpError(404, 'Photo not found');
  res.json({ job: await hydrate(req.user.id, job) });
}

const confirmSchema = z.object({
  rows: z
    .array(
      z.object({
        index: z.number().int().min(0),
        action: z.enum(['use', 'add', 'skip']),
        // 'use': which of your pieces this is.
        itemId: z.string().uuid().optional(),
      }),
    )
    .max(MAX_ROWS),
  // Instead of what the stylist laid out (a correction), or as well as it
  // (an addition, when the day was already logged).
  mode: z.enum(['instead', 'also']).default('instead'),
  eventType: z.enum(EVENT_TYPES).optional(),
});

// POST /wear/photo/:id/confirm
export async function confirmWearPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const userId = req.user.id;
  const body = confirmSchema.parse(req.body);
  const job = await prisma.wearPhotoJob.findFirst({ where: { id: String(req.params.id), userId } });
  if (!job) throw new HttpError(404, 'Photo not found');
  if (job.status !== 'ready') throw new HttpError(400, job.status === 'confirmed' ? 'That photo is already logged' : 'The photo is still being read');
  const rows = (job.rows as unknown as PhotoRow[] | null) ?? [];
  const byIndex = new Map(rows.map((r) => [r.index, r]));

  const useIds: string[] = [];
  const added: { id: string }[] = [];
  for (const d of body.rows) {
    const row = byIndex.get(d.index);
    if (!row) continue;
    if (d.action === 'use') {
      if (!d.itemId) throw new HttpError(400, 'Say which piece it is');
      const owned = await prisma.wardrobeItem.findFirst({ where: { id: d.itemId, userId, owned: true }, select: { id: true } });
      if (!owned) throw new HttpError(400, 'That piece is not in your closet');
      useIds.push(owned.id);
    } else if (d.action === 'add') {
      // The crop becomes a piece of its own, catalogued like any upload.
      const crop = await readStored(row.cropUrl);
      const own = await saveImageBuffer(crop, 'png');
      const item = await prisma.wardrobeItem.create({
        data: {
          userId, imageUrl: own.url, originalUrl: own.url, status: 'processing', category: row.category, description: row.description, cropped: true,
          // The detector saw the whole scene; what kind of thing this is stays
          // settled, whatever a re-read of the small crop says.
          ...(row.category !== 'other' ? { attrConfidence: { category: 1 } } : {}),
        },
      });
      // The crop may hold more than this garment (a blazer worn over a top,
      // a suit): the description is the target, so the studio isolates it.
      enqueue(`catalog:${item.id}`, () => catalogItem(item.id, crop, 'image/png', row.description || undefined));
      added.push({ id: item.id });
    }
  }
  const itemIds = [...new Set([...useIds, ...added.map((a) => a.id)])];
  if (itemIds.length === 0) throw new HttpError(400, 'Nothing to log — keep at least one piece');

  const brief = await prisma.dailyBrief.findUnique({ where: { userId_date: { userId, date: job.date } } });
  const payload = brief?.payload as { itemIds?: string[]; eventType?: string; weather?: { temperatureC: number; description: string; location: string } } | null;
  const suggested = payload?.itemIds ?? [];
  const existing = brief?.wornLogId ? await prisma.wearLog.findFirst({ where: { id: brief.wornLogId, userId } }) : null;
  const sameAsSuggested = suggested.length > 0 && [...suggested].sort().join() === [...itemIds].sort().join();

  let log;
  if (existing && body.mode === 'also') {
    const merged = [...new Set([...existing.itemIds, ...itemIds])];
    await applyWear(userId, itemIds.filter((id) => !existing.itemIds.includes(id)));
    log = await prisma.wearLog.update({
      where: { id: existing.id },
      data: { itemIds: merged, ...(existing.photoUrl ? {} : { photoUrl: job.photoUrl }) },
    });
  } else if (existing) {
    // A correction: the wear comes off what was logged but not worn.
    await unapplyWear(userId, existing.itemIds.filter((id) => !itemIds.includes(id)));
    await applyWear(userId, itemIds.filter((id) => !existing.itemIds.includes(id)));
    log = await prisma.wearLog.update({
      where: { id: existing.id },
      data: {
        itemIds,
        photoUrl: job.photoUrl,
        ...(body.eventType ? { eventType: body.eventType } : {}),
        suggestedItemIds: suggested,
        woreInstead: suggested.length > 0 && !sameAsSuggested,
      },
    });
  } else {
    await applyWear(userId, itemIds);
    log = await prisma.wearLog.create({
      data: {
        userId,
        itemIds,
        wornOn: noonOf(job.date),
        eventType: body.eventType ?? (payload?.eventType as (typeof EVENT_TYPES)[number] | undefined),
        photoUrl: job.photoUrl,
        ...(payload?.weather ? { weather: payload.weather } : {}),
        suggestedItemIds: suggested,
        woreInstead: suggested.length > 0 && !sameAsSuggested,
      },
    });
    if (brief) await prisma.dailyBrief.update({ where: { id: brief.id }, data: { wornLogId: log.id, rest: false } });
  }

  // The crops that became nothing go; the ones that became pieces have their own copy.
  for (const r of rows) await deleteFile(r.cropUrl).catch(() => undefined);
  await prisma.wearPhotoJob.update({ where: { id: job.id }, data: { status: 'confirmed', confirmedLogId: log.id, rows: Prisma.JsonNull } });

  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: log.itemIds }, userId } });
  res.status(201).json({ log: { ...log, items }, added: added.map((a) => a.id), woreInstead: log.woreInstead });
}
