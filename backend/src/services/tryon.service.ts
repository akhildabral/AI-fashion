import { editImage, imagesEnabled, type SourceImage } from '../lib/imagegen';
import { keyFromStored, mimeForKey, readStored, saveImageBuffer } from '../lib/storage';
import { HttpError } from '../middleware/error';

// The Mirror's renderer. Two modes behind one seam:
//   references — the person plus every garment cut-out, each introduced by
//                name, with a prompt that pins colour, pattern and cut to the
//                pictures. The render is the person's own clothes.
//   text       — the person alone, garments described from catalog tags.
//                The earlier path; kept as a fallback and for comparison.
// A dedicated try-on model (FASHN, IDM-VTON, …) would slot in behind the
// same runEdit() without touching callers.

export type TryOnMode = 'references' | 'text';

// Text is the default: one edit of the person's photo with the pieces
// described from their tags reliably keeps the person and dresses them in
// the right clothes. With garment pictures attached the model has been seen
// to ignore them — a short-sleeve polo rendered long, black trousers white.
// References stay available behind TRYON_MODE=references for comparison.
export function defaultTryOnMode(): TryOnMode {
  return process.env.TRYON_MODE === 'references' ? 'references' : 'text';
}

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

async function sourceFromStored(stored: string, missingMessage: string, label?: string): Promise<SourceImage> {
  let data: Buffer;
  try {
    data = await readStored(stored);
  } catch {
    throw new HttpError(400, missingMessage);
  }
  return { data, mime: mimeForKey(keyFromStored(stored)), label };
}

function requireImages(): void {
  if (!imagesEnabled()) {
    throw new HttpError(503, 'Image generation is not configured — set IMAGE_PROVIDER (and IMAGE_API_KEY if needed)');
  }
}

export interface RenderResult {
  url: string;
  prompt: string;
  mode: TryOnMode | 'look';
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

const KEEP =
  'Keep everything else identical: the same face, identity, hair, skin tone, body, pose, ' +
  'background, lighting, and framing. Preserve the photograph’s full resolution, sharpness ' +
  'and detail. Never replace the person with a different person or model. Photorealistic.';

// Render a generated look (no wardrobe pieces) onto the user's photo.
export async function generateTryOn(photoFilename: string, outfit: unknown): Promise<string> {
  requireImages();
  const person = await sourceFromStored(photoFilename, 'Your uploaded photo could not be found; please re-upload it');
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
  pattern?: string | null;
  description?: string | null;
  /** The rendering brief read from the cut-out: shade, fabric, closures, every logo and print. */
  renderNotes?: string | null;
}

// The words the Mirror dresses with. The rendering brief carries the details
// that make a render recognisably THIS piece; the description is the fallback.
function describeItem(it: TryOnItem): string {
  if (it.renderNotes?.trim()) return it.renderNotes.trim();
  if (it.description?.trim()) return it.description.trim();
  return [it.primaryColor, it.pattern, it.material, it.subtype?.trim() || it.category].filter(Boolean).join(' ');
}

function slotWord(it: TryOnItem): string {
  const c = it.category.toLowerCase();
  if (c === 'footwear') return 'shoes';
  if (c === 'outerwear') return 'outer layer';
  if (c === 'accessory' || c === 'other') return 'accessory';
  if (c === 'dress') return 'dress';
  return c;
}

/**
 * Render the person wearing a set of their OWN pieces.
 * references: the cut-outs travel with the request, each introduced by name.
 */
export async function generateOutfitTryOn(photoFilename: string, items: TryOnItem[], mode: TryOnMode = defaultTryOnMode()): Promise<RenderResult> {
  requireImages();
  const person = await sourceFromStored(photoFilename, 'Your uploaded photo could not be found; please re-upload it', 'PERSON — the person to dress. This photograph is the canvas; edit it in place:');

  if (mode === 'text') {
    const outfitDescription = items.map((it) => describeItem(it)).join('; ');
    const prompt =
      'Edit this photograph so the very same person is dressed in a different outfit. Remove ALL the clothing ' +
      'they are currently wearing — including any dress, top, bottoms, shoes, and bags — and dress them instead in ' +
      `exactly these items, all together: ${outfitDescription}. Every detail named must appear as described — ` +
      'each logo, badge, print or embroidery at its stated place, size, shape and colours; the stated shade, fabric ' +
      'and weave; the collar, sleeves, cuffs, closures and hardware. Do not simplify a garment into a plain one. ' +
      `Fit each piece naturally to their body at true-to-life proportions. ${KEEP}`;
    return { url: await runEdit(prompt, [person]), prompt, mode };
  }

  const garments = await Promise.all(
    items.map((it, i) =>
      sourceFromStored(
        it.imageUrl,
        'One of the pieces could not be found; try again from the closet',
        `GARMENT ${i + 1} — the exact ${slotWord(it)} to put on them (${describeItem(it)}). Reproduce THIS piece: its colour, pattern, fabric, cut and details, as pictured:`,
      ),
    ),
  );
  const list = items.map((it, i) => `GARMENT ${i + 1}: ${describeItem(it)} (${slotWord(it)})`).join('; ');
  const prompt =
    'Virtual try-on. The first image is the PERSON: edit that photograph in place. The other images are ' +
    'GARMENTS from their own wardrobe, photographed flat. Remove ALL the clothing the person is wearing — every top, ' +
    'bottom, shoe, bag, and any jacket or layer draped over the shoulders; keep nothing they had on — and dress ' +
    `them in exactly these garments, together, as one outfit — ${list}. Each garment must match its picture ` +
    'precisely: the same colour, the same stripes or print, the same fabric and cut; do not substitute a similar ' +
    'garment and do not invent extra pieces. Fit each garment naturally to their body at true-to-life ' +
    `proportions with realistic drape and shadow. ${KEEP} Output only the edited photograph of the person.`;
  return { url: await runEdit(prompt, [person, ...garments]), prompt, mode };
}
