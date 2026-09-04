import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { deleteFile, saveImageBuffer, urlForFilename } from '../lib/storage';
import { extForMime, stripMetadata } from '../middleware/upload';
import { HttpError } from '../middleware/error';

// Your reflections: up to three photos, one active. Consent is recorded on
// each. Deleting a photo deletes the renders made from it; User.photoPath
// stays the pointer to the active one so every caller keeps working.

const MAX_PHOTOS = 3;
const CONSENT_VERSION = 'v1';

async function listFor(userId: string) {
  const [user, photos] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { photoPath: true } }),
    prisma.userPhoto.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ]);
  return {
    photoUrl: user?.photoPath ? urlForFilename(user.photoPath) : null,
    photos: photos.map((p) => ({ id: p.id, url: urlForFilename(p.path), active: p.path === user?.photoPath, consentAt: p.consentAt, createdAt: p.createdAt })),
    max: MAX_PHOTOS,
  };
}

export async function uploadPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  if (!req.file) throw new HttpError(400, 'No photo file provided');
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  if (body.consent !== 'true') throw new HttpError(400, 'Consent is needed before a photo is stored');

  const count = await prisma.userPhoto.count({ where: { userId: req.user.id } });
  if (count >= MAX_PHOTOS) throw new HttpError(400, `Three reflections at most — let one go first`);

  // A body photo carries the most sensitive metadata of all (where and when
  // it was taken): it is stored without any.
  const clean = await stripMetadata(req.file.buffer, req.file.mimetype);
  const stored = await saveImageBuffer(clean, extForMime(req.file.mimetype));
  await prisma.userPhoto.create({ data: { userId: req.user.id, path: stored.key, consentAt: new Date(), consentVersion: CONSENT_VERSION } });
  // A new photo becomes the one you dress.
  await prisma.user.update({ where: { id: req.user.id }, data: { photoPath: stored.key } });

  res.status(201).json({ ...(await listFor(req.user.id)), photoUrl: stored.url });
}

export async function getPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  // Accounts from before reflections: their one photo becomes the first.
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { photoPath: true } });
  if (user?.photoPath) {
    const known = await prisma.userPhoto.findFirst({ where: { userId: req.user.id, path: user.photoPath } });
    if (!known) await prisma.userPhoto.create({ data: { userId: req.user.id, path: user.photoPath, consentAt: new Date(0), consentVersion: 'legacy' } });
  }
  res.json(await listFor(req.user.id));
}

// POST /photo/:id/use — this is the one to dress.
export async function usePhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const p = await prisma.userPhoto.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!p) throw new HttpError(404, 'Photo not found');
  await prisma.user.update({ where: { id: req.user.id }, data: { photoPath: p.path } });
  res.json(await listFor(req.user.id));
}

// DELETE /photo/:id — the photo and every render made from it go together.
export async function deleteOnePhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const p = await prisma.userPhoto.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!p) throw new HttpError(404, 'Photo not found');
  const renders = await prisma.tryOn.findMany({ where: { userId: req.user.id, photoPath: p.path }, select: { id: true, imageUrl: true } });
  await prisma.tryOn.deleteMany({ where: { id: { in: renders.map((r) => r.id) } } });
  for (const r of renders) if (r.imageUrl) await deleteFile(r.imageUrl).catch(() => undefined);
  await prisma.userPhoto.delete({ where: { id: p.id } });
  await deleteFile(p.path).catch(() => undefined);
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { photoPath: true } });
  if (user?.photoPath === p.path) {
    const next = await prisma.userPhoto.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    await prisma.user.update({ where: { id: req.user.id }, data: { photoPath: next?.path ?? null } });
  }
  res.json({ removedRenders: renders.length, ...(await listFor(req.user.id)) });
}

// DELETE /photo — everything: every reflection and every render.
export async function deletePhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const photos = await prisma.userPhoto.findMany({ where: { userId: req.user.id } });
  const renders = await prisma.tryOn.findMany({ where: { userId: req.user.id, lookId: null }, select: { id: true, imageUrl: true } });
  await prisma.tryOn.deleteMany({ where: { id: { in: renders.map((r) => r.id) } } });
  for (const r of renders) if (r.imageUrl) await deleteFile(r.imageUrl).catch(() => undefined);
  await prisma.userPhoto.deleteMany({ where: { userId: req.user.id } });
  for (const p of photos) await deleteFile(p.path).catch(() => undefined);
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { photoPath: true } });
  if (user?.photoPath && !photos.some((p) => p.path === user.photoPath)) await deleteFile(user.photoPath).catch(() => undefined);
  await prisma.user.update({ where: { id: req.user.id }, data: { photoPath: null } });
  res.status(204).send();
}
