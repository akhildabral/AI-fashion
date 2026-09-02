import sharp from 'sharp';
import { env } from '../config/env';
import { editImage, imagesEnabled } from '../lib/imagegen';
import { removeBackground } from './matting.service';

// Garment-image cleanup. The display image should look like a product-catalog
// shot; the pristine upload is always kept separately (originalUrl), and the
// UI can switch between the two.
//
// Strategies (CLEANUP_MODE):
//   generative — re-render the garment on a plain white studio background via
//                the configured image provider (one edit per upload). Local
//                matting then runs on that clean image only to extract a
//                trustworthy color palette.
//   local      — free, pixel-preserving matting cutout with plausibility
//                gates; no model calls.
//   auto       — generative when an image provider is configured, else local.
//   off        — keep the original photo untouched.
//
// Every failure degrades one step: generative → local → original.

const MAX_PLAUSIBLE_COVERAGE = 0.7;


// Proportion is the thing generative edits most often break — a full-length
// trouser comes back folded and wide. This clause is repeated in both prompts.
const KEEP_PROPORTIONS =
  'CRITICAL — show the garment COMPLETE and uncropped, at its true ' +
  'proportions: the ENTIRE piece from top to bottom must be visible. For ' +
  'trousers, jeans, or a dress show the FULL length from waist to hem/ankle — ' +
  'never cut off at the knee or calf, never folded, bunched, or shortened. ' +
  'Present it upright, straight, and front-facing, filling the frame ' +
  'vertically, with its real (for long items, tall) aspect ratio preserved.';

const CLEAN_PROMPT =
  'Isolate the single clothing item in this photo and show it as a flat, ' +
  'front-facing e-commerce product shot on a plain seamless white studio ' +
  'background. Remove all other objects, people, hands, feet, furniture, and ' +
  'background clutter. ' +
  KEEP_PROPORTIONS +
  ' Preserve its true colors, pattern, texture, logos, and stitching.';

// The studio shot, as it always was — upright, straight, front-facing,
// filling the frame at true proportions — but anchored on the piece itself:
// it is given the cut-out, and told it must remain that very item.
function studioPrompt(category?: string | null): string {
  const what = category === 'footwear' ? 'pair of shoes' : category === 'accessory' ? 'accessory' : 'garment';
  const pose =
    category === 'footwear'
      ? 'Present the pair neatly on the ground, from a clean catalogue angle (side profile or three-quarter view, whichever the photo is closest to), toes to one side.'
      : category === 'accessory'
        ? 'Present it from the front at its natural angle, complete and uncropped.'
        : KEEP_PROPORTIONS;
  return (
    `This is a photo of a real ${what}, cut out on white. Re-photograph THIS EXACT ${what} ` +
    'as a clean e-commerce product shot on a plain seamless white studio background. ' +
    'It must remain the very same item: the same design, cut, colour, wash, fabric, ' +
    'texture, pattern, stitching, hardware, logos and signs of wear. Do not substitute, ' +
    'redesign, recolour or idealise it. ' +
    pose +
    ' Straighten and smooth it as a stylist would on a table; complete any small part the ' +
    'photo cut off; light it evenly; remove any remaining background or shadow.'
  );
}

/** The cut-out laid on white: what the studio is given, so it has nothing to re-imagine. */
async function onWhite(png: Buffer): Promise<Buffer> {
  const m = await sharp(png).metadata();
  const w = m.width ?? 1024;
  const h = m.height ?? 1024;
  const pad = Math.round(Math.max(w, h) * 0.08);
  return sharp({ create: { width: w + pad * 2, height: h + pad * 2, channels: 3, background: '#ffffff' } })
    .composite([{ input: png, left: pad, top: pad }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Extraction prompt for photos containing several garments (or a person
// wearing them): pulls out ONE named item, unworn, as a product shot.
function targetedPrompt(target: string): string {
  return (
    `The output image must contain exactly ONE garment: ${target}. ` +
    'Show it by itself, unworn, front-facing on a pure white seamless studio ' +
    'background. If the photo shows an outfit or a suit, output ONLY this one ' +
    'piece: a jacket or blazer WITHOUT the trousers and WITHOUT the top beneath ' +
    'it; trousers WITHOUT the jacket above them; a top WITHOUT what is layered ' +
    'over it. Absolutely no other clothing items, no people or body parts, ' +
    'no furniture, no floor or wall — nothing but this one garment on white. ' +
    KEEP_PROPORTIONS +
    ' Preserve its true colors, pattern, texture, logos, and stitching. Where part ' +
    'of it is hidden in the photo (under a jacket, behind an arm, below the frame), ' +
    'complete it in the SAME cut, width, length and fabric as the visible part — ' +
    'never slimmer, shorter, or a different style.'
  );
}

export function generativeCleanupAvailable(): boolean {
  return resolveMode() === 'generative';
}

export interface CleanedGarment {
  png: Buffer;
  // Present when a trusted alpha matte exists — used for palette extraction.
  rgba?: { data: Buffer; width: number; height: number };
  method: 'generative' | 'local';
}

function resolveMode(): 'generative' | 'local' | 'off' {
  if (!env.MATTING_ENABLED || env.CLEANUP_MODE === 'off') return 'off';
  if (env.CLEANUP_MODE === 'generative') return 'generative';
  if (env.CLEANUP_MODE === 'local') return 'local';
  return imagesEnabled() ? 'generative' : 'local';
}

async function localCutout(image: Buffer): Promise<CleanedGarment | null> {
  const matted = await removeBackground(image);
  if (!matted || matted.coverage > MAX_PLAUSIBLE_COVERAGE) return null;
  console.info(`Local matte (softness ${matted.softness.toFixed(2)}, coverage ${matted.coverage.toFixed(2)})`);
  return {
    png: matted.png,
    rgba: { data: matted.rgba, width: matted.width, height: matted.height },
    method: 'local',
  };
}

// The garment's shape, from its tight-cropped cut-out: height ÷ width.
async function shapeOf(png: Buffer): Promise<number | null> {
  const m = await sharp(png).metadata();
  return m.width && m.height ? m.height / m.width : null;
}
// The render's shape against the photo's cut-out (height ÷ width, as a
// ratio). A garment photographed at an angle or bunched comes back taller
// when set straight, which is right; a render that comes back squatter has
// folded or cropped it, and one far taller has stretched it.
const MIN_SHAPE_RATIO = 0.78;
const MAX_SHAPE_RATIO = 1.7;

/** The photo's own cut-out: pixel-preserving, free, the ground truth for shape and colour. */
export async function matteGarment(image: Buffer): Promise<CleanedGarment | null> {
  if (resolveMode() === 'off') return null;
  return localCutout(image);
}

/**
 * The studio re-render: the garment as a catalogue shot on white, matted to
 * a cut-out. Checked against the photo's cut-out so a trouser never comes
 * back folded or a dress cropped; the photo's pixels still give the palette.
 * Returns null when the studio is unavailable, fails, or reshapes the piece.
 */
export async function studioRender(
  image: Buffer,
  mime: string,
  opts: { target?: string; category?: string | null; local?: CleanedGarment | null } = {},
): Promise<CleanedGarment | null> {
  if (resolveMode() !== 'generative') return null;
  const { target, category, local } = opts;
  try {
    // With a cut-out in hand the studio only tidies it; without one (a piece
    // to be isolated from several, or a photo that would not matte) it must
    // extract the garment from the photo.
    const prompt = target ? targetedPrompt(target) : local ? studioPrompt(category) : CLEAN_PROMPT;
    const input = local ? { data: await onWhite(local.png), mime: 'image/jpeg' } : { data: image, mime };
    const cleaned = await editImage(prompt, [input]);
    if (!cleaned) return null;
    const studio = await sharp(cleaned)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    // Matte the studio shot to a transparent cut-out — a single garment on
    // seamless white is the easiest matting case.
    const matted = await removeBackground(studio);
    const png = matted && matted.coverage <= MAX_PLAUSIBLE_COVERAGE ? matted.png : studio;
    // Shoes and bags are photographed from any angle, so their photo's shape
    // says nothing about the render; the guard is for garments that can be
    // folded or cropped.
    const flat = !(category === 'footwear' || category === 'accessory' || category === 'other');
    if (local && flat) {
      const [want, got] = await Promise.all([shapeOf(local.png), shapeOf(png)]);
      if (want && got && (got / want < MIN_SHAPE_RATIO || got / want > MAX_SHAPE_RATIO)) {
        console.info(`Studio re-render reshaped the ${category ?? 'garment'} (${want.toFixed(2)} → ${got.toFixed(2)}) — keeping the photo's cut-out`);
        return null;
      }
    }
    console.info(`Studio re-render kept${category ? ` (${category})` : ''}`);
    return {
      png,
      // True colours come from the photo, not the render.
      rgba: local?.rgba ?? (matted && matted.coverage <= MAX_PLAUSIBLE_COVERAGE ? { data: matted.rgba, width: matted.width, height: matted.height } : undefined),
      method: 'generative',
    };
  } catch (err) {
    console.error('Generative cleanup failed — keeping the local cut-out:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Both steps at once, for callers that don't tag in between. */
export async function cleanGarmentImage(
  image: Buffer,
  mime: string,
  target?: string,
): Promise<CleanedGarment | null> {
  const mode = resolveMode();
  if (mode === 'off') return null;
  const local = target ? null : await localCutout(image);
  const studio = await studioRender(image, mime, { target, local });
  if (studio) return studio;
  // The studio came up empty: the photo's own cut-out, if there is one.
  return local ?? (target ? localCutout(image) : null);
}
