import type { Request, Response } from 'express';
import { z } from 'zod';
import { generateLook } from '../services/stylist.service';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

const generateSchema = z.object({
  occasion: z.string().min(2, 'Please describe the occasion').max(300),
  gender: z.enum(['female', 'male', 'unisex']),
});

export async function generate(req: Request, res: Response) {
  if (!req.user) {
    throw new HttpError(401, 'Not authenticated');
  }

  const { occasion, gender } = generateSchema.parse(req.body);
  const { outfit, rationale, imageUrl } = await generateLook(occasion, gender);

  // Persist the look so it survives sessions.
  const look = await prisma.look.create({
    data: {
      userId: req.user.id,
      occasion,
      gender,
      outfit,
      rationale,
      imageUrl,
    },
    select: {
      id: true,
      occasion: true,
      gender: true,
      outfit: true,
      rationale: true,
      imageUrl: true,
      createdAt: true,
    },
  });

  res.json({ look });
}

export async function listLooks(req: Request, res: Response) {
  if (!req.user) {
    throw new HttpError(401, 'Not authenticated');
  }
  const looks = await prisma.look.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ looks });
}
