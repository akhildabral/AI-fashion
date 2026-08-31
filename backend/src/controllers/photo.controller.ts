import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { deleteFile, saveImageBuffer, urlForFilename } from '../lib/storage';
import { extForMime } from '../middleware/upload';
import { HttpError } from '../middleware/error';

export async function uploadPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  if (!req.file) throw new HttpError(400, 'No photo file provided');

  const stored = await saveImageBuffer(req.file.buffer, extForMime(req.file.mimetype));

  // Replace any existing photo, cleaning up the old file.
  const existing = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { photoPath: true },
  });
  if (existing?.photoPath) await deleteFile(existing.photoPath);

  await prisma.user.update({
    where: { id: req.user.id },
    data: { photoPath: stored.key },
  });

  res.status(201).json({ photoUrl: stored.url });
}

export async function getPhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { photoPath: true },
  });
  res.json({ photoUrl: user?.photoPath ? urlForFilename(user.photoPath) : null });
}

export async function deletePhoto(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { photoPath: true },
  });
  if (user?.photoPath) {
    await deleteFile(user.photoPath);
    await prisma.user.update({ where: { id: req.user.id }, data: { photoPath: null } });
  }
  res.status(204).send();
}
