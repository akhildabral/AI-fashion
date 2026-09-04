import { generateObject } from 'ai';
import { z } from 'zod/v4';
import type { WardrobeItem } from '@prisma/client';
import { aiAbortSignal, aiErrorMessage, textModel } from '../lib/ai';
import { HttpError } from '../middleware/error';
import { EVENT_TYPES, type EventType } from '../lib/attributes';
import { classifyOccasion } from '../lib/occasion';
import { washTolerance } from '../lib/wear-rules';
import { honestRationale, verdictOf, type Verdict } from './compose.service';
import { outfitsAround } from './pairing.service';
import { roleOf, validateOutfit, type ValidationResult } from './validator.service';
import { catalogLine } from './wardrobe.service';
import type { ForecastDay, TripForecast } from './weather.service';

// Travel packing: destination + dates + activities → a capsule packed from
// the user's REAL wardrobe, a day-by-day outfit plan reusing those pieces,
// and the non-wardrobe essentials as a checklist. The LLM references items
// strictly by id; hallucinated ids are filtered out.

export interface PackedDay {
  label: string;
  items: WardrobeItem[];
  note: string;
  /** What kind of day the model read it as. */
  eventType: EventType;
  /** The rules' word on the day's outfit against that day's forecast. */
  verdict: Verdict;
  /** True when the model's day failed the rules and the pairer redid it from the capsule. */
  recomposed: boolean;
}

export interface PackingPlan {
  capsule: WardrobeItem[];
  rationale: string;
  days: PackedDay[];
  essentials: string[];
  /** Set when the capsule cannot cover the nights without a wash. */
  laundryNote: string | null;
}

const packSchema = z.object({
  capsule: z.object({
    itemIds: z.array(z.string()),
    rationale: z.string(),
  }),
  days: z.array(
    z.object({
      label: z.string(),
      itemIds: z.array(z.string()),
      note: z.string(),
      // What kind of day it is: work | casual | evening | occasion | athletic.
      eventType: z.enum(EVENT_TYPES),
    }),
  ),
  // Things worth packing that aren't clothing in the wardrobe.
  essentials: z.array(z.string()),
});

function describeForecast(forecast: TripForecast, startDate: string, endDate: string): string {
  const lines: string[] = [`Destination: ${forecast.location}`, `Trip: ${startDate} to ${endDate}`];
  if (forecast.days.length > 0) {
    lines.push('Daily forecast:');
    for (const d of forecast.days) {
      lines.push(
        `  ${d.date}: ${d.minC}–${d.maxC}°C, ${d.description}${d.rainChance ? ', rain likely' : ''}`,
      );
    }
  }
  if (forecast.partial) {
    lines.push(
      'Part of the trip is beyond the reliable forecast horizon — assume typical seasonal weather for the destination and dates.',
    );
  }
  return lines.join('\n');
}

export async function planPacking(
  items: WardrobeItem[],
  forecast: TripForecast,
  opts: { startDate: string; endDate: string; activities?: string },
): Promise<PackingPlan> {
  const catalog = items.map(catalogLine).join('\n');
  const nights =
    Math.max(1, Math.round((Date.parse(opts.endDate) - Date.parse(opts.startDate)) / 86_400_000));

  let parsed: z.infer<typeof packSchema>;
  try {
    const { object } = await generateObject({
      abortSignal: aiAbortSignal(),
      model: await textModel(),
      temperature: 0.6,
      schema: packSchema,
      instructions:
        'You are a travel stylist packing a capsule wardrobe. Using ONLY items from ' +
        'the wardrobe catalog (referenced by their exact ids), choose a compact ' +
        'capsule where pieces mix and match — favor items that appear in several ' +
        'outfits, and keep the total count low for the trip length. Then lay out one ' +
        'outfit per day (label like "Day 1 — arrival"), reusing capsule pieces ' +
        'across days; every day\'s ids must come from the capsule, and every day is a ' +
        'complete outfit: one bottom or one one-piece, exactly one footwear, a base top under any blazer or jacket. ' +
        'Tag each day with its eventType (work, casual, evening, occasion, athletic) from the activities. Respect the ' +
        'weather day by day. In "essentials", list non-clothing (or missing-clothing) items ' +
        'worth packing for THIS trip — chargers, adapters, toiletries, and any ' +
        'clothing gaps the wardrobe cannot cover (e.g. "a rain jacket — none in ' +
        'your wardrobe").',
      prompt:
        `${describeForecast(forecast, opts.startDate, opts.endDate)}\n` +
        `Nights: ${nights}\n` +
        (opts.activities ? `Planned activities: ${opts.activities}\n` : '') +
        `\nWardrobe catalog:\n${catalog}`,
    });
    parsed = object;
  } catch (err) {
    const message = aiErrorMessage(err, 'The packing model failed');
    throw new HttpError(502, message);
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const resolve = (ids: string[]) =>
    [...new Set(ids)].map((id) => byId.get(id)).filter((i): i is WardrobeItem => !!i);

  const capsule = resolve(parsed.capsule.itemIds);
  if (capsule.length === 0) {
    throw new HttpError(502, 'Could not assemble a capsule from your wardrobe');
  }
  const capsuleIds = new Set(capsule.map((i) => i.id));
  const tripEvent = classifyOccasion(opts.activities) ?? 'casual';
  const forecastByDate = new Map(forecast.days.map((d) => [d.date, d]));
  const dayDates = Array.from({ length: nights + 1 }, (_, i) => new Date(Date.parse(opts.startDate) + i * 86_400_000).toISOString().slice(0, 10));

  // Every day's outfit is judged against that day's forecast and kind of day;
  // a day that fails is redone by the pairer from the capsule, never shipped
  // with the failure hidden in a cheerful note.
  const days: PackedDay[] = [];
  const used: string[][] = [];
  parsed.days.forEach((d, index) => {
    const eventType = d.eventType ?? tripEvent;
    const fc = forecastByDate.get(dayDates[index] ?? '') ?? forecast.days[index] ?? null;
    let items = resolve(d.itemIds).filter((i) => capsuleIds.has(i.id));
    let v = judgeDay(items, capsule, eventType, fc);
    let recomposed = false;
    let note = d.note;
    if (!v.ok) {
      const better = recomposeDay(capsule, eventType, fc, used);
      if (better) {
        items = better;
        v = judgeDay(items, capsule, eventType, fc);
        recomposed = true;
      }
    }
    if (!v.ok) note = honestRationale(v, items, eventType, null, fc ? weatherOf(fc) : null);
    else if (recomposed) note = `${honestRationale(v, items, eventType, null, fc ? weatherOf(fc) : null)}`;
    used.push(items.map((i) => i.id));
    days.push({ label: d.label, items, note, eventType, verdict: verdictOf(v), recomposed });
  });

  // Laundry math: pieces worn against the skin take one wear each; the
  // capsule needs enough of them for the nights, or a wash on the way.
  const tops = capsule.filter((i) => ['base', 'one-piece'].includes(roleOf(i)));
  const topsNeeded = tops.length ? Math.ceil((nights + 1) / Math.max(1, Math.min(...tops.map(washTolerance)))) : nights + 1;
  const laundryNote =
    tops.length < topsNeeded
      ? `${tops.length} top${tops.length === 1 ? '' : 's'} for ${nights + 1} day${nights ? 's' : ''}: plan a wash midway, or pack ${topsNeeded - tops.length} more.`
      : null;
  const essentials = parsed.essentials ?? [];
  if (laundryNote && !essentials.includes(laundryNote)) essentials.push(laundryNote);

  return { capsule, rationale: parsed.capsule.rationale, days, essentials, laundryNote };
}

function weatherOf(fc: ForecastDay) {
  return {
    location: '',
    temperatureC: Math.round((fc.minC + fc.maxC) / 2),
    description: fc.rainChance ? `${fc.description}, rain likely` : fc.description,
    highC: Math.round(fc.maxC),
    lowC: Math.round(fc.minC),
  };
}

/** A day's outfit against its forecast; packed pieces count as available. */
export function judgeDay(items: WardrobeItem[], capsule: WardrobeItem[], eventType: EventType, fc: ForecastDay | null): ValidationResult {
  return validateOutfit(items, {
    eventType,
    weather: fc ? weatherOf(fc) : undefined,
    hasCleanFootwear: capsule.some((i) => i.category === 'footwear'),
    availableStates: ['clean', 'packed'],
  });
}

/** The best outfit the capsule makes for the day that no other day already uses. */
export function recomposeDay(capsule: WardrobeItem[], eventType: EventType, fc: ForecastDay | null, used: string[][]): WardrobeItem[] | null {
  const same = (ids: string[]) => used.some((u) => u.length === ids.length && [...u].sort().join() === [...ids].sort().join());
  const seen = new Set<string>();
  let best: { itemIds: string[]; score: number } | null = null;
  const byId = new Map(capsule.map((i) => [i.id, i]));
  for (const piece of capsule) {
    for (const o of outfitsAround(piece, capsule, { eventType, weather: fc ? weatherOf(fc) : undefined, limit: 8, availableStates: ['clean', 'packed'] })) {
      const key = [...o.itemIds].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const score = same(o.itemIds) ? o.score - 50 : o.score;
      if (!best || score > best.score) best = { itemIds: o.itemIds, score };
    }
  }
  return best ? best.itemIds.map((id) => byId.get(id)!).filter(Boolean) : null;
}
