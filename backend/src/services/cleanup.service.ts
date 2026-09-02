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

// Shoes and bags are not flat things: a catalogue shows them from the side.
function promptFor(category?: string | null): string {
  if (category === 'footwear') {
    return (
      'Isolate the footwear in this photo and show it as an e-commerce product ' +
      'shot on a plain seamless white studio background: the pair together, seen ' +
      'from the side in profile, toes pointing to the left, resting on the ground, ' +
      'laces tidy. Remove all other objects, people, feet, furniture and background ' +
      'clutter. Preserve the true colours, materials, logos and wear.'
    );
  }
  if (category === 'accessory') {
    return (
      'Isolate the single accessory in this photo and show it as an e-commerce ' +
      'product shot on a plain seamless white studio background, seen from the ' +
      'front at its natural angle, complete and uncropped. Remove all other ' +
      'objects, people, hands, furniture and background clutter. Preserve its true ' +
      'colours, materials, hardware and logos.'
    );
  }
  return CLEAN_PROMPT;
}

// Extraction prompt for photos containing several garments (or a person
// wearing them): pulls out ONE named item, unworn, as a product shot.
function targetedPrompt(target: string): string {
  return (
    `The output image must contain exactly ONE garment: ${target}. ` +
    'Show it by itself, unworn, front-facing on a pure white seamless studio ' +
    'background. Absolutely no other clothing items, no people or body parts, ' +
    'no furniture, no floor or wall — nothing but this one garment on white. ' +
    KEEP_PROPORTIONS +
    ' Preserve its true colors, pattern, texture, logos, and stitching.'
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
    const prompt = target ? targetedPrompt(target) : promptFor(category);
    const cleaned = await editImage(prompt, [{ data: image, mime }]);
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
