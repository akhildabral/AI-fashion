import { generateObject } from 'ai';
import { z } from 'zod/v4';
import type { WardrobeItem } from '@prisma/client';
import { aiAbortSignal, aiErrorMessage, textModel, visionModel } from '../lib/ai';
import { HttpError } from '../middleware/error';
import { EVENT_TYPES } from '../lib/attributes';
import {
  deriveLayerRole,
  deriveNeedsLayer,
  deriveShoeFormality,
  formalityScoreFor,
  normalizeColorName,
  shoeFormalityOf,
  warmthFor,
} from '../lib/attributes';
import { tastePromptBlock, type FavouriteOutfit, type TasteProfileData } from './taste.service';

export const CUT_FOR = ['womens', 'mens', 'unisex'] as const;
export const MATERIALS = ['cotton', 'linen', 'wool', 'silk', 'denim', 'leather', 'synthetic', 'blend', 'other'] as const;
export const FITS = ['slim', 'regular', 'relaxed', 'oversized'] as const;
export const LENGTHS = ['cropped', 'regular', 'long'] as const;
export const TEXTURES = ['smooth', 'woven', 'knit', 'ribbed', 'fuzzy', 'glossy', 'other'] as const;
export const WEIGHTS = ['light', 'mid', 'heavy'] as const;

export interface GarmentTags {
  category: string;
  subtype: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  pattern: string | null;
  formality: string | null;
  season: string[];
  occasions: string[];
  material: string | null;
  cutFor: string | null;
  fit: string | null;
  length: string | null;
  texture: string | null;
  weight: string | null;
  details: Record<string, string> | null;
  description: string | null;
  /** For the Mirror: every visible detail an image model must reproduce. */
  renderNotes: string | null;
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
  // The second colour, or an empty string when the piece is one colour.
  secondaryColor: z.string(),
  pattern: z.enum(['solid', 'striped', 'plaid', 'checked', 'floral', 'graphic', 'other']),
  formality: z.enum(['casual', 'smart-casual', 'business', 'formal', 'athletic']),
  season: z.array(z.enum(['spring', 'summer', 'fall', 'winter'])),
  occasions: z.array(z.enum(EVENT_TYPES)),
  material: z.enum(MATERIALS),
  // The material in the model's own words when the list is too coarse (e.g. "cashmere").
  materialNote: z.string(),
  // Who the piece is cut for, judged by cut and styling, never by colour.
  cutFor: z.enum(CUT_FOR),
  fit: z.enum(FITS),
  length: z.enum(LENGTHS),
  texture: z.enum(TEXTURES),
  weight: z.enum(WEIGHTS),
  // Per-type details; leave what doesn't apply empty.
  details: z.object({
    neckline: z.string(),
    sleeve: z.string(),
    rise: z.string(),
    leg: z.string(),
    heel: z.string(),
    toe: z.string(),
    closure: z.string(),
  }),
  description: z.string(),
  // A rendering brief for an image model: 60–120 words, concrete and visual —
  // the exact shade, fabric and weave, fit, collar or neckline, sleeve length,
  // cuffs and hems, closures and hardware, and EVERY logo, badge, print or
  // embroidery with its place, size, shape and colours. Nothing that isn't visible.
  renderNotes: z.string(),
  // Per-attribute confidence, 0–1. Honesty is rewarded: low-confidence
  // values are discarded rather than stored.
  confidence: z.object({
    category: confidenceSchema,
    subtype: confidenceSchema,
    primaryColor: confidenceSchema,
    secondaryColor: confidenceSchema,
    pattern: confidenceSchema,
    formality: confidenceSchema,
    material: confidenceSchema,
    cutFor: confidenceSchema,
    fit: confidenceSchema,
    length: confidenceSchema,
    texture: confidenceSchema,
    weight: confidenceSchema,
  }),
});

// Analyze a garment photo and extract structured attributes with a vision model.
export async function tagGarment(image: Buffer, mime: string): Promise<GarmentTags> {
  let raw: z.infer<typeof tagSchema>;
  try {
    const { object } = await generateObject({
      abortSignal: aiAbortSignal(),
      model: await textModel(),
      temperature: 0.2,
      schema: tagSchema,
      instructions:
        'You are a fashion cataloguer. Identify the single garment or accessory ' +
        'in the image and describe it with precise, structured tags. For each ' +
        'attribute report an honest confidence between 0 and 1 — a low confidence ' +
        'on an uncertain attribute is the correct answer, not a failure. ' +
        'cutFor is who the piece is cut for — womens, mens, or unisex — judged from ' +
        'the cut, silhouette, closure side and styling, never from colour; report low ' +
        'confidence when the cut is genuinely ambiguous. secondaryColor is the second ' +
        'colour of a two-tone or patterned piece, empty when there is none. ' +
        'Fill only the details that apply to this kind of piece (neckline and sleeve ' +
        'for tops and dresses; rise and leg for bottoms; heel and toe for shoes; ' +
        'closure for anything that fastens) and leave the rest empty. ' +
        'renderNotes is a brief for an image model that will dress a person in this ' +
        'exact piece: write 60–120 concrete visual words — the precise shade, the fabric ' +
        'and its weave or knit, the fit, collar or neckline, sleeve length, cuffs and hems, ' +
        'closures and hardware, and every logo, badge, print or embroidery with where it ' +
        'sits, how big it is, its shape and its colours. Only what is visible.',
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
    const message = aiErrorMessage(err, 'The tagging model failed');
    throw new HttpError(502, message);
  }

  const conf = raw.confidence ?? {};
  const keep = (field: keyof typeof conf, value: string): string | null =>
    (conf[field] ?? 1) >= ABSTAIN_BELOW && value.trim() ? value.trim() : null;

  const details: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.details ?? {})) if (v && v.trim()) details[k] = v.trim();
  if (raw.materialNote?.trim() && raw.materialNote.trim().toLowerCase() !== raw.material) details.materialNote = raw.materialNote.trim();
  return {
    category: raw.category,
    subtype: keep('subtype', raw.subtype),
    primaryColor: normalizeColorName(keep('primaryColor', raw.primaryColor)),
    secondaryColor: normalizeColorName(keep('secondaryColor', raw.secondaryColor)),
    pattern: keep('pattern', raw.pattern),
    formality: keep('formality', raw.formality),
    season: raw.season ?? [],
    occasions: raw.occasions ?? [],
    material: keep('material', raw.material),
    cutFor: keep('cutFor', raw.cutFor),
    fit: keep('fit', raw.fit),
    length: keep('length', raw.length),
    texture: keep('texture', raw.texture),
    weight: keep('weight', raw.weight),
    details: Object.keys(details).length ? details : null,
    description: raw.description?.trim() || null,
    renderNotes: raw.renderNotes?.trim() || null,
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
      // [ymin, xmin, ymax, xmax] on a 0–1000 scale: the form vision models
      // were trained to localise in. Small chat models guess boxes in round
      // numbers; the crops made from them land on the wall.
      box_2d: z.array(z.number().min(0).max(1000)).length(4),
    }),
  ),
});

const MAX_GARMENTS_PER_PHOTO = 8;

function toBox(b: number[]): DetectedGarment['box'] {
  const [y0, x0, y1, x1] = b.map((v) => Math.min(1, Math.max(0, v / 1000)));
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

// A pair of shoes sometimes comes back as two boxes; one item, one box.
function mergePairs(list: DetectedGarment[]): DetectedGarment[] {
  const out: DetectedGarment[] = [];
  for (const g of list) {
    const twin = g.category === 'footwear' ? out.find((o) => o.category === 'footwear' && o.description.toLowerCase() === g.description.toLowerCase()) : undefined;
    if (!twin) {
      out.push(g);
      continue;
    }
    const x = Math.min(twin.box.x, g.box.x);
    const y = Math.min(twin.box.y, g.box.y);
    twin.box = { x, y, w: Math.max(twin.box.x + twin.box.w, g.box.x + g.box.w) - x, h: Math.max(twin.box.y + twin.box.h, g.box.y + g.box.h) - y };
  }
  return out;
}

// Enumerate every distinct garment in a photo — a flat-lay of several items,
// a rack, or a person wearing an outfit. Feeds one extraction per garment.
export async function detectGarments(image: Buffer, mime: string): Promise<DetectedGarment[]> {
  const { object } = await generateObject({
    abortSignal: aiAbortSignal(),
    model: await visionModel(),
    temperature: 0,
    schema: detectSchema,
    instructions:
      'You are a fashion cataloguer. List every DISTINCT physical clothing item, ' +
      'pair of footwear, or accessory clearly visible in the photo — whether laid ' +
      'out, hanging, or worn by a person. One entry per physical item: never split ' +
      'one garment into multiple entries, never merge two items into one. A pair of ' +
      'shoes is ONE item with ONE box around both shoes. Ignore ' +
      'jewelry, backgrounds, furniture, and items too small or blurry to identify. ' +
      'Each description must be specific enough (color, pattern, garment type) to ' +
      'single that item out among the others in this photo. For each item give ' +
      'box_2d as [ymin, xmin, ymax, xmax] on a 0-1000 scale of the image, tight ' +
      'around the whole item.',
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
  const list = (object.garments ?? []).map((g) => ({ description: g.description, category: g.category, box: toBox(g.box_2d) }));
  return mergePairs(list).slice(0, MAX_GARMENTS_PER_PHOTO);
}

// Deterministic reasoning attributes, looked up — never model-generated —
// so warmth and layer role stay consistent across the whole corpus.
export function deriveReasoningAttributes(tags: {
  category: string;
  subtype: string | null;
  material: string | null;
  formality: string | null;
}): { layerRole: string | null; warmthValue: number | null; formalityScore: number | null } {
  // Footwear formality comes off the shoe ladder (sneaker 2, loafer 3, oxford
  // 4 …) and falls back to the garment tag for a subtype the ladder doesn't know.
  const formalityScore =
    tags.category === 'footwear' ? deriveShoeFormality(tags.subtype) ?? formalityScoreFor(tags.formality) : formalityScoreFor(tags.formality);
  return {
    layerRole: deriveLayerRole(tags.category, tags.subtype),
    warmthValue: warmthFor(tags.category, tags.subtype, tags.material),
    formalityScore,
  };
}

export interface ResaleDraft {
  title: string;
  description: string;
  suggestedPrice: string;
  conditionChecklist: string[];
}

const resaleSchema = z.object({
  // Marketplace-style listing title, ≤70 chars.
  title: z.string(),
  // Honest, appealing listing description: what it is, fabric/pattern,
  // fit, why someone would want it. No invented flaws or history.
  description: z.string(),
  // A pricing suggestion with brief reasoning (currency-agnostic, e.g.
  // "around 30-40% of retail for a worn casual piece").
  suggestedPrice: z.string(),
  // Things the seller should check/photograph before listing.
  conditionChecklist: z.array(z.string()),
});

// Resale monetizes decluttering without touching the styling engine: turn a
// wardrobe orphan into a ready-to-post marketplace listing draft.
export async function draftResaleListing(item: WardrobeItem): Promise<ResaleDraft> {
  const facts = [
    item.subtype && `type: ${item.subtype}`,
    `category: ${item.category}`,
    item.primaryColor && `color: ${item.primaryColor}`,
    item.pattern && `pattern: ${item.pattern}`,
    item.material && `material: ${item.material}`,
    item.formality && `formality: ${item.formality}`,
    item.season.length && `seasons: ${item.season.join(', ')}`,
    item.description && `catalog description: ${item.description}`,
    item.price != null && `original price paid: ${item.price}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { object } = await generateObject({
      abortSignal: aiAbortSignal(),
      model: await textModel(),
      temperature: 0.6,
      schema: resaleSchema,
      instructions:
        'You write secondhand-marketplace listings (Vinted/Poshmark/Depop style). ' +
        'From the garment facts, draft an appealing but honest listing: a punchy ' +
        'title under 70 characters, a description that says what it is and why ' +
        'it is worth buying, a realistic asking-price suggestion (good-condition ' +
        'secondhand typically fetches 20-50% of the original price — state a ' +
        'range in the same currency units as the original price when known, ' +
        'otherwise a typical range for this kind of piece), and a short checklist of condition ' +
        'points the seller should verify and photograph. Never invent brand ' +
        'names, sizes, flaws, or history that are not in the facts.',
      prompt: `Garment facts:\n${facts}`,
    });
    return object;
  } catch (err) {
    const message = aiErrorMessage(err, 'The listing model failed');
    throw new HttpError(502, message);
  }
}

export interface CandidateWhy {
  fit?: string | null;
  colour?: string | null;
  formality?: string | null;
  weather?: string | null;
}

export interface SuggestedOutfit {
  items: WardrobeItem[];
  rationale: string;
  /** The model's reasons per axis, kept apart so a caller can drop the one a warning contradicts. */
  why?: CandidateWhy;
}

// Structured slots: one id per slot (null when the slot is empty), so the
// shape itself says "one bottom, one pair of shoes" and the model cannot
// hand back two trousers. Nullable rather than optional: strict providers
// reject optional properties.
const candidateSchema = z.object({
  base: z.string().nullable(),
  mid: z.string().nullable(),
  outer: z.string().nullable(),
  bottom: z.string().nullable(),
  onePiece: z.string().nullable(),
  footwear: z.string(),
  accessories: z.array(z.string()),
  why: z.object({
    fit: z.string(),
    colour: z.string(),
    formality: z.string(),
    weather: z.string(),
  }),
});

const outfitsSchema = z.object({
  candidates: z.array(candidateSchema),
});

/** Facts the proposer can use that the closet row alone does not carry. */
export type CatalogItem = WardrobeItem &
  Partial<{ wearCount: number; passedOver: number; chosenInstead: number; lastWornDays: number | null }>;

function detailOf(details: unknown, key: string): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const v = (details as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function catalogLine(item: CatalogItem): string {
  const role = item.subtype ? deriveLayerRole(item.category, item.subtype) ?? item.layerRole : item.layerRole;
  const needsLayer = deriveNeedsLayer(item.subtype, item.details, item.material, item.formalityScore);
  const shoeFormality = item.category === 'footwear' ? shoeFormalityOf(item.subtype, item.formalityScore) : null;
  const details = ['neckline', 'sleeve', 'rise', 'leg', 'heel', 'toe']
    .map((k) => [k, detailOf(item.details, k)] as const)
    .filter((d): d is readonly [string, string] => d[1] != null)
    .map(([k, v]) => `${k}:${v}`);
  const facts: string[] = [];
  if (item.wearCount != null) facts.push(`worn ${item.wearCount}×`);
  if (item.lastWornDays != null) facts.push(`last worn ${item.lastWornDays}d ago`);
  if (item.passedOver) facts.push(`passed over ${item.passedOver}×`);
  if (item.chosenInstead) facts.push(`chosen instead ${item.chosenInstead}×`);
  return [
    `id=${item.id}`,
    item.category,
    item.subtype,
    item.primaryColor && `colour:${item.primaryColor}`,
    item.secondaryColor && `second colour:${item.secondaryColor}`,
    item.pattern && `pattern:${item.pattern}`,
    item.material && `material:${item.material}`,
    item.fit && `fit:${item.fit}`,
    item.length && `length:${item.length}`,
    item.weight && `weight:${item.weight}`,
    item.texture && `texture:${item.texture}`,
    item.formality && `formality:${item.formality}${item.formalityScore != null ? ` (${item.formalityScore}/5)` : ''}`,
    shoeFormality != null && `shoe formality:${shoeFormality}/5`,
    role && `slot:${role}`,
    needsLayer && 'needs a layer over it',
    item.warmthValue != null && `warmth:${item.warmthValue}/10`,
    item.season.length && `season:${item.season.join('/')}`,
    item.occasions?.length && `for:${item.occasions.join('/')}`,
    details.length && details.join(' '),
    facts.length && facts.join(', '),
  ]
    .filter(Boolean)
    .join(' | ');
}

export interface SuggestOptions {
  /** The taste layer's prompt block and favourite look, when the record is warm. */
  taste?: TasteProfileData | null;
  favourite?: FavouriteOutfit | null;
  /** Item sets already shown ("Another"): the model must not hand one back. */
  exclude?: string[][];
  /** "Do not: …" lines from a failed first pass. */
  constraints?: string[];
}

export const HARD_RULES =
  'Hard rules, every candidate: (1) exactly one bottom OR one one-piece, never both, never two; ' +
  '(2) exactly one footwear; (3) a base top (shirt, tee, blouse, knit) under any blazer, jacket or coat — the only exception is a knit mid layer (sweater, cardigan, hoodie) worn as the top; ' +
  '(4) camisoles, tanks, vest tops and anything marked "needs a layer over it" get a mid or outer layer for work, evening and occasion settings; ' +
  '(5) shoe formality within one step below or two above the formality of the bottom; trainers never under tailored trousers, pumps never over sweatpants; ' +
  '(6) never an item whose category is "other"; (7) respect the warmth for the weather and the season tags; ' +
  '(8) every id must come from the catalogue, each used once; (9) follow the "how they actually dress" notes when given.';

// Assemble outfits using ONLY the user's owned items, referenced by id.
// Candidates are proposed here, slot by slot, and validated deterministically
// by the caller; the slots are mapped back to `items` so callers are unchanged.
export async function suggestOutfits(
  items: CatalogItem[],
  context: string,
  count = 4,
  opts: SuggestOptions = {},
): Promise<SuggestedOutfit[]> {
  const catalog = items.map(catalogLine).join('\n');
  const byId = new Map(items.map((i) => [i.id, i]));
  const name = (id: string) => {
    const i = byId.get(id);
    return i ? `${i.subtype ?? i.category} (id=${id})` : `id=${id}`;
  };

  const extras: string[] = [];
  const tasteBlock = tastePromptBlock(opts.taste);
  if (tasteBlock) extras.push(tasteBlock);
  if (opts.favourite) {
    extras.push(`They often wear ${opts.favourite.itemIds.map(name).join(', ')} for this kind of day; proposing it again is welcome if it suits the weather.`);
  }
  if (opts.exclude?.length) {
    extras.push(
      `Do not reuse this exact set: ${opts.exclude.map((set) => `[${set.join(', ')}]`).join('; ')}. Prefer a different bottom or different footwear from those.`,
    );
  }
  if (opts.constraints?.length) {
    extras.push(
      `A first pass failed the rules; fix the faults below without dropping slots — every candidate is still complete (a top or one-piece, a bottom unless one-piece, footwear). ${opts.constraints.join(' ')}`,
    );
  }

  let parsed: z.infer<typeof outfitsSchema>;
  try {
    const { object } = await generateObject({
      abortSignal: aiAbortSignal(),
      model: await textModel(),
      temperature: 0.7,
      schema: outfitsSchema,
      instructions:
        `You are a personal stylist. Propose ${count} complete, wearable outfit candidates using ONLY ` +
        'the items in the wardrobe catalogue, referenced by their exact ids, one id per slot. ' +
        'Slots: base (shirt/tee/blouse), mid (knit, cardigan, blazer, waistcoat), outer (coat/jacket), bottom, onePiece (dress/jumpsuit), ' +
        'footwear, accessories. Set a slot to null when it is empty. Make the candidates differ from each other in the bottom or the footwear. ' +
        HARD_RULES +
        ' For each candidate fill "why" with one short plain sentence per axis — fit (proportion/silhouette), colour, formality (why it sits right for the setting), weather — ' +
        'each at most 14 words, British spelling, first person as the stylist, no praise words, no ids, no item lists.',
      prompt: `Context: ${context}${extras.length ? `\n\n${extras.join('\n\n')}` : ''}\n\nWardrobe catalogue:\n${catalog}`,
    });
    parsed = object;
  } catch (err) {
    const message = aiErrorMessage(err, 'The stylist model failed');
    throw new HttpError(502, message);
  }

  const outfits: SuggestedOutfit[] = [];
  for (const c of parsed.candidates ?? []) {
    const ids = [c.base, c.mid, c.outer, c.bottom, c.onePiece, c.footwear, ...(c.accessories ?? [])].filter((x): x is string => !!x);
    // Keep only real, de-duplicated items (guards against hallucinated ids).
    const resolved = [...new Set(ids)].map((id) => byId.get(id)).filter((i): i is WardrobeItem => !!i);
    if (resolved.length === 0) continue;
    const why: CandidateWhy = { fit: c.why?.fit || null, colour: c.why?.colour || null, formality: c.why?.formality || null, weather: c.why?.weather || null };
    outfits.push({ items: resolved, rationale: why.fit || why.colour || why.formality || why.weather || '', why });
  }

  if (outfits.length === 0) {
    throw new HttpError(502, 'Could not assemble an outfit from your wardrobe');
  }
  return outfits;
}
