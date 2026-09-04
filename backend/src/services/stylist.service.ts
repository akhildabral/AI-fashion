import { generateObject } from 'ai';
import { z } from 'zod/v4';
import type { StyleProfile } from '@prisma/client';
import { env } from '../config/env';
import { aiAbortSignal, aiErrorMessage, textModel } from '../lib/ai';
import { generateImage } from '../lib/imagegen';
import { saveImageBuffer } from '../lib/storage';
import { HttpError } from '../middleware/error';

/** A garment in the closet's own vocabulary, so a look can be matched and rendered like a piece. */
export interface LookPiece {
  category: 'top' | 'bottom' | 'outerwear' | 'footwear' | 'accessory' | 'dress';
  subtype: string;
  color: string;
  material: string | null;
  pattern: string | null;
  /** One rendering line: shade, fabric, cut, closures, any detail the Mirror must show. */
  render: string;
}

export interface OutfitPlan {
  title: string;
  items: {
    top: string;
    bottom: string;
    outerwear: string;
    footwear: string;
    accessories: string[];
  };
  pieces: LookPiece[];
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
      // Three or four words, the way a stylist names a look: "Camel and ink, after dark".
      title: z.string(),
      pieces: z.array(
        z.object({
          category: z.enum(['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'dress']),
          subtype: z.string(),
          color: z.string(),
          material: z.string().nullable(),
          pattern: z.string().nullable(),
          render: z.string(),
        }),
      ),
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

// The frame every look is painted in: the clothes are the subject, and the
// only face in the room is the wearer's own, in the Mirror.
const MODEL_FRAME =
  'an editorial e-commerce photograph of a neutral, anonymous adult model (plain features, ' +
  'neutral expression, hair tied back) standing full-length, front-on, in a plain seamless ' +
  'light studio with soft even light, wearing the complete outfit exactly as described';

/**
 * "Surprise me": a brief built from what the profile already knows — taste
 * signals from the fitting, the month, and the looks kept before — so a
 * surprise is still this person's surprise.
 */
export function surpriseBrief(profile: StyleProfile | null, kept: string[]): string {
  const month = new Date().toLocaleString('en', { month: 'long' });
  const signals = (profile?.styleSignals as { signals?: string[] } | null)?.signals ?? [];
  const parts = [
    `A surprise: a look they would not have thought to ask for, still unmistakably theirs. It is ${month}.`,
    signals.length ? `Their taste, from the fitting: ${signals.slice(0, 6).join('; ')}.` : '',
    kept.length ? `Looks they kept before: ${kept.slice(0, 5).join(' / ')}. Rhyme with these; do not repeat them.` : '',
    'One of the two looks should be a step bolder than their usual.',
  ];
  return parts.filter(Boolean).join(' ');
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
      abortSignal: aiAbortSignal(),
      model: await textModel(),
      temperature: 0.8,
      schema: looksSchema,
      instructions:
        'You are a professional personal stylist. Given a client profile and an ' +
        `occasion, propose exactly ${count} DISTINCT, cohesive, currently-fashionable ` +
        'outfits tailored to THIS client. Respect their body type, skin tone, style ' +
        'preference, budget, and any colors to avoid. Recommend concrete garments ' +
        '(fabric, cut, color). Give each look a "title" of three or four words, the way a ' +
        'stylist names a look. List every garment once more in "pieces", one entry per ' +
        'physical item (a suit is a jacket and trousers), with category, a short subtype ' +
        '(blazer, wide-leg trousers, loafers), one colour word, material, pattern, and a ' +
        '"render" line of 15–30 words naming the shade, fabric, cut, closures and any detail ' +
        'an image model must show. In each "rationale", explain specifically why the outfit ' +
        "flatters this client (reference their profile) in two sentences. In each \"imagePrompt\", " +
        `describe ${MODEL_FRAME}; name each garment as in its render line; no text, no props.`,
      prompt:
        `Client profile:\n${describeProfile(profile)}\n\n` +
        `Occasion: ${occasion}\nGender presentation: ${gender}\n\n` +
        `Return exactly ${count} distinct looks.`,
    });
    parsed = object;
  } catch (err) {
    const message = aiErrorMessage(err, 'The stylist model failed');
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
    outfit: { items: plan.items, palette: plan.palette, pieces: plan.pieces, title: plan.title },
    rationale: plan.rationale,
    imageUrl: images[i] ?? null,
  }));
}
