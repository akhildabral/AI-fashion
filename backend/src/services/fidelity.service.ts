import { generateObject, type UserContent } from 'ai';
import { z } from 'zod/v4';
import { aiAbortSignal, visionModel } from '../lib/ai';
import type { SourceImage } from '../lib/imagegen';

// The Mirror's second look. After a render, a vision model is shown the
// render beside every garment cut-out and asked, piece by piece, whether
// the render is wearing THAT piece: present at all, the right colour, the
// right sleeve or trouser length, the right silhouette, the right print.
// The verdict is scored; a missing piece or a major mismatch earns one
// re-render from the ORIGINAL photo with the mistakes spelled out. The
// verdict is stored with the render so the glass can say, honestly, "the
// shoes didn't take".
//
// The check is time-boxed and never fails a render: a check that errors
// or times out records `checked: false` and the render stands as it is.

export const FIDELITY_TIMEOUT_MS = 20_000;

export interface GarmentMatches {
  colour: boolean;
  sleeveOrLength: boolean;
  silhouette: boolean;
  print: boolean;
}

export interface GarmentVerdict {
  /** The wardrobe item, when known. */
  itemId?: string;
  /** 1-based, the GARMENT n the prompt named. */
  index: number;
  slot: string;
  present: boolean;
  matches: GarmentMatches;
  note: string;
}

export interface FidelityVerdict {
  garments: GarmentVerdict[];
  personPreserved: boolean;
  shoesVisible: boolean;
}

export interface FidelityResult extends Partial<FidelityVerdict> {
  checked: boolean;
  /** 0–100: how much of the outfit took. */
  score: number | null;
  /** The reflection stops above the feet; missing shoes are not a failure. */
  shoesOutOfFrame: boolean;
  /** How many renders were made: 1, or 2 when the first earned a retry. */
  attempts: number;
  /** The corrections the retry was given, when there was one. */
  retriedFor?: string[];
  /** The first attempt's score, when a retry replaced it. */
  firstScore?: number | null;
  error?: string;
}

export interface CheckedGarment {
  itemId?: string;
  slot: string;
  /** The words the prompt used for it — read back to the checker so it judges the same brief. */
  spec: string;
  category: string;
}

const verdictSchema = z.object({
  garments: z.array(
    z.object({
      index: z.number().int().describe('The GARMENT number, 1-based, as labelled'),
      present: z.boolean().describe('The person is wearing this piece (not a similar one)'),
      colour: z.boolean().describe('Same colour and shade as the garment picture'),
      sleeveOrLength: z
        .boolean()
        .describe('Sleeve length (tops), trouser/skirt/dress length (bottoms, dresses) or shaft height (shoes) matches the picture'),
      silhouette: z.boolean().describe('Same cut and shape: fit, neckline, leg, rise, shoe model'),
      print: z.boolean().describe('Same print, logo, stripes or texture, at the same place and size; true for a plain piece rendered plain'),
      note: z.string().describe('One short sentence on what is off, or empty when it matches'),
    }),
  ),
  personPreserved: z.boolean().describe('The same person, face, pose, body and background as the photograph'),
  shoesVisible: z.boolean().describe('The feet and shoes are inside the frame'),
});

function isTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = (err as { name?: string }).name ?? '';
  return name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted/i.test(err.message);
}

/**
 * Ask the vision model whether the render is wearing each garment as pictured.
 * `render` is the finished image; `garments` are the same cut-outs the renderer
 * was given, in the same order. Throws on model failure — callers time-box
 * and swallow through `safeCheck`.
 */
export async function checkFidelity(render: SourceImage, garments: SourceImage[], specs: CheckedGarment[], person?: SourceImage): Promise<FidelityVerdict> {
  const brief = specs.map((g, i) => `GARMENT ${i + 1} — the ${g.slot}: ${g.spec}`).join('\n');
  const content: Exclude<UserContent, string> = [];
  if (person) {
    content.push({ type: 'text', text: 'PERSON — the original photograph the render was edited from:' });
    content.push({ type: 'file', data: person.data, mediaType: person.mime });
  }
  content.push({ type: 'text', text: 'RENDER — the finished try-on image to judge:' });
  content.push({ type: 'file', data: render.data, mediaType: render.mime });
  garments.forEach((g, i) => {
    content.push({ type: 'text', text: `GARMENT ${i + 1} — the ${specs[i]?.slot ?? 'piece'}, as it should appear:` });
    content.push({ type: 'file', data: g.data, mediaType: g.mime });
  });
  content.push({
    type: 'text',
    text:
      `The outfit was meant to be exactly these ${specs.length} pieces:\n${brief}\n\n` +
      'For every garment, judge the RENDER against that garment\'s own picture. Be strict and literal: ' +
      'a long sleeve where the picture shows a half sleeve is a sleeveOrLength failure; a plain top where ' +
      'the picture shows a print or logo is a print failure; a different kind of shoe (a sneaker for a ' +
      'pump, a generic trainer for the pictured model) is a silhouette failure; a different shade is a ' +
      'colour failure. present is false when the piece is absent or replaced by a different garment. ' +
      'Report one entry per garment, in order.' +
      (person
        ? ' personPreserved is true ONLY when the RENDER is recognisably the PERSON photograph with the clothes changed: the same face, hair, body, pose, framing, background and setting. A different person, a different room or mirror, a re-composed scene, or added borders makes it false.'
        : ''),
  });
  const { object } = await generateObject({
    abortSignal: aiAbortSignal(FIDELITY_TIMEOUT_MS),
    model: await visionModel(),
    temperature: 0,
    schema: verdictSchema,
    instructions:
      'You are a meticulous fashion QA reviewer comparing a virtual try-on render with the reference ' +
      'pictures of the garments it was supposed to show. Answer with booleans only where you are ' +
      'confident; when a piece is out of frame (feet cropped) report present=false and say so in the note.',
    messages: [{ role: 'user', content }],
  });
  const byIndex = new Map(object.garments.map((g) => [g.index, g]));
  return {
    garments: specs.map((s, i) => {
      const g = byIndex.get(i + 1) ?? object.garments[i];
      return {
        itemId: s.itemId,
        index: i + 1,
        slot: s.slot,
        present: g?.present ?? false,
        matches: {
          colour: g?.colour ?? false,
          sleeveOrLength: g?.sleeveOrLength ?? false,
          silhouette: g?.silhouette ?? false,
          print: g?.print ?? false,
        },
        note: g?.note?.trim() ?? (g ? '' : 'not judged'),
      };
    }),
    personPreserved: object.personPreserved,
    shoesVisible: object.shoesVisible,
  };
}

/** checkFidelity that never throws: a failure or timeout is a verdict of "unchecked". */
export async function safeCheck(render: SourceImage, garments: SourceImage[], specs: CheckedGarment[], person?: SourceImage): Promise<{ verdict: FidelityVerdict | null; error?: string }> {
  try {
    return { verdict: await checkFidelity(render, garments, specs, person) };
  } catch (err) {
    const message = isTimeout(err) ? 'fidelity check timed out' : err instanceof Error ? err.message : 'fidelity check failed';
    return { verdict: null, error: message };
  }
}

export interface FidelityScore {
  /** 0–100. */
  score: number;
  /** A missing piece or a major mismatch: worth one more render from the original. */
  retry: boolean;
  /** Which garments (0-based) were missing or wrong in a major way. */
  failed: number[];
  /** Minor misses (print, or a footwear-only miss when the feet are cropped) — lower the score, no retry. */
  minor: number[];
}

function isFootwear(category: string): boolean {
  return category.toLowerCase() === 'footwear';
}

/**
 * Score a verdict. Every present garment earns a quarter for each of the four
 * attributes; a garment that is absent earns nothing. A missing garment, or a
 * colour / sleeve-or-length / silhouette miss, is major and asks for a retry;
 * a print miss alone is minor. Shoes that could not be in the frame are left
 * out of the count entirely.
 */
export function scoreFidelity(verdict: FidelityVerdict, specs: CheckedGarment[], opts: { shoesOutOfFrame?: boolean } = {}): FidelityScore {
  const failed: number[] = [];
  const minor: number[] = [];
  let earned = 0;
  let counted = 0;
  verdict.garments.forEach((g, i) => {
    const spec = specs[i];
    const excused = Boolean(opts.shoesOutOfFrame) && spec && isFootwear(spec.category);
    if (excused) return;
    counted += 1;
    if (!g.present) {
      failed.push(i);
      return;
    }
    const m = g.matches;
    earned += [m.colour, m.sleeveOrLength, m.silhouette, m.print].filter(Boolean).length / 4;
    if (!m.colour || !m.sleeveOrLength || !m.silhouette) failed.push(i);
    else if (!m.print) minor.push(i);
  });
  let score = counted === 0 ? 100 : Math.round((earned / counted) * 100);
  if (!verdict.personPreserved) score = Math.round(score * 0.5);
  return { score, retry: failed.length > 0 || !verdict.personPreserved, failed, minor };
}

const attributeWords: Record<keyof GarmentMatches, string> = {
  colour: 'the colour was wrong',
  sleeveOrLength: 'the sleeve or hem length was wrong',
  silhouette: 'the cut or shoe model was wrong',
  print: 'the print or logo was wrong',
};

/**
 * Turn a scored verdict into the corrections a retry is given, one line per
 * failed garment, in the checker's own words where it left a note.
 */
export function corrections(verdict: FidelityVerdict, specs: CheckedGarment[], score: FidelityScore): string[] {
  const lines: string[] = [];
  for (const i of [...score.failed, ...score.minor]) {
    const g = verdict.garments[i];
    const s = specs[i];
    if (!g || !s) continue;
    const label = `GARMENT ${i + 1} (the ${s.slot})`;
    if (!g.present) {
      lines.push(`${label} was missing or replaced by a different garment. It MUST be worn exactly as pictured: ${s.spec}.`);
      continue;
    }
    const wrong = (Object.keys(attributeWords) as (keyof GarmentMatches)[]).filter((k) => !g.matches[k]).map((k) => attributeWords[k]);
    const why = g.note ? `${wrong.join(', ')} (${g.note.replace(/\.$/, '')})` : wrong.join(', ');
    lines.push(`${label}: ${why}. It MUST match its picture exactly: ${s.spec}.`);
  }
  if (!verdict.personPreserved) {
    lines.push('The person was changed. The result MUST show the very same person, face, body, pose and background as the PERSON photograph.');
  }
  return lines;
}

// ---- framing --------------------------------------------------------------

const framingSchema = z.object({
  feetVisible: z.boolean().describe('Both feet (or the shoes) are inside the frame'),
  framing: z.enum(['full-length', 'three-quarter', 'half', 'head-and-shoulders']),
});

/**
 * Is the reflection full-length? Asked once per photo and cached by the
 * caller. A photo cropped above the feet cannot show shoes, so the render
 * keeps its crop and the check does not count missing shoes against it.
 */
export async function checkPhotoFraming(photo: SourceImage): Promise<{ fullLength: boolean }> {
  const { object } = await generateObject({
    abortSignal: aiAbortSignal(FIDELITY_TIMEOUT_MS),
    model: await visionModel(),
    temperature: 0,
    schema: framingSchema,
    instructions: 'You describe how a photograph of a person is framed.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'How is this person framed? Are their feet inside the picture?' },
          { type: 'file', data: photo.data, mediaType: photo.mime },
        ],
      },
    ],
  });
  return { fullLength: object.feetVisible && object.framing === 'full-length' };
}
