import { generateObject } from 'ai';
import { z } from 'zod/v4';
import type { StyleProfile } from '@prisma/client';
import { env } from '../config/env';
import { textModel } from '../lib/ai';
import { generateImage } from '../lib/imagegen';
import { saveImageBuffer } from '../lib/storage';
import { HttpError } from '../middleware/error';

export interface OutfitPlan {
  items: {
    top: string;
    bottom: string;
    outerwear: string;
    footwear: string;
    accessories: string[];
  };
  palette: string[];
  rationale: string;
  imagePrompt: string;
}

export interface GeneratedLook {
  outfit: Omit<OutfitPlan, 'rationale' | 'imagePrompt'>;
  rationale: string;
  imageUrl: string | null;
}

// Structured output: the model returns an array of distinct looks.
const looksSchema = z.object({
  looks: z.array(
    z.object({
      items: z.object({
        top: z.string(),
        bottom: z.string(),
        outerwear: z.string(),
        footwear: z.string(),
        accessories: z.array(z.string()),
      }),
      palette: z.array(z.string()),
      rationale: z.string(),
      imagePrompt: z.string(),
    }),
  ),
});

// Turn the stored profile into a readable brief for the model.
function describeProfile(profile: StyleProfile | null): string {
  if (!profile) return 'No detailed style profile provided.';

  const sizes = profile.sizes as { top?: string; bottom?: string; shoe?: string } | null;
  const parts: string[] = [];
  if (profile.bodyType) parts.push(`Body type: ${profile.bodyType}`);
  if (profile.heightCm) parts.push(`Height: ${profile.heightCm} cm`);
  if (profile.skinTone) parts.push(`Skin tone: ${profile.skinTone}`);
  if (profile.styleVibe) parts.push(`Preferred style: ${profile.styleVibe}`);
  if (profile.budgetBand) parts.push(`Budget: ${profile.budgetBand}`);
  if (sizes) {
    const s = [sizes.top && `top ${sizes.top}`, sizes.bottom && `bottom ${sizes.bottom}`, sizes.shoe && `shoe ${sizes.shoe}`]
      .filter(Boolean)
      .join(', ');
    if (s) parts.push(`Sizes: ${s}`);
  }
  if (profile.avoidColors?.length) parts.push(`Colors to avoid: ${profile.avoidColors.join(', ')}`);

  // Cold-start taste signals from the visual quiz — the client's revealed
  // preferences before any wear history exists.
  const styleSignals = profile.styleSignals as { signals?: string[] } | null;
  if (styleSignals?.signals?.length) {
    parts.push(`Taste (from their style quiz): ${styleSignals.signals.join('; ')}`);
  }

  return parts.length ? parts.join('\n') : 'No detailed style profile provided.';
}

async function planLooks(
  occasion: string,
  gender: string,
  profile: StyleProfile | null,
  count: number,
): Promise<OutfitPlan[]> {
  let parsed: z.infer<typeof looksSchema>;
  try {
    const { object } = await generateObject({
      model: await textModel(),
      temperature: 0.8,
      schema: looksSchema,
      instructions:
        'You are a professional personal stylist. Given a client profile and an ' +
        `occasion, propose exactly ${count} DISTINCT, cohesive, currently-fashionable ` +
        'outfits tailored to THIS client. Respect their body type, skin tone, style ' +
        'preference, budget, and any colors to avoid. Recommend concrete garments ' +
        '(fabric, cut, color). In each "rationale", explain specifically why the outfit ' +
        "flatters this client (reference their profile). In each \"imagePrompt\", write a " +
        'vivid photographic prompt of a person wearing the full outfit, for an image model.',
      prompt:
        `Client profile:\n${describeProfile(profile)}\n\n` +
        `Occasion: ${occasion}\nGender presentation: ${gender}\n\n` +
        `Return exactly ${count} distinct looks.`,
    });
    parsed = object;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The stylist model failed';
    throw new HttpError(502, message);
  }

  const looks = parsed.looks ?? [];
  if (looks.length === 0) {
    throw new HttpError(502, 'The stylist model returned no looks');
  }
  return looks.slice(0, count);
}

async function renderOutfitImage(imagePrompt: string): Promise<string | null> {
  try {
    const image = await generateImage(imagePrompt);
    if (!image) return null;
    return (await saveImageBuffer(image, 'png')).url;
  } catch (err) {
    console.error('Image generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateLooks(
  occasion: string,
  gender: string,
  profile: StyleProfile | null,
): Promise<GeneratedLook[]> {
  const plans = await planLooks(occasion, gender, profile, env.LOOKS_PER_REQUEST);

  // Render all images concurrently.
  const images = await Promise.all(plans.map((p) => renderOutfitImage(p.imagePrompt)));

  return plans.map((plan, i) => ({
    outfit: { items: plan.items, palette: plan.palette },
    rationale: plan.rationale,
    imageUrl: images[i] ?? null,
  }));
}
