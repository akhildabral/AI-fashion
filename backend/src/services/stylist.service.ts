import { openai, nebius } from '../lib/openai';
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

// Structured-output schema so the model returns reliable JSON, not free text.
const outfitJsonSchema = {
  name: 'outfit_recommendation',
  strict: true,
  schema: {
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
} as const;

async function planOutfit(occasion: string, gender: string): Promise<OutfitPlan> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content:
          'You are a professional fashion stylist. Recommend a single, cohesive, ' +
          'currently-fashionable outfit for the given occasion and gender. ' +
          'Return concrete, specific garments (fabric, cut, color). ' +
          'In "imagePrompt", write a vivid photographic prompt describing a person ' +
          'wearing the full outfit, suitable for an image generation model.',
      },
      {
        role: 'user',
        content: `Occasion: ${occasion}\nGender: ${gender}`,
      },
    ],
    response_format: { type: 'json_schema', json_schema: outfitJsonSchema },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new HttpError(502, 'The stylist model returned an empty response');
  }

  try {
    return JSON.parse(content) as OutfitPlan;
  } catch {
    throw new HttpError(502, 'The stylist model returned malformed output');
  }
}

async function renderOutfitImage(imagePrompt: string): Promise<string | null> {
  try {
    // Nebius accepts Flux-specific fields beyond the OpenAI image params, so the
    // request body is loosely typed here.
    const image = await nebius.images.generate({
      model: 'black-forest-labs/flux-dev',
      prompt: imagePrompt,
      response_format: 'url',
      width: 1024,
      height: 1024,
      num_inference_steps: 28,
      negative_prompt: '',
      seed: -1,
      response_extension: 'png',
    } as Parameters<typeof nebius.images.generate>[0]);

    return image.data?.[0]?.url ?? null;
  } catch (err) {
    // Image generation is best-effort; the outfit is still useful without it.
    console.error('Image generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateLook(
  occasion: string,
  gender: string,
): Promise<GeneratedLook> {
  const plan = await planOutfit(occasion, gender);
  const imageUrl = await renderOutfitImage(plan.imagePrompt);

  return {
    outfit: { items: plan.items, palette: plan.palette },
    rationale: plan.rationale,
    imageUrl,
  };
}
