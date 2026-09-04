import { generateObject } from 'ai';
import { z } from 'zod/v4';
import type { WardrobeItem } from '@prisma/client';
import { aiAbortSignal, aiErrorMessage, textModel, visionModel } from '../lib/ai';
import { HttpError } from '../middleware/error';
import { DRESS_CODES, EVENT_TYPES, PATTERN_SCALES, SHOE_TYPES } from '../lib/attributes';
import {
  deriveLayerRole,
  deriveNeedsLayer,
  deriveShoeFormality,
  formalityScoreFor,
  normalizeColorName,
  shoeFormalityOf,
  warmthFor,
} from '../lib/attributes';
import { deriveColourAttributes, type HueFamily, type SaturationBand } from '../lib/color';
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
  // Wearability, second edition. Null where the model abstained; the second
  // pass fills what it can.
  patternScale: string | null;
  sheer: boolean | null;
  dressCode: string | null;
  /** The model's opinion alone; `deriveNeedsLayer` stays the floor (union at write). */
  needsLayer: boolean | null;
  /** Footwear only. */
  shoeType: string | null;
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
  // Wearability: how big the pattern reads from across a room; whether the
  // fabric shows what is under it; the finest dress code it passes; whether
  // it wants a layer over it in a dressed setting; the kind of shoe.
  patternScale: z.enum(PATTERN_SCALES),
  sheer: z.boolean(),
  dressCode: z.enum(DRESS_CODES),
  needsLayer: z.boolean(),
  // Footwear only; "other" for anything that is not a shoe.
  shoeType: z.enum(SHOE_TYPES),
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
    patternScale: confidenceSchema,
    sheer: confidenceSchema,
    dressCode: confidenceSchema,
    needsLayer: confidenceSchema,
    shoeType: confidenceSchema,
  }),
});

const WEARABILITY_FIELDS = ['patternScale', 'sheer', 'dressCode', 'needsLayer', 'shoeType'] as const;
export type WearabilityField = (typeof WEARABILITY_FIELDS)[number];

const WEARABILITY_GUIDE =
  'patternScale is how large the pattern reads from across a room: none for a solid, ' +
  'fine for pinstripes, micro-checks and small dots, medium for a classic stripe or plaid, ' +
  'bold for large florals, big checks, graphics and animal prints. sheer is true when the ' +
  'fabric shows skin or a layer under it (mesh, lace, chiffon, organza, a thin white cotton). ' +
  'dressCode is the most dressed setting the piece passes in as it is: athleisure, casual, ' +
  'smart-casual, business-casual, business, cocktail, formal. needsLayer is true when the ' +
  'piece does not finish an outfit on its own in a dressed setting (a camisole, a tank, a ' +
  'sheer or strapless top). shoeType is the kind of shoe for footwear and "other" for anything else.';

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
        'sits, how big it is, its shape and its colours. Only what is visible. ' +
        WEARABILITY_GUIDE,
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

  const conf: Record<string, number> = { ...(raw.confidence ?? {}) };
  const keep = (field: keyof typeof conf, value: string): string | null =>
    (conf[field] ?? 1) >= ABSTAIN_BELOW && value.trim() ? value.trim() : null;
  const keepBool = (field: keyof typeof conf, value: boolean | undefined): boolean | null =>
    value != null && (conf[field] ?? 1) >= ABSTAIN_BELOW ? value : null;

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
    patternScale: keep('patternScale', raw.patternScale ?? ''),
    sheer: keepBool('sheer', raw.sheer),
    dressCode: keep('dressCode', raw.dressCode ?? ''),
    needsLayer: keepBool('needsLayer', raw.needsLayer),
    shoeType: raw.category === 'footwear' ? keep('shoeType', raw.shoeType ?? '') : null,
    attrConfidence: conf,
  };
}

// --- The wearability second pass -------------------------------------------
// The first pass reads everything at once and is allowed to abstain. What it
// left uncertain among the wearability questions goes to the vision model
// once more, with the cut-out and the first-pass tags, and only those
// questions to answer. Gated so a confident first pass costs nothing extra;
// time-boxed so a slow provider cannot hold the catalogue open; and never
// fatal — on any failure the first-pass values stand.

/** Below this the first pass is not trusted on a wearability question. */
export const SECOND_PASS_BELOW = 0.6;
export const SECOND_PASS_TIMEOUT_MS = 20_000;

/** The wearability fields the first pass left missing or unsure — empty when a second pass would be a waste. */
export function uncertainWearability(tags: Pick<GarmentTags, 'category' | 'attrConfidence' | WearabilityField>): WearabilityField[] {
  const out: WearabilityField[] = [];
  for (const f of WEARABILITY_FIELDS) {
    if (f === 'shoeType' && tags.category !== 'footwear') continue;
    if (tags[f] == null || (tags.attrConfidence[f] ?? 0) < SECOND_PASS_BELOW) out.push(f);
  }
  return out;
}

const secondPassSchema = z.object({
  patternScale: z.enum(PATTERN_SCALES),
  sheer: z.boolean(),
  dressCode: z.enum(DRESS_CODES),
  needsLayer: z.boolean(),
  shoeType: z.enum(SHOE_TYPES),
  confidence: z.object({
    patternScale: confidenceSchema,
    sheer: confidenceSchema,
    dressCode: confidenceSchema,
    needsLayer: confidenceSchema,
    shoeType: confidenceSchema,
  }),
});

function firstPassSummary(tags: GarmentTags): string {
  return [
    `category: ${tags.category}`,
    tags.subtype && `type: ${tags.subtype}`,
    tags.primaryColor && `colour: ${tags.primaryColor}`,
    tags.pattern && `pattern: ${tags.pattern}`,
    tags.material && `material: ${tags.material}`,
    tags.formality && `formality: ${tags.formality}`,
    tags.fit && `fit: ${tags.fit}`,
    tags.length && `length: ${tags.length}`,
    tags.weight && `weight: ${tags.weight}`,
    tags.description && `description: ${tags.description}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Answer the wearability questions the first pass left open, on the vision
 * model (the text model when there is none). Returns the tags with those
 * fields filled where the second pass was sure enough; the first-pass values
 * on any failure. Does not run when nothing is uncertain.
 */
export async function refineWearability(image: Buffer, mime: string, tags: GarmentTags): Promise<GarmentTags> {
  const asked = uncertainWearability(tags);
  if (asked.length === 0) return tags;
  let model;
  try {
    model = await visionModel();
  } catch {
    model = await textModel();
  }
  let raw: z.infer<typeof secondPassSchema>;
  try {
    const { object } = await generateObject({
      abortSignal: aiAbortSignal(SECOND_PASS_TIMEOUT_MS),
      model,
      temperature: 0,
      schema: secondPassSchema,
      instructions:
        'You are a fashion cataloguer taking a second, closer look at one garment. ' +
        'Answer only these wearability questions, from the image, with an honest confidence for each: ' +
        WEARABILITY_GUIDE +
        ' Every field must be filled; put your uncertainty in the confidence, not in the answer.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `The first read of this piece said:\n${firstPassSummary(tags)}\n\nAnswer only these wearability questions: ${asked.join(', ')}.`,
            },
            { type: 'file', data: image, mediaType: mime },
          ],
        },
      ],
    });
    raw = object;
  } catch (err) {
    console.error('Wearability second pass failed:', err instanceof Error ? err.message : err);
    return tags;
  }
  const out: GarmentTags = { ...tags, attrConfidence: { ...tags.attrConfidence } };
  const conf = raw.confidence ?? {};
  for (const f of asked) {
    const c = conf[f] ?? 0;
    // A second opinion no surer than the first is not an answer.
    if (c < ABSTAIN_BELOW || c < (tags.attrConfidence[f] ?? 0)) continue;
    const value = f === 'shoeType' && tags.category !== 'footwear' ? null : raw[f];
    if (value == null) continue;
    (out as unknown as Record<string, unknown>)[f] = value;
    out.attrConfidence[f] = c;
  }
  return out;
}

/** The catalogue read: the first pass, then the wearability second pass where the first was unsure. */
export async function catalogTags(image: Buffer, mime: string): Promise<GarmentTags> {
  const tags = await tagGarment(image, mime);
  return refineWearability(image, mime, tags);
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
export interface ReasoningAttributes {
  layerRole: string | null;
  warmthValue: number | null;
  formalityScore: number | null;
  /** Only when a palette was given: the family and vividness read from its dominant colour. */
  colourFamily?: HueFamily;
  colourVividness?: SaturationBand;
}

export function deriveReasoningAttributes(tags: {
  category: string;
  subtype: string | null;
  material: string | null;
  formality: string | null;
  shoeType?: string | null;
  colorPalette?: unknown;
}): ReasoningAttributes {
  // Footwear formality comes off the shoe ladder (sneaker 2, loafer 3, oxford
  // 4 …), then the catalogued shoe type, and falls back to the garment tag
  // for a subtype the ladder doesn't know.
  const formalityScore =
    tags.category === 'footwear'
      ? deriveShoeFormality(tags.subtype) ?? (tags.shoeType && tags.shoeType !== 'other' ? deriveShoeFormality(tags.shoeType) : null) ?? formalityScoreFor(tags.formality)
      : formalityScoreFor(tags.formality);
  const colour = tags.colorPalette != null ? deriveColourAttributes(tags.colorPalette) : null;
  return {
    layerRole: deriveLayerRole(tags.category, tags.subtype),
    warmthValue: warmthFor(tags.category, tags.subtype, tags.material),
    formalityScore,
    ...(colour ?? {}),
  };
}

/**
 * Colour family and vividness for a row that predates them: derived from its
 * palette, in memory, never written. Rows that carry them are returned as is.
 */
export function withColourAttributes<T extends { colorPalette?: unknown; colourFamily?: string | null; colourVividness?: string | null }>(item: T): T {
  if ((item.colourFamily && item.colourVividness) || item.colorPalette == null) return item;
  const colour = deriveColourAttributes(item.colorPalette);
  return colour ? { ...item, ...colour } : item;
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
  const needsLayer = item.needsLayer === true || deriveNeedsLayer(item.subtype, item.details, item.material, item.formalityScore);
  const shoeFormality = item.category === 'footwear' ? shoeFormalityOf(item.subtype, item.formalityScore, item.shoeType) : null;
  const colour = withColourAttributes(item);
  const colourRead = colour.colourFamily ? (colour.colourFamily === 'neutral' ? 'neutral' : `${colour.colourVividness} ${colour.colourFamily}`) : '';
  // "colour:red (vivid red)"; just the reading when the name was never tagged.
  const colourNote = colourRead ? (item.primaryColor ? ` (${colourRead})` : colourRead) : '';
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
    (item.primaryColor || colourNote) && `colour:${item.primaryColor ?? ''}${colourNote}`,
    item.secondaryColor && `second colour:${item.secondaryColor}`,
    item.pattern && `pattern:${item.pattern}${item.patternScale && item.patternScale !== 'none' ? ` (${item.patternScale})` : ''}`,
    item.sheer && 'sheer',
    item.material && `material:${item.material}`,
    item.fit && `fit:${item.fit}`,
    item.length && `length:${item.length}`,
    item.weight && `weight:${item.weight}`,
    item.texture && `texture:${item.texture}`,
    item.formality && `formality:${item.formality}${item.formalityScore != null ? ` (${item.formalityScore}/5)` : ''}`,
    item.dressCode && `dress code:${item.dressCode}`,
    item.shoeType && item.shoeType !== 'other' && `shoe:${item.shoeType}`,
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
  '(8) every id must come from the catalogue, each used once; (9) follow the "how they actually dress" notes when given; ' +
  '(10) colour: at most two vivid hues in one outfit, and two vivid hues that clash (red with green, orange with blue) never together — a neutral goes with anything; ' +
  '(11) sheer pieces get a layer over them for work and occasion settings; for cocktail and formal occasions the bottom and the footwear carry a dress code of business-casual or above; two bold patterns never together.';

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
