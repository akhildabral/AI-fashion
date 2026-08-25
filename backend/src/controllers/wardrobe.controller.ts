import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { deleteFile, urlForFilename } from '../lib/storage';
import { tagGarment, suggestOutfits } from '../services/wardrobe.service';
import { getWeather } from '../services/weather.service';
import { HttpError } from '../middleware/error';

const MIN_ITEMS_FOR_OUTFIT = 2;

export async function addItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  if (!req.file) throw new HttpError(400, 'No image file provided');

  let tags;
  try {
    tags = await tagGarment(req.file.filename);
  } catch (err) {
    // Don't leave an orphaned upload if tagging fails.
    deleteFile(req.file.filename);
    throw err;
  }

  const item = await prisma.wardrobeItem.create({
    data: {
      userId: req.user.id,
      imageUrl: urlForFilename(req.file.filename),
      ...tags,
    },
  });
  res.status(201).json({ item });
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
});

export async function updateItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const data = updateSchema.parse(req.body);

  const result = await prisma.wardrobeItem.updateMany({
    where: { id, userId: req.user.id },
    data,
  });
  if (result.count === 0) throw new HttpError(404, 'Item not found');

  const item = await prisma.wardrobeItem.findUnique({ where: { id } });
  res.json({ item });
}

export async function deleteItem(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);

  const item = await prisma.wardrobeItem.findFirst({
    where: { id, userId: req.user.id },
    select: { imageUrl: true },
  });
  if (!item) throw new HttpError(404, 'Item not found');

  await prisma.wardrobeItem.delete({ where: { id } });
  deleteFile(item.imageUrl);
  res.status(204).send();
}

async function loadWardrobe(userId: string) {
  const items = await prisma.wardrobeItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (items.length < MIN_ITEMS_FOR_OUTFIT) {
    throw new HttpError(400, `Add at least ${MIN_ITEMS_FOR_OUTFIT} wardrobe items first`);
  }
  return items;
}

const outfitSchema = z.object({ occasion: z.string().min(2).max(300) });

export async function mixAndMatch(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { occasion } = outfitSchema.parse(req.body);
  const items = await loadWardrobe(req.user.id);
  const outfits = await suggestOutfits(items, `Occasion: ${occasion}`);
  res.json({ outfits });
}

const todaySchema = z.object({ location: z.string().min(1).max(120) });

export async function whatToWearToday(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const { location } = todaySchema.parse(req.body);
  const items = await loadWardrobe(req.user.id);
  const weather = await getWeather(location);
  const context = `Dressing for today's weather in ${weather.location}: ${weather.temperatureC}°C, ${weather.description}. Choose weather-appropriate items.`;
  const outfits = await suggestOutfits(items, context);
  res.json({ weather, outfits });
}
