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
  'CRITICAL: keep the garment at its true, natural proportions and full ' +
  'length — a full-length trouser or dress stays full-length, shown straight ' +
  'top-to-bottom, never folded, bunched, cropped, or squashed. Present it ' +
  'upright and front-facing, filling the frame along its longest dimension, ' +
  'with its real aspect ratio preserved.';

const CLEAN_PROMPT =
  'Isolate the single clothing item in this photo and show it as a flat, ' +
  'front-facing e-commerce product shot on a plain seamless white studio ' +
  'background. Remove all other objects, people, hands, feet, furniture, and ' +
  'background clutter. ' +
  KEEP_PROPORTIONS +
  ' Preserve its true colors, pattern, texture, logos, and stitching.';

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
  return {
    png: matted.png,
    rgba: { data: matted.rgba, width: matted.width, height: matted.height },
    method: 'local',
  };
}

export async function cleanGarmentImage(
  image: Buffer,
  mime: string,
  target?: string,
): Promise<CleanedGarment | null> {
  const mode = resolveMode();
  if (mode === 'off') return null;

  if (mode === 'generative') {
    try {
      const prompt = target ? targetedPrompt(target) : CLEAN_PROMPT;
      const cleaned = await editImage(prompt, [{ data: image, mime }]);
      if (cleaned) {
        const studio = await sharp(cleaned)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        // Matte the clean studio shot to a transparent cutout — a single
        // garment on seamless white is the easiest matting case. Reached only
        // when the original was too cluttered to matte directly, or one item
        // had to be isolated from a multi-garment photo.
        const matted = await removeBackground(studio);
        if (matted && matted.coverage <= MAX_PLAUSIBLE_COVERAGE) {
          return {
            png: matted.png,
            rgba: { data: matted.rgba, width: matted.width, height: matted.height },
            method: 'generative',
          };
        }
        return { png: studio, method: 'generative' };
      }
    } catch (err) {
      console.error(
        'Generative cleanup failed — trying local matting:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // local mode, or the generative path came up empty.
  return localCutout(image);
}
