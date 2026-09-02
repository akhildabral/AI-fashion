import type { Request, Response } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { deleteFile } from '../lib/storage';
import { sendPush } from '../lib/push';
import { defaultTryOnMode, generateOutfitTryOn, generateTryOn } from '../services/tryon.service';
import { HttpError } from '../middleware/error';

// The Mirror's renders are jobs. POST returns the job at once (queued); the
// render runs in the background; the glass polls GET /tryons/:id. The same
// pieces on the same photo come back from the cache, instantly and free.
// A failed or reported render gives its usage event back.

const tryOnSelect = {
  id: true,
  lookId: true,
  imageUrl: true,
  itemIds: true,
  status: true,
  error: true,
  mode: true,
  refunded: true,
  retryOf: true,
  reportedAt: true,
  createdAt: true,
} as const;

const itemSelect = { id: true, imageUrl: true, category: true, subtype: true, primaryColor: true, material: true, pattern: true, description: true, renderNotes: true } as const;

async function refund(usageEventId: string | null | undefined, tryOnId: string) {
  if (!usageEventId) return;
  await prisma.usageEvent.deleteMany({ where: { id: usageEventId } }).catch(() => undefined);
  await prisma.tryOn.update({ where: { id: tryOnId }, data: { refunded: true, usageEventId: null } }).catch(() => undefined);
}

async function hydrate(userId: string, rows: { itemIds: string[] }[]) {
  const ids = [...new Set(rows.flatMap((r) => r.itemIds))];
  if (ids.length === 0) return new Map<string, { id: string; imageUrl: string; category: string; subtype: string | null }>();
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: ids }, userId }, select: { id: true, imageUrl: true, category: true, subtype: true } });
  return new Map(items.map((i) => [i.id, i]));
}

function withItems<T extends { itemIds: string[] }>(row: T, byId: Map<string, { id: string; imageUrl: string; category: string; subtype: string | null }>) {
  return { ...row, items: row.itemIds.map((i) => byId.get(i)).filter(Boolean) };
}

/** Run the render for a queued job; never throws. */
async function runJob(tryOnId: string) {
  const job = await prisma.tryOn.findUnique({ where: { id: tryOnId } });
  if (!job || job.status !== 'queued') return;
  await prisma.tryOn.update({ where: { id: tryOnId }, data: { status: 'rendering' } });
  try {
    const [user, items] = await Promise.all([
      prisma.user.findUnique({ where: { id: job.userId }, select: { photoPath: true, id: true } }),
      prisma.wardrobeItem.findMany({ where: { id: { in: job.itemIds }, userId: job.userId }, select: itemSelect }),
    ]);
    if (!user?.photoPath) throw new HttpError(400, 'Upload a photo before trying on an outfit');
    if (job.lookId) {
      // An inspiration look: dressed from its pieces' rendering lines.
      const look = await prisma.look.findUnique({ where: { id: job.lookId }, select: { outfit: true } });
      if (!look) throw new HttpError(404, 'Look not found');
      const url = await generateTryOn(user.photoPath, look.outfit);
      await prisma.tryOn.update({ where: { id: tryOnId }, data: { status: 'ready', imageUrl: url, error: null } });
    } else {
      const ordered = job.itemIds.map((id) => items.find((i) => i.id === id)).filter((i): i is (typeof items)[number] => !!i);
      const r = await generateOutfitTryOn(user.photoPath, ordered, (job.mode as 'references' | 'text') ?? defaultTryOnMode());
      await prisma.tryOn.update({ where: { id: tryOnId }, data: { status: 'ready', imageUrl: r.url, prompt: r.prompt, error: null } });
    }
    // Tell them, if they left.
    const subs = await prisma.pushSubscription.findMany({ where: { userId: job.userId }, take: 5 });
    for (const d of subs) void sendPush(d, { title: 'Your render is ready', body: 'The Mirror has you dressed. Tap to look.', url: `/mirror?render=${tryOnId}`, tag: `render-${tryOnId}` }).catch(() => undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Render failed';
    await prisma.tryOn.update({ where: { id: tryOnId }, data: { status: 'failed', error: message } }).catch(() => undefined);
    await refund(job.usageEventId, tryOnId);
  }
}

export async function createTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const lookId = String(req.params.id);
  const [look, user] = await Promise.all([
    prisma.look.findFirst({ where: { id: lookId, userId: req.user.id } }),
    prisma.user.findUnique({ where: { id: req.user.id }, select: { photoPath: true } }),
  ]);
  if (!look) throw new HttpError(404, 'Look not found');
  if (!user?.photoPath) throw new HttpError(400, 'Upload a photo before trying on a look');
  // Same look, same photo: the render already made, free.
  const model = process.env.IMAGE_MODEL ?? 'default';
  const key = createHash('sha1').update([user.photoPath, `look:${lookId}`, model].join('|')).digest('hex');
  const cached = await prisma.tryOn.findFirst({ where: { userId: req.user.id, key, status: 'ready', reportedAt: null }, orderBy: { createdAt: 'desc' }, select: tryOnSelect });
  if (cached) {
    if (req.usageEventId) await prisma.usageEvent.deleteMany({ where: { id: req.usageEventId } }).catch(() => undefined);
    res.json({ tryOn: { ...cached, items: [] }, cached: true });
    return;
  }
  const tryOn = await prisma.tryOn.create({
    data: { userId: req.user.id, lookId, imageUrl: '', itemIds: [], status: 'queued', mode: 'look', model, key, photoPath: user.photoPath, usageEventId: req.usageEventId ?? null },
    select: tryOnSelect,
  });
  void runJob(tryOn.id);
  res.status(202).json({ tryOn: { ...tryOn, items: [] }, cached: false });
}

const outfitTryOnSchema = z.object({
  itemIds: z.array(z.string()).min(1, 'Select at least one item').max(6),
  // Skip the cache and render again (a "try again").
  fresh: z.boolean().optional(),
});

function cacheKey(photoPath: string, itemIds: string[], mode: string, model: string) {
  return createHash('sha1').update([photoPath, [...itemIds].sort().join(','), mode, model].join('|')).digest('hex');
}

// POST /wardrobe/tryon — queue a render (or hand back the cached one).
export async function createOutfitTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { itemIds, fresh } = outfitTryOnSchema.parse(req.body);
  const [user, items] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user.id }, select: { photoPath: true } }),
    prisma.wardrobeItem.findMany({ where: { id: { in: itemIds }, userId: req.user.id }, select: { id: true } }),
  ]);
  if (!user?.photoPath) throw new HttpError(400, 'Upload a photo before trying on an outfit');
  if (items.length === 0) throw new HttpError(404, 'Wardrobe items not found');
  const ids = itemIds.filter((id) => items.some((i) => i.id === id));
  const mode = defaultTryOnMode();
  const model = process.env.IMAGE_MODEL ?? 'default';
  const key = cacheKey(user.photoPath, ids, mode, model);

  if (!fresh) {
    const cached = await prisma.tryOn.findFirst({ where: { userId: req.user.id, key, status: 'ready', reportedAt: null }, orderBy: { createdAt: 'desc' }, select: tryOnSelect });
    if (cached) {
      // Same pieces, same photo: no call, no charge.
      if (req.usageEventId) await prisma.usageEvent.deleteMany({ where: { id: req.usageEventId } }).catch(() => undefined);
      const byId = await hydrate(req.user.id, [cached]);
      res.json({ tryOn: withItems(cached, byId), cached: true });
      return;
    }
  }

  const tryOn = await prisma.tryOn.create({
    data: { userId: req.user.id, lookId: null, imageUrl: '', itemIds: ids, status: 'queued', mode, model, key, photoPath: user.photoPath, usageEventId: req.usageEventId ?? null },
    select: tryOnSelect,
  });
  void runJob(tryOn.id);
  const byId = await hydrate(req.user.id, [tryOn]);
  res.status(202).json({ tryOn: withItems(tryOn, byId), cached: false });
}

// GET /tryons/:id — the glass polls this.
export async function getTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const row = await prisma.tryOn.findFirst({ where: { id: String(req.params.id), userId: req.user.id }, select: tryOnSelect });
  if (!row) throw new HttpError(404, 'Try-on not found');
  const byId = await hydrate(req.user.id, [row]);
  res.json({ tryOn: withItems(row, byId) });
}

// POST /tryons/:id/retry — "Not right? Try again": free once per render.
export async function retryTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const prev = await prisma.tryOn.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!prev) throw new HttpError(404, 'Try-on not found');
  if (prev.retryOf) throw new HttpError(400, 'That one was already a second try — render it fresh from the rail if you want another');
  if (prev.status === 'rendering' || prev.status === 'queued') throw new HttpError(400, 'Still rendering');
  const again = await prisma.tryOn.create({
    data: { userId: req.user.id, lookId: null, imageUrl: '', itemIds: prev.itemIds, status: 'queued', mode: prev.mode, model: prev.model, key: prev.key, photoPath: prev.photoPath, retryOf: prev.id, usageEventId: null },
    select: tryOnSelect,
  });
  await prisma.tryOn.update({ where: { id: prev.id }, data: { reportedAt: new Date() } });
  void runJob(again.id);
  const byId = await hydrate(req.user.id, [again]);
  res.status(202).json({ tryOn: withItems(again, byId) });
}

// POST /tryons/:id/report — "not my clothes": give the render back.
export async function reportTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const row = await prisma.tryOn.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!row) throw new HttpError(404, 'Try-on not found');
  if (!row.reportedAt) {
    await prisma.tryOn.update({ where: { id: row.id }, data: { reportedAt: new Date() } });
    if (!row.refunded) await refund(row.usageEventId, row.id);
  }
  res.json({ ok: true, refunded: true });
}

export async function listTryOns(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const rows = await prisma.tryOn.findMany({ where: { userId: req.user.id, status: { not: 'failed' } }, orderBy: { createdAt: 'desc' }, take: 100, select: tryOnSelect });
  const byId = await hydrate(req.user.id, rows);
  res.json({ tryOns: rows.map((r) => withItems(r, byId)) });
}

export async function deleteTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const tryOn = await prisma.tryOn.findFirst({ where: { id, userId: req.user.id }, select: { imageUrl: true } });
  if (!tryOn) throw new HttpError(404, 'Try-on not found');
  await prisma.tryOn.delete({ where: { id } });
  // Lookbooks let go of it too.
  const books = await prisma.lookbook.findMany({ where: { userId: req.user.id, tryOnIds: { has: id } }, select: { id: true, tryOnIds: true } });
  for (const b of books) await prisma.lookbook.update({ where: { id: b.id }, data: { tryOnIds: b.tryOnIds.filter((x) => x !== id) } });
  if (tryOn.imageUrl) await deleteFile(tryOn.imageUrl).catch(() => undefined);
  res.status(204).send();
}
