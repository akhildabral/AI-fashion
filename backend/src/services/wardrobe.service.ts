import fs from 'node:fs';
import path from 'node:path';
import type { WardrobeItem } from '@prisma/client';
import { toFile } from 'openai';
import { openai } from '../lib/openai';
import { env } from '../config/env';
import { absPathForFilename, saveBase64Image } from '../lib/storage';
import { HttpError } from '../middleware/error';

export interface GarmentTags {
  category: string;
  subtype: string;
  primaryColor: string;
  pattern: string;
  formality: string;
  season: string[];
  material: string;
  description: string;
}

const tagJsonSchema = {
  name: 'garment_tags',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      category: {
        type: 'string',
        enum: ['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'dress', 'other'],
      },
      subtype: { type: 'string' },
      primaryColor: { type: 'string' },
      pattern: {
        type: 'string',
        enum: ['solid', 'striped', 'plaid', 'checked', 'floral', 'graphic', 'other'],
      },
      formality: {
        type: 'string',
        enum: ['casual', 'smart-casual', 'business', 'formal', 'athletic'],
      },
      season: {
        type: 'array',
        items: { type: 'string', enum: ['spring', 'summer', 'fall', 'winter'] },
      },
      material: { type: 'string' },
      description: { type: 'string' },
    },
    required: [
      'category',
      'subtype',
      'primaryColor',
      'pattern',
      'formality',
      'season',
      'material',
      'description',
    ],
  },
} as const;

function mimeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

// Re-render the garment isolated on a clean studio background (product-catalog
// look). Returns the new stored file. Uses the same image-edit model as try-on.
export async function cleanGarmentBackground(
  photoFilename: string,
): Promise<{ filename: string; url: string }> {
  const absPath = absPathForFilename(photoFilename);
  if (!fs.existsSync(absPath)) {
    throw new HttpError(400, 'Uploaded image could not be found');
  }

  const image = await openai.images.edit({
    model: env.IMAGE_MODEL,
    image: await toFile(fs.createReadStream(absPath), path.basename(photoFilename), {
      type: mimeFor(photoFilename),
    }),
    prompt:
      'Isolate the single clothing item in this photo and place it centered on a ' +
      'plain, seamless light-grey studio background. Remove all other objects, ' +
      'people, hangers, hands, and background clutter. Preserve the garment exactly — ' +
      'its true colors, pattern, texture, and shape. Clean e-commerce product photo.',
    size: '1024x1024',
    ...(env.IMAGE_MODEL.startsWith('gpt-image') ? { quality: env.IMAGE_QUALITY } : {}),
  });

  const first = image.data?.[0];
  if (first?.b64_json) return saveBase64Image(first.b64_json, 'png');
  throw new HttpError(502, 'Background cleanup returned no image');
}

// Analyze a garment photo and extract structured attributes with a vision model.
export async function tagGarment(photoFilename: string): Promise<GarmentTags> {
  const absPath = absPathForFilename(photoFilename);
  if (!fs.existsSync(absPath)) {
    throw new HttpError(400, 'Uploaded image could not be found');
  }
  const b64 = fs.readFileSync(absPath).toString('base64');
  const dataUrl = `data:${mimeFor(photoFilename)};base64,${b64}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You are a fashion cataloguer. Identify the single garment or accessory ' +
          'in the image and describe it with precise, structured tags.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Tag this clothing item.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: tagJsonSchema },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new HttpError(502, 'The tagging model returned an empty response');
  try {
    return JSON.parse(content) as GarmentTags;
  } catch {
    throw new HttpError(502, 'The tagging model returned malformed output');
  }
}

export interface SuggestedOutfit {
  items: WardrobeItem[];
  rationale: string;
}

const outfitsJsonSchema = {
  name: 'wardrobe_outfits',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      outfits: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            itemIds: { type: 'array', items: { type: 'string' } },
            rationale: { type: 'string' },
          },
          required: ['itemIds', 'rationale'],
        },
      },
    },
    required: ['outfits'],
  },
} as const;

function catalogLine(item: WardrobeItem): string {
  return [
    `id=${item.id}`,
    item.category,
    item.subtype,
    item.primaryColor && `color:${item.primaryColor}`,
    item.pattern && `pattern:${item.pattern}`,
    item.formality && `formality:${item.formality}`,
    item.season.length && `season:${item.season.join('/')}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

// Assemble outfits using ONLY the user's owned items, referenced by id.
export async function suggestOutfits(
  items: WardrobeItem[],
  context: string,
): Promise<SuggestedOutfit[]> {
  const catalog = items.map(catalogLine).join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content:
          'You are a personal stylist. Build 1-2 complete, wearable outfits using ONLY ' +
          'the items in the wardrobe catalog, referenced by their exact ids. Combine a ' +
          'sensible set (e.g. top + bottom + footwear, or a dress + footwear, plus fitting ' +
          'outerwear/accessories when appropriate). Use each id at most once per outfit and ' +
          'ONLY ids that appear in the catalog. Explain each choice for the given context.',
      },
      {
        role: 'user',
        content: `Context: ${context}\n\nWardrobe catalog:\n${catalog}`,
      },
    ],
    response_format: { type: 'json_schema', json_schema: outfitsJsonSchema },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new HttpError(502, 'The stylist model returned an empty response');

  let parsed: { outfits?: { itemIds: string[]; rationale: string }[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpError(502, 'The stylist model returned malformed output');
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
