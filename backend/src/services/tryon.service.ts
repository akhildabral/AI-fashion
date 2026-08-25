import fs from 'node:fs';
import path from 'node:path';
import { toFile } from 'openai';
import { openai } from '../lib/openai';
import { env } from '../config/env';
import { absPathForFilename, saveBase64Image } from '../lib/storage';
import { HttpError } from '../middleware/error';

interface OutfitItems {
  top?: string;
  bottom?: string;
  outerwear?: string;
  footwear?: string;
  accessories?: string[];
}

function mimeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function describeOutfit(outfit: unknown): string {
  const items = (outfit as { items?: OutfitItems } | null)?.items ?? {};
  const parts = [
    items.top && `top: ${items.top}`,
    items.bottom && `bottom: ${items.bottom}`,
    items.outerwear && `outerwear: ${items.outerwear}`,
    items.footwear && `footwear: ${items.footwear}`,
    items.accessories?.length && `accessories: ${items.accessories.join(', ')}`,
  ].filter(Boolean);
  return parts.join('; ');
}

// Render the given outfit onto the user's photo via image editing.
// Structured as a single function so a dedicated try-on API (FASHN, Replicate
// IDM-VTON, etc.) can replace the OpenAI call here without touching callers.
export async function generateTryOn(photoFilename: string, outfit: unknown): Promise<string> {
  const absPath = absPathForFilename(photoFilename);
  if (!fs.existsSync(absPath)) {
    throw new HttpError(400, 'Your uploaded photo could not be found; please re-upload it');
  }

  const prompt =
    'Edit this photograph so the same person is wearing the following outfit, ' +
    'while keeping their face, body shape, skin tone, hair, and pose unchanged. ' +
    `Outfit — ${describeOutfit(outfit)}. Produce a realistic, full-body fashion photograph.`;

  const ext = path.extname(photoFilename).toLowerCase();
  const mime =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/png';

  try {
    const image = await openai.images.edit({
      model: env.IMAGE_MODEL,
      // Pass a filename + type so the API detects the mimetype correctly.
      image: await toFile(fs.createReadStream(absPath), path.basename(photoFilename), {
        type: mime,
      }),
      prompt,
      size: '1024x1024',
      ...(env.IMAGE_MODEL.startsWith('gpt-image') ? { quality: env.IMAGE_QUALITY } : {}),
    });

    const first = image.data?.[0];
    if (first?.b64_json) return saveBase64Image(first.b64_json, 'png').url;
    if (first?.url) return first.url;
    throw new HttpError(502, 'Try-on generation returned no image');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : 'Try-on generation failed';
    throw new HttpError(502, message);
  }
}

export interface TryOnItem {
  imageUrl: string;
  category: string;
  subtype: string | null;
}

// Render the user's photo wearing a set of their OWN wardrobe garments, using
// the actual item photos as references (multi-image edit) for higher fidelity.
export async function generateOutfitTryOn(
  photoFilename: string,
  items: TryOnItem[],
): Promise<string> {
  const personAbs = absPathForFilename(photoFilename);
  if (!fs.existsSync(personAbs)) {
    throw new HttpError(400, 'Your uploaded photo could not be found; please re-upload it');
  }

  const personFile = await toFile(fs.createReadStream(personAbs), path.basename(photoFilename), {
    type: mimeFor(photoFilename),
  });

  const itemFiles = await Promise.all(
    items.map((it) => {
      const abs = absPathForFilename(it.imageUrl);
      if (!fs.existsSync(abs)) {
        throw new HttpError(400, 'A wardrobe item image could not be found');
      }
      return toFile(fs.createReadStream(abs), path.basename(it.imageUrl), {
        type: mimeFor(it.imageUrl),
      });
    }),
  );

  const roles = items
    .map((it, i) => `image ${i + 2} = ${it.category}${it.subtype ? ` (${it.subtype})` : ''}`)
    .join(', ');
  const prompt =
    'The first image shows a person. The following images each show one clothing item ' +
    `they own (${roles}). Redraw the person wearing ALL of these exact garments together ` +
    'as one complete, cohesive outfit — keep their face, body shape, skin tone, hair, and ' +
    'pose unchanged, and reproduce each garment’s real color, pattern, and shape. ' +
    'Realistic, full-body fashion photograph.';

  try {
    const image = await openai.images.edit({
      model: env.IMAGE_MODEL,
      image: [personFile, ...itemFiles],
      prompt,
      size: '1024x1024',
      ...(env.IMAGE_MODEL.startsWith('gpt-image') ? { quality: env.IMAGE_QUALITY } : {}),
    });

    const first = image.data?.[0];
    if (first?.b64_json) return saveBase64Image(first.b64_json, 'png').url;
    if (first?.url) return first.url;
    throw new HttpError(502, 'Try-on generation returned no image');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : 'Try-on generation failed';
    throw new HttpError(502, message);
  }
}
