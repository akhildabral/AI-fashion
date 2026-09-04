import { generateObject } from 'ai';
import { z } from 'zod/v4';
import type { StyleProfile } from '@prisma/client';
import { env } from '../config/env';
import { aiAbortSignal, aiErrorMessage, textModel } from '../lib/ai';
import { generateImage } from '../lib/imagegen';
import { saveImageBuffer } from '../lib/storage';
import { HttpError } from '../middleware/error';
import { deriveLayerRole, warmthFor, type EventType, type Season } from '../lib/attributes';
import { catalogLine, HARD_RULES, type CatalogItem } from './wardrobe.service';
import { enumerateFromPool, verdictOf, type Verdict } from './compose.service';
import { roleOf, validateOutfit, type ValidatorItem } from './validator.service';

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

/** A piece the look needs that the closet does not hold: "you'd need a cream silk blouse". */
export interface WantedPiece {
  wanted: string;
  slot: string;
}

export interface GeneratedLook {
  outfit: Omit<OutfitPlan, 'rationale' | 'imagePrompt'>;
  rationale: string;
  imageUrl: string | null;
  /** Closet-aware mode: the owned pieces the look is built from, what it still needs, and the rules' verdict. */
  ownedItemIds: string[];
  wanted: WantedPiece[];
  verdict: Verdict | null;
}

export interface ClosetAwareOptions {
  /** The pre-filtered styleable pool; the model builds from these ids first. */
  closet: CatalogItem[];
  eventType: EventType;
  season?: Season;
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
          // Closet-aware mode: the exact catalogue id this piece IS, or null
          // when the look needs something the closet does not hold.
          ownedId: z.string().nullable(),
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

/** "a cream silk blouse" — a wanted piece in a phrase. */
export function wantedPhraseOf(piece: Pick<LookPiece, 'color' | 'material' | 'subtype'>): string {
  const subtype = (piece.subtype ?? '').trim().toLowerCase();
  // "silk blouse" already says silk; "black loafers" already says black.
  const words = [piece.color, piece.material].map((w) => (w ?? '').trim().toLowerCase()).filter((w) => w && !subtype.includes(w));
  const phrase = [...words, subtype].filter(Boolean).join(' ');
  return `${/^[aeiou]/.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

/** The slot a look piece fills, from its category and subtype. */
export function slotOfPiece(piece: Pick<LookPiece, 'category' | 'subtype'>): string {
  return deriveLayerRole(piece.category, piece.subtype) ?? piece.category;
}

/** An owned piece in the look's own vocabulary, so the look renders like the rest. */
export function pieceFromItem(item: CatalogItem): LookPiece {
  const category = (['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'dress'] as const).find((c) => c === item.category) ?? 'accessory';
  const subtype = item.subtype ?? item.category;
  const color = item.primaryColor ?? '';
  return {
    category,
    subtype,
    color,
    material: item.material,
    pattern: item.pattern,
    render: item.renderNotes ?? item.description ?? [color, item.material, subtype].filter(Boolean).join(' '),
  };
}

async function planLooks(
  occasion: string,
  gender: string,
  profile: StyleProfile | null,
  count: number,
  closet?: ClosetAwareOptions,
): Promise<OutfitPlan[]> {
  const closetAware = !!closet && closet.closet.length > 0;
  const catalogue = closetAware ? closet!.closet.map(catalogLine).join('\n') : '';
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
        `describe ${MODEL_FRAME}; name each garment as in its render line; no text, no props. ` +
        (closetAware
          ? 'The client OWNS the pieces in the wardrobe catalogue below. Build each look primarily from owned pieces: ' +
            'for every piece that is an owned item, set "ownedId" to that item\'s exact id and describe the piece as the catalogue has it ' +
            '(its colour, subtype, material, pattern). Set "ownedId" to null ONLY for a piece the closet cannot supply — at most two per look — ' +
            'and describe that piece concretely so the client knows what to buy. Each owned id is used at most once per look. ' +
            `The occasion is a ${closet!.eventType} setting. ` +
            HARD_RULES
          : 'Set "ownedId" to null on every piece.'),
      prompt:
        `Client profile:\n${describeProfile(profile)}\n\n` +
        `Occasion: ${occasion}\nGender presentation: ${gender}\n\n` +
        (closetAware ? `Wardrobe catalogue (owned):\n${catalogue}\n\n` : '') +
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

type PlannedPiece = OutfitPlan['pieces'][number] & { ownedId?: string | null };

/** A wanted piece as the validator sees it: the slot it fills, a plain clean piece. */
function ghostOf(piece: LookPiece, index: number): ValidatorItem {
  return {
    id: `wanted-${index}`,
    category: piece.category,
    layerRole: deriveLayerRole(piece.category, piece.subtype),
    warmthValue: warmthFor(piece.category, piece.subtype, piece.material),
    formalityScore: null,
    state: 'clean',
    subtype: piece.subtype,
    pattern: piece.pattern,
    material: piece.material,
  };
}

interface ResolvedLook {
  plan: OutfitPlan;
  ownedItemIds: string[];
  wanted: WantedPiece[];
  verdict: Verdict | null;
}

/**
 * Closet-aware resolution: owned ids are honoured (a hallucinated id is a
 * wanted piece, not an owned one), non-owned pieces are marked wanted, and
 * every look is judged by the validator with the wanted pieces standing in
 * as plain ghosts. An owned-only look that fails is rebuilt from the pool
 * around its first piece; when that finds nothing, it is dropped.
 */
export function resolveClosetLooks(plans: OutfitPlan[], closet: ClosetAwareOptions): ResolvedLook[] {
  const byId = new Map(closet.closet.map((i) => [i.id, i]));
  const validatorItem = (i: CatalogItem): ValidatorItem => ({
    id: i.id,
    category: i.category,
    layerRole: i.layerRole,
    warmthValue: i.warmthValue,
    formalityScore: i.formalityScore,
    state: i.state,
    cutFor: i.cutFor,
    subtype: i.subtype,
    season: i.season,
    pattern: i.pattern,
    material: i.material,
    texture: i.texture,
    details: i.details,
  });
  const hasCleanFootwear = closet.closet.some((i) => roleOf(i) === 'footwear');
  const judge = (items: ValidatorItem[]) =>
    verdictOf(validateOutfit(items, { eventType: closet.eventType, season: closet.season, hasCleanFootwear }));

  const out: ResolvedLook[] = [];
  for (const plan of plans) {
    const used = new Set<string>();
    const pieces: LookPiece[] = [];
    const ownedItemIds: string[] = [];
    const wanted: WantedPiece[] = [];
    const ghosts: ValidatorItem[] = [];
    for (const p of plan.pieces as PlannedPiece[]) {
      const item = p.ownedId ? byId.get(p.ownedId) : undefined;
      if (item && !used.has(item.id)) {
        used.add(item.id);
        ownedItemIds.push(item.id);
        // The catalogue's own words for the piece, not the model's paraphrase.
        pieces.push(pieceFromItem(item));
      } else {
        const { ownedId: _dropped, ...piece } = p;
        void _dropped;
        pieces.push(piece);
        wanted.push({ wanted: wantedPhraseOf(piece), slot: slotOfPiece(piece) });
        ghosts.push(ghostOf(piece, ghosts.length));
      }
    }
    const ownedItems = ownedItemIds.map((id) => byId.get(id)!);
    let verdict = judge([...ownedItems.map(validatorItem), ...ghosts]);

    if (wanted.length === 0 && !verdict.ok) {
      // Owned-only and wrong: the pool's own enumeration, pinned to the first piece.
      const [fixed] = enumerateFromPool(closet.closet, { eventType: closet.eventType, season: closet.season, pin: ownedItems[0] ?? null, limit: 1, hasCleanFootwear });
      if (!fixed) continue;
      const items = fixed.items as CatalogItem[];
      const fixedPieces = items.map(pieceFromItem);
      verdict = judge(items.map(validatorItem));
      out.push({ plan: { ...plan, pieces: fixedPieces, items: itemsOf(fixedPieces), palette: paletteOf(fixedPieces) }, ownedItemIds: items.map((i) => i.id), wanted: [], verdict });
      continue;
    }
    out.push({ plan: { ...plan, pieces }, ownedItemIds, wanted, verdict });
  }
  return out;
}

/** The legacy per-slot text fields, from the pieces. */
function itemsOf(pieces: LookPiece[]): OutfitPlan['items'] {
  const line = (cat: LookPiece['category']) =>
    pieces
      .filter((p) => p.category === cat)
      .map((p) => `${p.color} ${p.subtype}`.trim())
      .join(', ');
  return {
    top: line('top') || line('dress'),
    bottom: line('bottom'),
    outerwear: line('outerwear'),
    footwear: line('footwear'),
    accessories: pieces.filter((p) => p.category === 'accessory').map((p) => `${p.color} ${p.subtype}`.trim()),
  };
}

function paletteOf(pieces: LookPiece[]): string[] {
  return [...new Set(pieces.map((p) => p.color).filter(Boolean))];
}

export async function generateLooks(
  occasion: string,
  gender: string,
  profile: StyleProfile | null,
  closet?: ClosetAwareOptions,
): Promise<GeneratedLook[]> {
  const count = env.LOOKS_PER_REQUEST;
  const plans = await planLooks(occasion, gender, profile, count, closet);

  let resolved: ResolvedLook[];
  if (closet && closet.closet.length > 0) {
    resolved = resolveClosetLooks(plans, closet);
    if (resolved.length === 0) {
      // Every look failed the rules: the pool's own best outfits stand in.
      const fallback = enumerateFromPool(closet.closet, { eventType: closet.eventType, season: closet.season, limit: count });
      resolved = fallback.map((o) => {
        const items = o.items as CatalogItem[];
        const pieces = items.map(pieceFromItem);
        const v = validateOutfit(items, { eventType: closet.eventType, season: closet.season });
        return {
          plan: { title: 'From your closet', items: itemsOf(pieces), pieces, palette: paletteOf(pieces), rationale: 'Built from what you own, by the rules.', imagePrompt: `${MODEL_FRAME}: ${pieces.map((p) => p.render).join('; ')}` },
          ownedItemIds: items.map((i) => i.id),
          wanted: [],
          verdict: verdictOf(v),
        };
      });
    }
    if (resolved.length === 0) throw new HttpError(502, 'Could not build a look from your closet');
  } else {
    resolved = plans.map((plan) => ({
      plan: { ...plan, pieces: plan.pieces.map((p) => { const { ownedId: _o, ...rest } = p as PlannedPiece; void _o; return rest; }) },
      ownedItemIds: [],
      wanted: [],
      verdict: null,
    }));
  }

  // Render all images concurrently.
  const images = await Promise.all(resolved.map((r) => renderOutfitImage(r.plan.imagePrompt)));

  return resolved.map((r, i) => ({
    outfit: { items: r.plan.items, palette: r.plan.palette, pieces: r.plan.pieces, title: r.plan.title },
    rationale: r.plan.rationale,
    imageUrl: images[i] ?? null,
    ownedItemIds: r.ownedItemIds,
    wanted: r.wanted,
    verdict: r.verdict,
  }));
}
