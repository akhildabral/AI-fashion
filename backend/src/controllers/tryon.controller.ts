import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateTryOn } from '../services/tryon.service';
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
