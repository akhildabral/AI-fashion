import type { Request, Response } from 'express';
import { z } from 'zod';
import { generateLooks } from '../services/stylist.service';
import { getProfile } from '../services/profile.service';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

const generateSchema = z.object({
  occasion: z.string().min(2, 'Please describe the occasion').max(300),
  gender: z.enum(['female', 'male', 'unisex']),
});

const lookSelect = {
  id: true,
  occasion: true,
  gender: true,
  outfit: true,
  rationale: true,
  imageUrl: true,
  favorite: true,
  createdAt: true,
} as const;

export async function generate(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');

  const { occasion, gender } = generateSchema.parse(req.body);

  // Personalize using the user's saved style profile (may be null).
  const profile = await getProfile(req.user.id);
  const generated = await generateLooks(occasion, gender, profile);

  // Persist every generated look so it survives sessions.
  const looks = await Promise.all(
    generated.map((look) =>
      prisma.look.create({
        data: {
          userId: req.user!.id,
          occasion,
          gender,
          outfit: look.outfit,
          rationale: look.rationale,
          imageUrl: look.imageUrl,
        },
        select: lookSelect,
      }),
    ),
  );

  res.json({ looks });
}

export async function listLooks(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const looks = await prisma.look.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: lookSelect,
  });
  res.json({ looks });
}

const favoriteSchema = z.object({ favorite: z.boolean() });

export async function setFavorite(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const { favorite } = favoriteSchema.parse(req.body);

  // Scope the update to the owner so users can't touch others' looks.
  const result = await prisma.look.updateMany({
    where: { id, userId: req.user.id },
    data: { favorite },
  });
  if (result.count === 0) throw new HttpError(404, 'Look not found');

  const look = await prisma.look.findUnique({ where: { id }, select: lookSelect });
  res.json({ look });
}

export async function deleteLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const result = await prisma.look.deleteMany({
    where: { id, userId: req.user.id },
  });
  if (result.count === 0) throw new HttpError(404, 'Look not found');
  res.status(204).send();
}
