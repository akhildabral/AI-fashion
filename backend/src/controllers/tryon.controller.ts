import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { deleteFile } from '../lib/storage';
import { generateOutfitTryOn, generateTryOn } from '../services/tryon.service';
import { HttpError } from '../middleware/error';

const tryOnSelect = {
  id: true,
  lookId: true,
  imageUrl: true,
  createdAt: true,
} as const;

export async function createTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const lookId = String(req.params.id);

  const [look, user] = await Promise.all([
    prisma.look.findFirst({ where: { id: lookId, userId: req.user.id } }),
    prisma.user.findUnique({ where: { id: req.user.id }, select: { photoPath: true } }),
  ]);

  if (!look) throw new HttpError(404, 'Look not found');
  if (!user?.photoPath) {
    throw new HttpError(400, 'Upload a photo before trying on a look');
  }

  const imageUrl = await generateTryOn(user.photoPath, look.outfit);

  const tryOn = await prisma.tryOn.create({
    data: { userId: req.user.id, lookId, imageUrl },
    select: tryOnSelect,
  });

  res.status(201).json({ tryOn });
}

const outfitTryOnSchema = z.object({
  itemIds: z.array(z.string()).min(1, 'Select at least one item').max(6),
});

export async function createOutfitTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { itemIds } = outfitTryOnSchema.parse(req.body);

  const [user, items] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user.id }, select: { photoPath: true } }),
    prisma.wardrobeItem.findMany({
      where: { id: { in: itemIds }, userId: req.user.id },
      select: { imageUrl: true, category: true, subtype: true, primaryColor: true, material: true, description: true },
    }),
  ]);

  if (!user?.photoPath) throw new HttpError(400, 'Upload a photo before trying on an outfit');
  if (items.length === 0) throw new HttpError(404, 'Wardrobe items not found');

  const imageUrl = await generateOutfitTryOn(user.photoPath, items);

  const tryOn = await prisma.tryOn.create({
    data: { userId: req.user.id, lookId: null, imageUrl },
    select: tryOnSelect,
  });

  res.status(201).json({ tryOn });
}

export async function listTryOns(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const tryOns = await prisma.tryOn.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: tryOnSelect,
  });
  res.json({ tryOns });
}

export async function deleteTryOn(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);

  const tryOn = await prisma.tryOn.findFirst({
    where: { id, userId: req.user.id },
    select: { imageUrl: true },
  });
  if (!tryOn) throw new HttpError(404, 'Try-on not found');

  await prisma.tryOn.delete({ where: { id } });
  await deleteFile(tryOn.imageUrl);
  res.status(204).send();
}
