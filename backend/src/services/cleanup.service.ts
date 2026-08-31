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

const CLEAN_PROMPT =
  'Isolate the single clothing item in this photo and lay it out flat, neatly ' +
  'and centered on a plain, seamless white studio background. Remove all other ' +
  'objects, people, hands, feet, furniture, and background clutter. Preserve ' +
  'the garment exactly — its true colors, pattern, texture, logos, stitching, ' +
  'and shape. Professional e-commerce product photo.';

// Extraction prompt for photos containing several garments (or a person
// wearing them): pulls out ONE named item, unworn, as a product shot.
function targetedPrompt(target: string): string {
  return (
    `The output image must contain exactly ONE garment: ${target}. ` +
    'Show it by itself, unworn, laid out flat and centered on a pure white, ' +
    'seamless studio background that fills the entire frame. Absolutely no ' +
    'other clothing items, no people or body parts, no furniture, no floor ' +
    'or wall — nothing but this one garment on white. Preserve the garment ' +
    'exactly — its true colors, pattern, texture, logos, stitching, and ' +
    'shape. Professional e-commerce product photo.'
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
        const png = await sharp(cleaned)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        // Matting a white studio shot is the easy case — used only to sample
        // the palette from garment pixels, never for display.
        const matted = await removeBackground(png);
        return {
          png,
          ...(matted
            ? { rgba: { data: matted.rgba, width: matted.width, height: matted.height } }
            : {}),
          method: 'generative',
        };
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
