import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

export async function listLookbooks(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const lookbooks = await prisma.lookbook.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json({ lookbooks });
}

const createSchema = z.object({ name: z.string().min(1).max(60) });

export async function createLookbook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { name } = createSchema.parse(req.body);
  const lookbook = await prisma.lookbook.create({
    data: { userId: req.user.id, name: name.trim(), tryOnIds: [] },
  });
  res.status(201).json({ lookbook });
}

const toggleSchema = z.object({ tryOnId: z.string().uuid() });

/** Add or remove one render — a simple membership toggle. */
export async function toggleLookbookItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { tryOnId } = toggleSchema.parse(req.body);
  const id = String(req.params.id);

  const lookbook = await prisma.lookbook.findFirst({
    where: { id, userId: req.user.id },
  });
  if (!lookbook) throw new HttpError(404, 'Lookbook not found');
  const owns = await prisma.tryOn.count({ where: { id: tryOnId, userId: req.user.id } });
  if (owns === 0) throw new HttpError(404, 'Render not found');

  const has = lookbook.tryOnIds.includes(tryOnId);
  const updated = await prisma.lookbook.update({
    where: { id },
    data: {
      tryOnIds: has
        ? lookbook.tryOnIds.filter((t) => t !== tryOnId)
        : [...lookbook.tryOnIds, tryOnId],
    },
  });
  res.json({ lookbook: updated, added: !has });
}

export async function deleteLookbook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const result = await prisma.lookbook.deleteMany({
    where: { id: String(req.params.id), userId: req.user.id },
  });
  if (result.count === 0) throw new HttpError(404, 'Lookbook not found');
  res.status(204).send();
}
