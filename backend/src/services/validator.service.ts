import { EVENT_FORMALITY, type EventType } from '../lib/attributes';

// Deterministic outfit validation: the LLM proposes, these rules validate.
// The point is "never obviously wrong" — completeness, availability, weather
// sanity, formality coherence, and repeat avoidance are all checkable without
// a model, and a hard failure here rejects a candidate no matter how good its
// rationale sounds. Pure functions; unit-tested without a database.

export interface ValidatorItem {
  id: string;
  category: string;
  layerRole: string | null;
  warmthValue: number | null;
  formalityScore: number | null;
  state: string;
}

export interface ValidatorWeather {
  temperatureC: number;
  description?: string;
}

export interface RecentWear {
  itemIds: string[];
  wornOn: Date;
  /** "Again?" from the Journal: 5 = again, 1 = not this one. */
  rating?: number | null;
}

export interface Violation {
  rule: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
  warnings: Violation[];
  score: number;
}

const EXACT_REPEAT_DAYS = 14;
const OVERLAP_REPEAT_DAYS = 7;

function roleOf(item: ValidatorItem): string {
  if (item.layerRole) return item.layerRole;
  // Fallback for items cataloged before reasoning attributes existed.
  switch (item.category) {
    case 'top':
      return 'base';
    case 'outerwear':
      return 'outer';
    case 'dress':
      return 'one-piece';
    default:
      return item.category;
  }
}

// Warmth bands by temperature: [min, max] total outfit warmth (additive across
// clothing layers, footwear and accessories excluded).
function warmthBand(temperatureC: number): [number, number] {
  if (temperatureC >= 28) return [0, 4];
  if (temperatureC >= 20) return [1, 7];
  if (temperatureC >= 12) return [4, 10];
  if (temperatureC >= 5) return [7, 15];
  return [10, 99];
}

export function validateOutfit(
  items: ValidatorItem[],
  opts: {
    eventType?: EventType;
    weather?: ValidatorWeather | null;
    recentWear?: RecentWear[];
    now?: Date;
  } = {},
): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Violation[] = [];
  const roles = items.map(roleOf);

  // --- Availability -------------------------------------------------------
  const unavailable = items.filter((i) => i.state !== 'clean');
  if (unavailable.length > 0) {
    violations.push({
      rule: 'availability',
      message: `${unavailable.length} item(s) are not available (in the wash, packed, or retired)`,
    });
  }

  // --- Layer completeness -------------------------------------------------
  const hasOnePiece = roles.includes('one-piece');
  const hasTop = roles.includes('base') || roles.includes('mid');
  const hasBottom = roles.includes('bottom');
  if (!hasOnePiece && !(hasTop && hasBottom)) {
    violations.push({
      rule: 'completeness',
      message: 'Outfit is incomplete — needs a top and a bottom, or a one-piece',
    });
  }
  if (!roles.includes('footwear')) {
    warnings.push({ rule: 'completeness', message: 'No footwear in this outfit' });
  }

  // --- Formality coherence ------------------------------------------------
  const scored = items.filter((i) => roleOf(i) !== 'accessory' && i.formalityScore != null);
  if (scored.length > 0) {
    const scores = scored.map((i) => i.formalityScore!);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (Math.max(...scores) - Math.min(...scores) > 2) {
      warnings.push({
        rule: 'formality',
        message: 'Items span very different formality levels',
      });
    }

    if (opts.eventType) {
      const target = EVENT_FORMALITY[opts.eventType];
      const gap = Math.abs(avg - target);
      if (gap > 2) {
        violations.push({
          rule: 'formality',
          message: `Outfit formality does not fit a ${opts.eventType} setting`,
        });
      } else if (gap > 1) {
        warnings.push({
          rule: 'formality',
          message: `Outfit formality is a stretch for a ${opts.eventType} setting`,
        });
      }
    }
  }

  // --- Weather sanity -----------------------------------------------------
  if (opts.weather) {
    const clothing = items.filter((i) => !['footwear', 'accessory'].includes(roleOf(i)));
    const known = clothing.filter((i) => i.warmthValue != null);
    // Degrade gracefully on missing data: only judge when most values exist.
    if (known.length > 0 && known.length >= clothing.length / 2) {
      const total = known.reduce((a, i) => a + i.warmthValue!, 0);
      const [min, max] = warmthBand(opts.weather.temperatureC);
      if (total < min - 3 || total > max + 3) {
        violations.push({
          rule: 'weather',
          message: `Outfit warmth is far off for ${opts.weather.temperatureC}°C`,
        });
      } else if (total < min || total > max) {
        warnings.push({
          rule: 'weather',
          message: `Outfit may be too ${total < min ? 'light' : 'warm'} for ${opts.weather.temperatureC}°C`,
        });
      }
    }

    const desc = opts.weather.description?.toLowerCase() ?? '';
    const wet = desc.includes('rain') || desc.includes('drizzle') || desc.includes('snow');
    if (wet && opts.weather.temperatureC < 20 && !roles.includes('outer')) {
      warnings.push({ rule: 'weather', message: 'Wet weather but no outer layer' });
    }
  }

  // --- Repeat avoidance ---------------------------------------------------
  if (opts.recentWear?.length) {
    const now = opts.now ?? new Date();
    const ids = new Set(items.map((i) => i.id));
    for (const wear of opts.recentWear) {
      const days = (now.getTime() - wear.wornOn.getTime()) / 86_400_000;
      const worn = new Set(wear.itemIds);
      const sameSet = worn.size === ids.size && [...ids].every((id) => worn.has(id));
      if (sameSet && wear.rating === 1) {
        violations.push({ rule: 'disliked', message: 'You marked this outfit "not this one"' });
        break;
      }
      if (sameSet && days <= EXACT_REPEAT_DAYS) {
        violations.push({
          rule: 'repeat',
          message: 'This exact outfit was worn recently',
        });
        break;
      }
      const overlap = [...ids].filter((id) => worn.has(id)).length;
      if (!sameSet && days <= OVERLAP_REPEAT_DAYS && ids.size > 1 && overlap / ids.size >= 0.6) {
        warnings.push({
          rule: 'repeat',
          message: 'Very similar to an outfit worn this week',
        });
        break;
      }
    }
  }

  const score = Math.max(0, 100 - violations.length * 25 - warnings.length * 10);
  return { ok: violations.length === 0, violations, warnings, score };
}
