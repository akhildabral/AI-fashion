import type { StyleProfile } from '@prisma/client';
import { openai } from '../lib/openai';
import { env } from '../config/env';
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

// Structured-output schema: the model returns an array of distinct looks.
const looksJsonSchema = {
  name: 'outfit_recommendations',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      looks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                top: { type: 'string' },
                bottom: { type: 'string' },
                outerwear: { type: 'string' },
                footwear: { type: 'string' },
                accessories: { type: 'array', items: { type: 'string' } },
              },
              required: ['top', 'bottom', 'outerwear', 'footwear', 'accessories'],
            },
            palette: { type: 'array', items: { type: 'string' } },
            rationale: { type: 'string' },
            imagePrompt: { type: 'string' },
          },
          required: ['items', 'palette', 'rationale', 'imagePrompt'],
        },
      },
    },
    required: ['looks'],
  },
} as const;

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

  return parts.length ? parts.join('\n') : 'No detailed style profile provided.';
}

async function planLooks(
  occasion: string,
  gender: string,
  profile: StyleProfile | null,
  count: number,
): Promise<OutfitPlan[]> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.8,
    messages: [
      {
        role: 'system',
        content:
          'You are a professional personal stylist. Given a client profile and an ' +
          `occasion, propose exactly ${count} DISTINCT, cohesive, currently-fashionable ` +
          'outfits tailored to THIS client. Respect their body type, skin tone, style ' +
          'preference, budget, and any colors to avoid. Recommend concrete garments ' +
          '(fabric, cut, color). In each "rationale", explain specifically why the outfit ' +
          "flatters this client (reference their profile). In each \"imagePrompt\", write a " +
          'vivid photographic prompt of a person wearing the full outfit, for an image model.',
      },
      {
        role: 'user',
        content:
          `Client profile:\n${describeProfile(profile)}\n\n` +
          `Occasion: ${occasion}\nGender presentation: ${gender}\n\n` +
          `Return exactly ${count} distinct looks.`,
      },
    ],
    response_format: { type: 'json_schema', json_schema: looksJsonSchema },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new HttpError(502, 'The stylist model returned an empty response');
  }

  let parsed: { looks?: OutfitPlan[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpError(502, 'The stylist model returned malformed output');
  }

  const looks = parsed.looks ?? [];
  if (looks.length === 0) {
    throw new HttpError(502, 'The stylist model returned no looks');
  }
  return looks.slice(0, count);
}

async function renderOutfitImage(imagePrompt: string): Promise<string | null> {
  try {
    const isGptImage = env.IMAGE_MODEL.startsWith('gpt-image');
    const image = await openai.images.generate({
      model: env.IMAGE_MODEL,
      prompt: imagePrompt,
      n: 1,
      size: '1024x1024',
      // `quality` tiers (low/medium/high) are a gpt-image feature.
      ...(isGptImage ? { quality: env.IMAGE_QUALITY } : {}),
    });

    const first = image.data?.[0];
    if (!first) return null;
    // dall-e-3 returns a hosted URL; gpt-image-1 returns base64 → inline data URL.
    if (first.url) return first.url;
    if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
    return null;
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
