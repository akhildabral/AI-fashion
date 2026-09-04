import { generateObject } from 'ai';
import { z } from 'zod/v4';
import type { WardrobeItem } from '@prisma/client';
import { aiAbortSignal, aiErrorMessage, textModel } from '../lib/ai';
import { HttpError } from '../middleware/error';
import type { TripForecast } from './weather.service';

// Travel packing: destination + dates + activities → a capsule packed from
// the user's REAL wardrobe, a day-by-day outfit plan reusing those pieces,
// and the non-wardrobe essentials as a checklist. The LLM references items
// strictly by id; hallucinated ids are filtered out.

export interface PackedDay {
  label: string;
  items: WardrobeItem[];
  note: string;
}

export interface PackingPlan {
  capsule: WardrobeItem[];
  rationale: string;
  days: PackedDay[];
  essentials: string[];
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
    }),
  ),
  // Things worth packing that aren't clothing in the wardrobe.
  essentials: z.array(z.string()),
});

function catalogLine(item: WardrobeItem): string {
  return [
    `id=${item.id}`,
    item.category,
    item.subtype,
    item.primaryColor && `color:${item.primaryColor}`,
    item.formality && `formality:${item.formality}`,
    item.warmthValue != null && `warmth:${item.warmthValue}/10`,
    item.season.length && `season:${item.season.join('/')}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

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
        'across days; every day\'s ids must come from the capsule. Respect the ' +
        'weather. In "essentials", list non-clothing (or missing-clothing) items ' +
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

  return {
    capsule,
    rationale: parsed.capsule.rationale,
    days: parsed.days.map((d) => ({
      label: d.label,
      // Days may only draw from the capsule — anything else is dropped.
      items: resolve(d.itemIds).filter((i) => capsuleIds.has(i.id)),
      note: d.note,
    })),
    essentials: parsed.essentials ?? [],
  };
}
