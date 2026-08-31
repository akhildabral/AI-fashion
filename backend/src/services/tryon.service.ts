import { editImage, imagesEnabled, type SourceImage } from '../lib/imagegen';
import { keyFromStored, mimeForKey, readStored, saveImageBuffer } from '../lib/storage';
import { HttpError } from '../middleware/error';

interface OutfitItems {
  top?: string;
  bottom?: string;
  outerwear?: string;
  footwear?: string;
  accessories?: string[];
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

async function sourceFromStored(stored: string, missingMessage: string): Promise<SourceImage> {
  let data: Buffer;
  try {
    data = await readStored(stored);
  } catch {
    throw new HttpError(400, missingMessage);
  }
  return { data, mime: mimeForKey(keyFromStored(stored)) };
}

function requireImages(): void {
  if (!imagesEnabled()) {
    throw new HttpError(
      503,
      'Image generation is not configured — set IMAGE_PROVIDER (and IMAGE_API_KEY if needed)',
    );
  }
}

async function runEdit(prompt: string, sources: SourceImage[]): Promise<string> {
  try {
    const image = await editImage(prompt, sources);
    if (!image) throw new HttpError(502, 'Try-on generation returned no image');
    return (await saveImageBuffer(image, 'png')).url;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : 'Try-on generation failed';
    throw new HttpError(502, message);
  }
}

// Render the given outfit onto the user's photo via image editing. All
// provider specifics live behind editImage(), so a dedicated try-on API
// (FASHN, Replicate IDM-VTON, etc.) can slot in without touching callers.
export async function generateTryOn(photoFilename: string, outfit: unknown): Promise<string> {
  requireImages();
  const person = await sourceFromStored(
    photoFilename,
    'Your uploaded photo could not be found; please re-upload it',
  );

  const prompt =
    'Edit this photograph so the same person is wearing the following outfit, ' +
    'while keeping their face, identity, body shape, skin tone, hair, and pose ' +
    'unchanged — never replace them with a different person or model. ' +
    `Outfit — ${describeOutfit(outfit)}. Produce a realistic, full-body fashion photograph.`;

  return runEdit(prompt, [person]);
}

export interface TryOnItem {
  imageUrl: string;
  category: string;
  subtype: string | null;
  primaryColor?: string | null;
  material?: string | null;
  description?: string | null;
}

function describeItem(it: TryOnItem): string {
  if (it.description?.trim()) return it.description.trim();
  return [it.primaryColor, it.material, it.subtype?.trim() || it.category]
    .filter(Boolean)
    .join(' ');
}

// Render the user's photo wearing a set of their OWN wardrobe garments, using
// the actual item photos as references (multi-image edit) for higher fidelity.
export async function generateOutfitTryOn(
  photoFilename: string,
  items: TryOnItem[],
): Promise<string> {
  requireImages();
  const person = await sourceFromStored(
    photoFilename,
    'Your uploaded photo could not be found; please re-upload it',
  );

  // Single-pass, text-described try-on — the same mechanism as look try-ons,
  // which is the one mode that reliably keeps the person's identity and the
  // photo's quality: exactly one edit of the original photo, with no other
  // reference images attached (any extra image makes the model ignore the
  // outfit, swap in a stock model, or degrade the photo). Garments are
  // described from their rich catalog tags; pixel-exact garment transfer is
  // a dedicated VTON model's job, behind this same seam, when wanted.
  const outfitDescription = items.map((it) => describeItem(it)).join('; ');
  const prompt =
    'Edit this photograph so the very same person is dressed in a different ' +
    'outfit. Remove ALL the clothing they are currently wearing — including ' +
    'any dress, top, bottoms, shoes, and bags — and dress them instead in ' +
    `exactly these items, all together: ${outfitDescription}. Fit each piece ` +
    'naturally to their body at true-to-life proportions. Keep everything ' +
    'else identical: the same face, identity, hair, skin tone, body, pose, ' +
    'background, lighting, and framing. Preserve the photograph’s full ' +
    'resolution, sharpness, and detail. Never replace the person with a ' +
    'different person or model. Photorealistic.';

  return runEdit(prompt, [person]);
}
