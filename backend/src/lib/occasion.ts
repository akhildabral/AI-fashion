import type { StyleProfile } from '@prisma/client';
import type { EventType } from './attributes';

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
