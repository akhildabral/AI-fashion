import type { StyleProfile } from '@prisma/client';
import { generateObject } from 'ai';
import { z as z4 } from 'zod/v4';
import { EVENT_TYPES, type EventType } from './attributes';
import { aiAbortSignal, textModel } from './ai';

// What kind of day is it? One resolver for every brief: an override on the
// day wins; otherwise the weekday, read through the fitting's "what do you
// dress for"; otherwise work. This is what stops Saturday from being styled
// as a workday.

const WEEKEND = new Set([0, 6]);

export function weekdayOf(date: string): number {
  // date is YYYY-MM-DD in the user's own calendar; construct at noon UTC so
  // the weekday never slips across a timezone boundary.
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function resolveEventType(profile: Pick<StyleProfile, 'occasions'> | null, date: string, override?: EventType | null): EventType {
  if (override) return override;
  const days = new Set(profile?.occasions ?? []);
  const weekend = WEEKEND.has(weekdayOf(date));
  if (weekend) {
    // A weekend is casual unless the person told us they only dress for work.
    if (days.size > 0 && !days.has('casual') && days.has('work') && days.size === 1) return 'work';
    return 'casual';
  }
  // A weekday is work unless work is not among their days at all.
  if (days.size > 0 && !days.has('work')) return days.has('casual') ? 'casual' : days.has('athletic') ? 'athletic' : 'casual';
  return 'work';
}

const SIGNAL_WORDS: Record<string, string> = {
  minimal: 'prefers pared-back, minimal looks',
  maximal: 'likes layered, expressive looks',
  neutral: 'leans on neutrals',
  colour: 'reaches for colour',
  color: 'reaches for colour',
  timeless: 'prefers classic, timeless pieces',
  trend: 'enjoys of-the-moment pieces',
  tailored: 'likes sharp, tailored fits',
  relaxed: 'likes easy, relaxed fits',
  solid: 'prefers solids over prints',
  print: 'is happy in prints',
};

/** The fitting, as lines a stylist would keep in the client's file. */
export function describeFitting(profile: StyleProfile | null): string[] {
  if (!profile) return [];
  const lines: string[] = [];
  const signals = (profile.styleSignals as { signals?: string[] } | null)?.signals ?? [];
  const said = signals.map((s) => SIGNAL_WORDS[s.toLowerCase()] ?? s.replace(/[-_]/g, ' ')).filter(Boolean);
  if (said.length) lines.push(`Their taste: ${[...new Set(said)].join('; ')}.`);
  if (profile.avoidColors?.length) lines.push(`Never use these colours on them: ${profile.avoidColors.join(', ')}.`);
  if (profile.skinTone) lines.push(`Skin tone: ${profile.skinTone}; favour shades that flatter it.`);
  if (profile.bodyType) lines.push(`Build: ${profile.bodyType}; choose proportions that fall right.`);
  return lines;
}

/** Colours the fitting struck out, as a test against a piece's primary colour. */
export function avoidsColour(profile: Pick<StyleProfile, 'avoidColors'> | null, primaryColor: string | null): boolean {
  if (!profile?.avoidColors?.length || !primaryColor) return false;
  const c = primaryColor.toLowerCase();
  return profile.avoidColors.some((a) => c.includes(a.toLowerCase()));
}

export const EVENT_LABEL: Record<EventType, string> = {
  work: 'work',
  casual: 'weekend',
  evening: 'evening',
  occasion: 'occasion',
  athletic: 'training',
};

// --- Occasion → kind of day -------------------------------------------------
// A typed occasion says what kind of day it is far better than the weekday
// does: "wedding reception" on a Saturday is an occasion, not a casual day.
// Keywords first (deterministic, free); a small model read only when no
// keyword matches, cached per person and phrase for the life of the process.

const OCCASION_KEYWORDS: [RegExp, EventType][] = [
  [/wedding|reception|gala|black[- ]tie|white[- ]tie|cocktail|ceremony|funeral|memorial|\bball\b|awards|graduation|christening|baptism|bar mitzvah|opening night|premiere|banquet/, 'occasion'],
  [/\bgym\b|\brun\b|running|\bjog|yoga|hike|hiking|workout|work[- ]out|training|pilates|climb|cycling|\bcycle\b|\bswim|tennis|padel|football|\bmatch\b|\bspin\b|crossfit|bootcamp|marathon|trail/, 'athletic'],
  [/dinner|\bdate\b|drinks|party|\bbar\b|\bclub\b|concert|\bgig\b|theatre|theater|night out|supper|\bpub\b|karaoke|\bdj\b|after[- ]?party|tonight|evening/, 'evening'],
  [/office|client|meeting|interview|presentation|conference|\bpitch\b|boardroom|\bwork(day|ing)?\b|\bdesk\b|keynote|networking|seminar|workshop|co-?working|standup|review/, 'work'],
  [/brunch|coffee|errand|weekend|market|\bpark\b|picnic|shopping|casual|\blunch\b|caf[eé]|\bwalk\b|museum|gallery|day off|\bhome\b|lazy|beach|road trip|flight|travel|airport|\bmall\b|playground|school run|dog/, 'casual'],
];

/** The kind of day a phrase names, by keyword; null when nothing in it says. */
export function classifyOccasion(occasion: string | null | undefined): EventType | null {
  const text = (occasion ?? '').toLowerCase().trim();
  if (!text) return null;
  const hit = OCCASION_KEYWORDS.find(([re]) => re.test(text));
  return hit ? hit[1] : null;
}

export interface OccasionRead {
  eventType: EventType;
  /** 1–5 when the model gave one; null for a keyword read. */
  formalityTarget: number | null;
  notes: string | null;
  source: 'keyword' | 'model';
}

const occasionCache = new Map<string, OccasionRead>();
const OCCASION_CACHE_MAX = 5000;

/** Test hook: forget every cached model read. */
export function resetOccasionCache(): void {
  occasionCache.clear();
}

const occasionReadSchema = z4.object({
  eventType: z4.enum(EVENT_TYPES),
  formalityTarget: z4.number().min(1).max(5),
  notes: z4.string(),
});

/**
 * What kind of day an occasion is. Keyword map first; otherwise one tiny
 * model call, cached per (person, phrase). Returns null when the phrase says
 * nothing and the model is unavailable, so the caller falls back to the weekday.
 */
export async function readOccasion(userId: string, occasion: string | null | undefined): Promise<OccasionRead | null> {
  const text = (occasion ?? '').trim();
  if (!text) return null;
  const keyword = classifyOccasion(text);
  if (keyword) return { eventType: keyword, formalityTarget: null, notes: null, source: 'keyword' };
  const key = `${userId}::${text.toLowerCase()}`;
  const cached = occasionCache.get(key);
  if (cached) return cached;
  try {
    const { object } = await generateObject({
      abortSignal: aiAbortSignal(10_000),
      model: await textModel(),
      temperature: 0,
      schema: occasionReadSchema,
      instructions:
        'You classify what kind of day a person is dressing for. Reply with eventType: ' +
        'work (office, clients, meetings, interviews), casual (weekend, errands, coffee, brunch), ' +
        'evening (dinner, dates, drinks, parties), occasion (weddings, galas, ceremonies, black tie), ' +
        'athletic (gym, running, yoga, hikes). formalityTarget is 1 (athletic) to 5 (formal). ' +
        'notes: at most twelve words a stylist would want to know.',
      prompt: `Occasion: ${text}`,
    });
    const read: OccasionRead = {
      eventType: object.eventType,
      formalityTarget: Math.round(object.formalityTarget),
      notes: object.notes?.trim() || null,
      source: 'model',
    };
    if (occasionCache.size >= OCCASION_CACHE_MAX) occasionCache.delete(occasionCache.keys().next().value as string);
    occasionCache.set(key, read);
    return read;
  } catch {
    return null;
  }
}
