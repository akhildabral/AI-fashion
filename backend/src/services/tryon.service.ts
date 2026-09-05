import { editImage, imagesEnabled, type SourceImage } from '../lib/imagegen';
import { keyFromStored, mimeForKey, readStored, saveImageBuffer } from '../lib/storage';
import { HttpError } from '../middleware/error';
import { composeReferenceBoard, cropPersonFromBoard } from '../lib/reference-board';
import { checkPhotoFraming, corrections as correctionLines, safeCheck, scoreFidelity, type CheckedGarment, type FidelityResult } from './fidelity.service';

// The Mirror's renderer. Two modes behind one seam:
//   references — the person plus every garment cut-out, each introduced by
//                name, with a prompt that pins colour, print, sleeve length,
//                trouser cut and shoe model to the pictures. The render is
//                the person's own clothes. The default.
//   text       — the person alone, garments described from catalog tags.
//                The earlier path; kept behind TRYON_MODE=text for comparison.
// A dedicated try-on model (FASHN, IDM-VTON, …) would slot in behind the
// same runEdit() without touching callers.
//
// Every render is followed by a fidelity check (fidelity.service): the
// render beside the cut-outs, judged piece by piece. A miss earns one more
// render — always from the ORIGINAL photo, never from the render, since an
// edit of an edit drifts the person. The verdict travels with the render.

export type TryOnMode = 'references' | 'text';

// References is the default: the garment pictures are what make a render
// recognisably THIS tee and THESE shoes — words alone leave sleeve length,
// trouser cut and the shoe model to the model's imagination. The
// image-capable Gemini follows multi-image references well when each image
// is introduced by name and the prompt says what to copy from each.
export function defaultTryOnMode(): TryOnMode {
  return process.env.TRYON_MODE === 'text' ? 'text' : 'references';
}

// How the references travel. board (default): the person and a numbered
// panel of the cut-outs composed into ONE image, edited in place, the
// person cropped back out — the only transport the image model treats as
// an edit of the photograph. multi: the person and each cut-out as separate
// labelled images; the garments come out right but the model re-composes
// the scene and loses the person. Kept behind TRYON_REFERENCES=multi.
export type ReferencesTransport = 'board' | 'multi';
export function referencesTransport(): ReferencesTransport {
  return process.env.TRYON_REFERENCES === 'multi' ? 'multi' : 'board';
}

interface OutfitItems {
  top?: string;
  bottom?: string;
  outerwear?: string;
  footwear?: string;
  accessories?: string[];
}

function describeOutfit(outfit: unknown): string {
  // A look with pieces carries a rendering line per garment — the same
  // brief a closet piece gets — and that is what the Mirror dresses with.
  const pieces = (outfit as { pieces?: { category: string; render?: string; color?: string; subtype?: string }[] } | null)?.pieces;
  if (pieces?.length) {
    return pieces.map((p) => `${p.category}: ${p.render?.trim() || [p.color, p.subtype].filter(Boolean).join(' ')}`).join('; ');
  }
  const items = (outfit as { items?: OutfitItems } | null)?.items ?? {};
  const parts = [
    items.top && `top: ${items.top}`,
    items.bottom && `bottom: ${items.bottom}`,
    items.outerwear && `outerwear: ${items.outerwear}`,
    items.footwear && `footwear: ${items.footwear}`,
    items.accessories?.length && `accessories: ${items.accessories.join(', ')}`,
  ].filter(Boolean);
  return parts.join('; ');
}

async function sourceFromStored(stored: string, missingMessage: string, label?: string, kind: SourceImage['kind'] = 'photo'): Promise<SourceImage> {
  let data: Buffer;
  try {
    data = await readStored(stored);
  } catch {
    throw new HttpError(400, missingMessage);
  }
  return { data, mime: mimeForKey(keyFromStored(stored)), label, kind };
}

function requireImages(): void {
  if (!imagesEnabled()) {
    throw new HttpError(503, 'Image generation is not configured — set IMAGE_PROVIDER (and IMAGE_API_KEY if needed)');
  }
}

export interface RenderResult {
  url: string;
  prompt: string;
  mode: TryOnMode | 'look';
}

async function runEditToBuffer(prompt: string, sources: SourceImage[], opts: { promptAfterImages?: boolean } = {}): Promise<Buffer> {
  try {
    const image = await editImage(prompt, sources, opts);
    if (!image) throw new HttpError(502, 'Try-on generation returned no image');
    return image;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : 'Try-on generation failed';
    throw new HttpError(502, message);
  }
}

async function runEdit(prompt: string, sources: SourceImage[]): Promise<string> {
  return (await saveImageBuffer(await runEditToBuffer(prompt, sources), 'png')).url;
}

export const KEEP =
  'Keep everything else identical: the same face, identity, hair, skin tone, body, pose, ' +
  'background, lighting, and framing. Preserve the photograph’s full resolution, sharpness ' +
  'and detail. Never replace the person with a different person or model. Photorealistic.';

// Render a generated look (no wardrobe pieces) onto the user's photo.
export async function generateTryOn(photoFilename: string, outfit: unknown): Promise<string> {
  requireImages();
  const person = await sourceFromStored(photoFilename, 'Your uploaded photo could not be found; please re-upload it');
  const prompt =
    'Edit this photograph so the very same person is dressed in a different outfit. Remove ALL the clothing ' +
    'they are currently wearing and dress them instead in exactly these garments, all together: ' +
    `${describeOutfit(outfit)}. Every detail named must appear as described: the stated shade, fabric, cut, ` +
    `closures and hardware. Do not simplify a garment into a plain one. Fit each piece naturally to their body at true-to-life proportions. ${KEEP}`;
  return runEdit(prompt, [person]);
}

export interface TryOnItem {
  id?: string;
  imageUrl: string;
  category: string;
  subtype: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  material?: string | null;
  pattern?: string | null;
  description?: string | null;
  /** Per-type details as catalogued: { neckline, sleeve, rise, leg, heel, toe, closure }. */
  details?: unknown;
  length?: string | null;
  fit?: string | null;
  shoeType?: string | null;
  /** The rendering brief read from the cut-out: shade, fabric, closures, every logo and print. */
  renderNotes?: string | null;
}

// The words the Mirror dresses with in text mode. The rendering brief carries
// the details that make a render recognisably THIS piece; the description is
// the fallback.
function describeItem(it: TryOnItem): string {
  if (it.renderNotes?.trim()) return it.renderNotes.trim();
  if (it.description?.trim()) return it.description.trim();
  return [it.primaryColor, it.pattern, it.material, it.subtype?.trim() || it.category].filter(Boolean).join(' ');
}

export function slotWord(it: Pick<TryOnItem, 'category'>): string {
  const c = it.category.toLowerCase();
  if (c === 'footwear') return 'shoes';
  if (c === 'outerwear') return 'outer layer';
  if (c === 'accessory' || c === 'other') return 'accessory';
  if (c === 'dress') return 'dress';
  return c;
}

function detail(details: unknown, key: string): string | null {
  if (!details || typeof details !== 'object') return null;
  const v = (details as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null;
}

function clean(s: string | null | undefined): string | null {
  const v = s?.trim().toLowerCase();
  return v && v !== 'none' && v !== 'other' && v !== 'unknown' ? v : null;
}

/**
 * The attributes of a piece, from its catalog fields, as the short phrases
 * the prompt pins to the picture: "black", "half sleeves", "crew neck",
 * "cotton", "wide leg" — then the rendering brief in full.
 */
export function garmentSpec(it: TryOnItem): string {
  const kind = it.subtype?.trim() || it.category;
  const parts: string[] = [];
  const colour = clean(it.primaryColor);
  const second = clean(it.secondaryColor);
  if (colour) parts.push(second ? `${colour} with ${second}` : colour);
  const pattern = clean(it.pattern);
  if (pattern && pattern !== 'solid' && pattern !== 'plain') parts.push(pattern);
  const material = clean(it.material);
  if (material) parts.push(material);
  parts.push(kind);
  const c = it.category.toLowerCase();
  const sleeve = detail(it.details, 'sleeve');
  const neckline = detail(it.details, 'neckline');
  const rise = detail(it.details, 'rise');
  const leg = detail(it.details, 'leg');
  const heel = detail(it.details, 'heel');
  const toe = detail(it.details, 'toe');
  const closure = detail(it.details, 'closure');
  const shoeType = clean(it.shoeType);
  const length = clean(it.length);
  const fit = clean(it.fit);
  const traits: string[] = [];
  if (sleeve) traits.push(/sleeve/.test(sleeve) ? sleeve : `${sleeve} sleeves`);
  if (neckline) traits.push(/neck/.test(neckline) ? neckline : `${neckline} neckline`);
  if (rise) traits.push(/rise/.test(rise) ? rise : `${rise} rise`);
  if (leg) traits.push(/leg/.test(leg) ? leg : `${leg} leg`);
  if (c === 'footwear' && shoeType && shoeType !== kind.toLowerCase()) traits.push(`a ${shoeType}`);
  if (heel) traits.push(/heel/.test(heel) ? heel : `${heel} heel`);
  if (toe) traits.push(/toe/.test(toe) ? toe : `${toe} toe`);
  if (closure) traits.push(/closure|zip|button|lace/.test(closure) ? closure : `${closure} closure`);
  if (length && length !== 'regular') traits.push(/length/.test(length) ? length : `${length} length`);
  if (fit && fit !== 'regular') traits.push(/fit/.test(fit) ? fit : `${fit} fit`);
  let spec = parts.join(' ');
  if (traits.length) spec += `, ${traits.join(', ')}`;
  const notes = it.renderNotes?.trim() || it.description?.trim();
  if (notes) spec += ` — ${notes.replace(/\s+/g, ' ')}`;
  return spec;
}

type Slot = 'top' | 'bottom' | 'footwear';

function coveredSlots(items: Pick<TryOnItem, 'category'>[]): Set<Slot> {
  const s = new Set<Slot>();
  for (const it of items) {
    const c = it.category.toLowerCase();
    if (c === 'top' || c === 'outerwear') s.add('top');
    if (c === 'bottom') s.add('bottom');
    if (c === 'dress') {
      s.add('top');
      s.add('bottom');
    }
    if (c === 'footwear') s.add('footwear');
  }
  return s;
}

export interface ReferencesPromptOptions {
  /** The reflection stops above the feet: keep the crop, don't invent shoes. */
  shoesOutOfFrame?: boolean;
  /** What a previous attempt got wrong — mandatory fixes, appended verbatim. */
  corrections?: string[];
  /** The garments ride inside the canvas on a panel to the right of the photograph. */
  board?: { width: number; height: number; personWidth: number };
}

export interface ReferencesPrompt {
  prompt: string;
  /** One caption per garment, in order, for the image that follows it. */
  labels: string[];
  personLabel: string;
  /** The words each garment was pinned with — the same brief the checker reads. */
  specs: CheckedGarment[];
}

/**
 * The references-mode brief: every garment by slot, pinned to its picture,
 * with the rules that make sleeve length, trouser cut and the shoe model
 * come from the pictures and nothing come from nowhere. Pure — tested.
 */
export function buildReferencesPrompt(items: TryOnItem[], opts: ReferencesPromptOptions = {}): ReferencesPrompt {
  const n = items.length;
  const specs: CheckedGarment[] = items.map((it) => ({ itemId: it.id, slot: slotWord(it), spec: garmentSpec(it), category: it.category }));
  const lines = specs.map((s, i) => `GARMENT ${i + 1} — the ${s.slot}: copy it exactly as pictured: ${s.spec}.`);
  const labels = specs.map((s, i) => `GARMENT ${i + 1} — the ${s.slot}, a reference picture of the garment only. Copy THIS piece onto the person — its colour, print, fabric, cut and length:`);
  const personLabel = 'PERSON — the base image. The output is THIS photograph with only the clothes changed:';

  const covered = coveredSlots(items);
  const hasShoes = covered.has('footwear');
  const keepSlots: string[] = [];
  if (!covered.has('top')) keepSlots.push('top');
  if (!covered.has('bottom')) keepSlots.push('bottoms');
  if (!covered.has('footwear')) keepSlots.push('shoes');

  const rules: string[] = [
    `Remove the clothing the person is wearing in every slot listed above — ${[covered.has('top') && 'the top and any layer over it', covered.has('bottom') && 'the bottoms', hasShoes && 'the shoes'].filter(Boolean).join(', ')} — and any bag; nothing they had on in those slots remains.`,
    'Each garment must be copied from its own picture, not from its description alone: the same colour and shade, the same print, logo, stripes or badge at the same place and size, the same fabric, the same cut.',
    'Sleeve length must match the picture exactly: a half-sleeve top ends above the elbow, a long sleeve at the wrist — never lengthen or shorten a sleeve.',
    'Trouser length, rise and leg cut must match the picture: a straight leg stays straight, a cropped hem stays cropped.',
  ];
  if (hasShoes) {
    rules.push(
      opts.shoesOutOfFrame
        ? 'The photograph is cropped above the feet: keep that crop exactly — do not extend the canvas or invent feet or shoes.'
        : 'The shoes must be the pictured shoe model — same shape, colour, sole and laces — worn on both feet, fully visible in the frame, replacing whatever the person had on their feet.',
    );
  } else if (opts.shoesOutOfFrame) {
    rules.push('The photograph is cropped above the feet: keep that crop exactly — do not extend the canvas.');
  }
  if (keepSlots.length) {
    rules.push(`No ${keepSlots.join(' or ')} is listed: keep what the person already wears there unchanged from the photograph.`);
  }
  rules.push('Do not add any garment, layer, bag, hat, jewellery or accessory that is not listed. Do not substitute a similar garment. Do not simplify a print into plain fabric.');
  rules.push('Fit each garment naturally to their body at true-to-life proportions with realistic drape and shadow.');
  rules.push(
    opts.board
      ? 'The panel pictures are references for the clothes only: never draw a flat-lay, a second person or a new scene; the photograph keeps its own room, mirror, furniture and light.'
      : 'The GARMENT images are references for the clothes only: never reproduce their flat-lay, background or layout in the output, and never build a new scene around them.',
  );

  const correctionsBlock = opts.corrections?.length
    ? `\n\nCORRECTIONS — a previous attempt got these wrong; they are mandatory this time:\n${opts.corrections.map((c) => `- ${c}`).join('\n')}`
    : '';

  const opening = opts.board
    ? `This ${opts.board.width}×${opts.board.height} image has two parts side by side. LEFT, ${opts.board.personWidth} px wide: a photograph of a person — the PERSON. ` +
      'RIGHT: a light grey panel of numbered reference pictures of pieces from that person\'s own wardrobe, photographed flat; ' +
      'picture 1 is GARMENT 1, picture 2 is GARMENT 2, and so on. Edit the LEFT photograph in place: change ONLY the clothes ' +
      'the person is wearing, so they are wearing the pieces shown in the panel. Leave the RIGHT panel exactly as it is, ' +
      'keep the image at exactly the same size and layout, and keep the LEFT photograph the same person, face, hair, body, ' +
      'pose, expression, framing, crop, background, mirror, furniture and lighting, pixel for pixel wherever there is no clothing.\n\n'
    : 'Using the PERSON image as the base image, edit it in place: change ONLY the clothes the person is wearing. ' +
      'The images labelled GARMENT are pieces from that person\'s own wardrobe, photographed flat, and are references ' +
      'for what the clothes must look like. The output is the PERSON photograph itself — the same person, face, hair, ' +
      'body, pose, expression, framing, crop, aspect ratio, background, mirror, furniture and lighting, pixel for pixel ' +
      'wherever there is no clothing — now wearing these pieces.\n\n';
  const prompt =
    opening +
    `The finished outfit is exactly these ${n} ${n === 1 ? 'piece' : 'pieces'} and nothing else:\n${lines.join('\n')}\n\n` +
    `Rules:\n${rules.map((r) => `- ${r}`).join('\n')}` +
    correctionsBlock +
    `\n\n${KEEP} Do not re-compose the scene, do not change the camera or the crop, do not add borders. ` +
    (opts.board ? 'Output the whole image, edited, at its original size.' : 'Output only the edited PERSON photograph, at its original size.');
  return { prompt, labels, personLabel, specs };
}

export interface OutfitRenderOptions extends ReferencesPromptOptions {
  /** A person image already read, so a retry reuses the ORIGINAL bytes. */
  person?: SourceImage;
  /** Garment cut-outs already read. */
  garments?: SourceImage[];
}

export interface OutfitRender extends RenderResult {
  image: Buffer;
  person: SourceImage;
  garments: SourceImage[];
  specs: CheckedGarment[];
}

async function loadGarments(items: TryOnItem[], labels: string[]): Promise<SourceImage[]> {
  return Promise.all(items.map((it, i) => sourceFromStored(it.imageUrl, 'One of the pieces could not be found; try again from the closet', labels[i], 'cutout')));
}

/**
 * Render the person wearing a set of their OWN pieces, once.
 * references: the cut-outs travel with the request, each introduced by name.
 * text: the person alone, the pieces in words.
 */
export async function generateOutfitTryOn(photoFilename: string, items: TryOnItem[], mode: TryOnMode = defaultTryOnMode(), opts: OutfitRenderOptions = {}): Promise<OutfitRender> {
  requireImages();
  const built = buildReferencesPrompt(items, opts);
  const person = opts.person ?? (await sourceFromStored(photoFilename, 'Your uploaded photo could not be found; please re-upload it', built.personLabel));
  person.label = built.personLabel;
  person.kind = 'photo';

  if (mode === 'text') {
    const outfitDescription = items.map((it) => describeItem(it)).join('; ');
    const correctionsBlock = opts.corrections?.length ? ` CORRECTIONS — a previous attempt got these wrong; they are mandatory this time: ${opts.corrections.join(' ')}` : '';
    const prompt =
      'Edit this photograph so the very same person is dressed in a different outfit. Remove ALL the clothing ' +
      'they are currently wearing — including any dress, top, bottoms, shoes, and bags — and dress them instead in ' +
      `exactly these items, all together: ${outfitDescription}. Every detail named must appear as described — ` +
      'each logo, badge, print or embroidery at its stated place, size, shape and colours; the stated shade, fabric ' +
      'and weave; the collar, sleeves, cuffs, closures and hardware. Do not simplify a garment into a plain one. ' +
      `Fit each piece naturally to their body at true-to-life proportions.${correctionsBlock} ${KEEP}`;
    const image = await runEditToBuffer(prompt, [person]);
    const garments = opts.garments ?? (await loadGarments(items, built.labels));
    return { url: (await saveImageBuffer(image, 'png')).url, prompt, mode, image, person, garments, specs: built.specs };
  }

  const garments = opts.garments ?? (await loadGarments(items, built.labels));
  garments.forEach((g, i) => {
    g.label = built.labels[i];
    g.kind = 'cutout';
  });
  if (referencesTransport() === 'multi') {
    const image = await runEditToBuffer(built.prompt, [person, ...garments], { promptAfterImages: true });
    return { url: (await saveImageBuffer(image, 'png')).url, prompt: built.prompt, mode, image, person, garments, specs: built.specs };
  }
  const board = await composeReferenceBoard(
    person.data,
    garments.map((g) => g.data),
    built.specs.map((sp, i) => `${i + 1} · ${sp.slot.toUpperCase()}`),
  );
  const onBoard = buildReferencesPrompt(items, { ...opts, board: { width: board.width, height: board.height, personWidth: board.personWidth } });
  const raw = await runEditToBuffer(onBoard.prompt, [{ data: board.data, mime: board.mime, kind: 'photo', label: 'The image to edit:' }], { promptAfterImages: true });
  const image = await cropPersonFromBoard(raw, board);
  return { url: (await saveImageBuffer(image, 'png')).url, prompt: onBoard.prompt, mode, image, person, garments, specs: onBoard.specs };
}

export interface CheckedRender extends RenderResult {
  fidelity: FidelityResult;
  /** Whether the reflection is full-length, when it was judged this time — for the caller to cache. */
  photoFullLength?: boolean;
}

export interface RenderOutfitOptions {
  /** Cached framing of the reflection; null/undefined asks the vision model once. */
  fullLength?: boolean | null;
  /** Disable the check and retry (tests, cost control). */
  check?: boolean;
}

/**
 * The whole render: dress, check, and — when a piece is missing or wrong in
 * a major way — dress once more from the ORIGINAL photo with the mistakes
 * named. The check never fails the render; a check that errors leaves the
 * render standing with `fidelity.checked === false`.
 */
export async function renderOutfit(photoFilename: string, items: TryOnItem[], mode: TryOnMode = defaultTryOnMode(), opts: RenderOutfitOptions = {}): Promise<CheckedRender> {
  requireImages();
  const person = await sourceFromStored(photoFilename, 'Your uploaded photo could not be found; please re-upload it');
  const original = Buffer.from(person.data);

  let fullLength = opts.fullLength ?? null;
  let photoFullLength: boolean | undefined;
  if (fullLength == null && opts.check !== false) {
    try {
      fullLength = (await checkPhotoFraming(person)).fullLength;
      photoFullLength = fullLength;
    } catch {
      fullLength = null;
    }
  }
  const shoesOutOfFrame = fullLength === false;

  const first = await generateOutfitTryOn(photoFilename, items, mode, { person, shoesOutOfFrame });
  const unchecked: FidelityResult = { checked: false, score: null, shoesOutOfFrame, attempts: 1 };
  if (opts.check === false) return { url: first.url, prompt: first.prompt, mode: first.mode, fidelity: unchecked, photoFullLength };

  const originalSource: SourceImage = { data: original, mime: person.mime, kind: 'photo' };
  const judged = await safeCheck({ data: first.image, mime: 'image/png' }, first.garments, first.specs, originalSource);
  if (!judged.verdict) return { url: first.url, prompt: first.prompt, mode: first.mode, fidelity: { ...unchecked, error: judged.error }, photoFullLength };

  const score = scoreFidelity(judged.verdict, first.specs, { shoesOutOfFrame });
  const base = { ...judged.verdict, checked: true, shoesOutOfFrame };
  if (!score.retry) return { url: first.url, prompt: first.prompt, mode: first.mode, fidelity: { ...base, score: score.score, attempts: 1 }, photoFullLength };

  // One more go, from the original bytes, with the misses spelled out.
  const fixes = correctionLines(judged.verdict, first.specs, score);
  const again: SourceImage = { data: original, mime: person.mime, kind: 'photo' };
  let second: OutfitRender;
  try {
    second = await generateOutfitTryOn(photoFilename, items, mode, { person: again, garments: first.garments, shoesOutOfFrame, corrections: fixes });
  } catch {
    return { url: first.url, prompt: first.prompt, mode: first.mode, fidelity: { ...base, score: score.score, attempts: 1, retriedFor: fixes, error: 'retry failed' }, photoFullLength };
  }
  const rejudged = await safeCheck({ data: second.image, mime: 'image/png' }, second.garments, second.specs, originalSource);
  if (!rejudged.verdict) {
    // Unjudged second attempt: keep the first, whose verdict we can stand behind.
    return { url: first.url, prompt: first.prompt, mode: first.mode, fidelity: { ...base, score: score.score, attempts: 2, retriedFor: fixes, error: rejudged.error }, photoFullLength };
  }
  const score2 = scoreFidelity(rejudged.verdict, second.specs, { shoesOutOfFrame });
  const better = score2.score >= score.score;
  const chosen = better ? second : first;
  const verdict = better ? rejudged.verdict : judged.verdict;
  return {
    url: chosen.url,
    prompt: chosen.prompt,
    mode: chosen.mode,
    fidelity: { ...verdict, checked: true, shoesOutOfFrame, score: better ? score2.score : score.score, attempts: 2, retriedFor: fixes, firstScore: score.score },
    photoFullLength,
  };
}
