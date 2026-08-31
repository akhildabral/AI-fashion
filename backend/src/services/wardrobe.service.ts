import { generateObject } from 'ai';
import { z } from 'zod/v4';
import type { WardrobeItem } from '@prisma/client';
import { textModel } from '../lib/ai';
import { HttpError } from '../middleware/error';
import {
  formalityScoreFor,
  layerRoleFor,
  normalizeColorName,
  warmthFor,
} from '../lib/attributes';

export interface GarmentTags {
  category: string;
  subtype: string | null;
  primaryColor: string | null;
  pattern: string | null;
  formality: string | null;
  season: string[];
  material: string | null;
  description: string | null;
  attrConfidence: Record<string, number>;
}

// Below this confidence the field is stored as null: a model that says
// "I don't know the material" is worth more than one that guesses "cotton"
// every time, and the suggestion engine degrades gracefully on missing data.
const ABSTAIN_BELOW = 0.5;

const confidenceSchema = z.number().min(0).max(1);

const tagSchema = z.object({
  category: z.enum(['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'dress', 'other']),
  subtype: z.string(),
  primaryColor: z.string(),
  pattern: z.enum(['solid', 'striped', 'plaid', 'checked', 'floral', 'graphic', 'other']),
  formality: z.enum(['casual', 'smart-casual', 'business', 'formal', 'athletic']),
  season: z.array(z.enum(['spring', 'summer', 'fall', 'winter'])),
  material: z.string(),
  description: z.string(),
  // Per-attribute confidence, 0–1. Honesty is rewarded: low-confidence
  // values are discarded rather than stored.
  confidence: z.object({
    category: confidenceSchema,
    subtype: confidenceSchema,
    primaryColor: confidenceSchema,
    pattern: confidenceSchema,
    formality: confidenceSchema,
    material: confidenceSchema,
  }),
});

// Analyze a garment photo and extract structured attributes with a vision model.
export async function tagGarment(image: Buffer, mime: string): Promise<GarmentTags> {
  let raw: z.infer<typeof tagSchema>;
  try {
    const { object } = await generateObject({
      model: await textModel(),
      temperature: 0.2,
      schema: tagSchema,
      instructions:
        'You are a fashion cataloguer. Identify the single garment or accessory ' +
        'in the image and describe it with precise, structured tags. For each ' +
        'attribute report an honest confidence between 0 and 1 — a low confidence ' +
        'on an uncertain attribute is the correct answer, not a failure.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Tag this clothing item.' },
            { type: 'file', data: image, mediaType: mime },
          ],
        },
      ],
    });
    raw = object;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The tagging model failed';
    throw new HttpError(502, message);
  }

  const conf = raw.confidence ?? {};
  const keep = (field: keyof typeof conf, value: string): string | null =>
    (conf[field] ?? 1) >= ABSTAIN_BELOW && value.trim() ? value.trim() : null;

  return {
    category: raw.category,
    subtype: keep('subtype', raw.subtype),
    primaryColor: normalizeColorName(keep('primaryColor', raw.primaryColor)),
    pattern: keep('pattern', raw.pattern),
    formality: keep('formality', raw.formality),
    season: raw.season ?? [],
    material: keep('material', raw.material),
    description: raw.description?.trim() || null,
    attrConfidence: conf,
  };
}

export interface DetectedGarment {
  description: string;
  category: string;
  // Normalized [0,1] bounding box; used to crop the region before extraction.
  box: { x: number; y: number; w: number; h: number };
}

const detectSchema = z.object({
  garments: z.array(
    z.object({
      // Specific enough to single the item out among the others in the photo.
      description: z.string(),
      category: z.enum(['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'dress', 'other']),
      // Bounding box in fractions of image width/height, top-left origin.
      box: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().min(0).max(1),
        h: z.number().min(0).max(1),
      }),
    }),
  ),
});

const MAX_GARMENTS_PER_PHOTO = 8;

// Enumerate every distinct garment in a photo — a flat-lay of several items,
// a rack, or a person wearing an outfit. Feeds one extraction per garment.
export async function detectGarments(image: Buffer, mime: string): Promise<DetectedGarment[]> {
  const { object } = await generateObject({
    model: await textModel(),
    temperature: 0.2,
    schema: detectSchema,
    instructions:
      'You are a fashion cataloguer. List every DISTINCT physical clothing item, ' +
      'pair of footwear, or accessory clearly visible in the photo — whether laid ' +
      'out, hanging, or worn by a person. One entry per physical item: never split ' +
      'one garment into multiple entries, never merge two items into one. Ignore ' +
      'jewelry, backgrounds, furniture, and items too small or blurry to identify. ' +
      'Each description must be specific enough (color, pattern, garment type) to ' +
      'single that item out among the others in this photo. For each item also ' +
      'give its bounding box as fractions of the image size (x,y = top-left ' +
      'corner, w,h = width and height), generously covering the whole item.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'List the clothing items in this photo.' },
          { type: 'file', data: image, mediaType: mime },
        ],
      },
    ],
  });
  return (object.garments ?? []).slice(0, MAX_GARMENTS_PER_PHOTO);
}

// Deterministic reasoning attributes, looked up — never model-generated —
// so warmth and layer role stay consistent across the whole corpus.
export function deriveReasoningAttributes(tags: {
  category: string;
  subtype: string | null;
  material: string | null;
  formality: string | null;
}): { layerRole: string | null; warmthValue: number | null; formalityScore: number | null } {
  return {
    layerRole: layerRoleFor(tags.category, tags.subtype),
    warmthValue: warmthFor(tags.category, tags.subtype, tags.material),
    formalityScore: formalityScoreFor(tags.formality),
  };
}

export interface SuggestedOutfit {
  items: WardrobeItem[];
  rationale: string;
}

const outfitsSchema = z.object({
  outfits: z.array(
    z.object({
      itemIds: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
});

function catalogLine(item: WardrobeItem): string {
  return [
    `id=${item.id}`,
    item.category,
    item.subtype,
    item.primaryColor && `color:${item.primaryColor}`,
    item.pattern && `pattern:${item.pattern}`,
    item.formality && `formality:${item.formality}`,
    item.layerRole && `layer:${item.layerRole}`,
    item.warmthValue != null && `warmth:${item.warmthValue}/10`,
    item.season.length && `season:${item.season.join('/')}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

// Assemble outfits using ONLY the user's owned items, referenced by id.
// Candidates are proposed here and validated deterministically by the caller.
export async function suggestOutfits(
  items: WardrobeItem[],
  context: string,
  count = 2,
): Promise<SuggestedOutfit[]> {
  const catalog = items.map(catalogLine).join('\n');

  let parsed: z.infer<typeof outfitsSchema>;
  try {
    const { object } = await generateObject({
      model: await textModel(),
      temperature: 0.7,
      schema: outfitsSchema,
      instructions:
        `You are a personal stylist. Build ${count} complete, wearable outfits using ONLY ` +
        'the items in the wardrobe catalog, referenced by their exact ids. Combine a ' +
        'sensible set (e.g. top + bottom + footwear, or a dress + footwear, plus fitting ' +
        'outerwear/accessories when appropriate). Use each id at most once per outfit and ' +
        'ONLY ids that appear in the catalog. Explain each choice for the given context.',
      prompt: `Context: ${context}\n\nWardrobe catalog:\n${catalog}`,
    });
    parsed = object;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The stylist model failed';
    throw new HttpError(502, message);
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const outfits: SuggestedOutfit[] = [];
  for (const o of parsed.outfits ?? []) {
    // Keep only real, de-duplicated items (guards against hallucinated ids).
    const resolved = [...new Set(o.itemIds)].map((id) => byId.get(id)).filter((i): i is WardrobeItem => !!i);
    if (resolved.length > 0) outfits.push({ items: resolved, rationale: o.rationale });
  }

  if (outfits.length === 0) {
    throw new HttpError(502, 'Could not assemble an outfit from your wardrobe');
  }
  return outfits;
}
