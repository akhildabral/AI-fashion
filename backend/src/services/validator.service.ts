import {
  EVENT_FORMALITY,
  currentSeason,
  deriveLayerRole,
  deriveNeedsLayer,
  isHeavyBoot,
  isOpenToe,
  isWearableCategory,
  layersUnderOnePiece,
  midStandsAlone,
  seasonAllows,
  shoeFormalityOf,
  type EventType,
  type Hemisphere,
  type Season,
} from '../lib/attributes';

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
  /** womens | mens | unisex | null (unknown). */
  cutFor?: string | null;
  // Optional, read when present: the rules below derive what they need
  // (layer role from the subtype keyword, shoe formality from the ladder,
  // "needs a layer" from cut and fabric) so items catalogued before these
  // rules existed are judged the same way as new ones.
  subtype?: string | null;
  season?: string[] | null;
  pattern?: string | null;
  material?: string | null;
  texture?: string | null;
  details?: unknown;
  /** Overrides the derived value when set. */
  needsLayer?: boolean | null;
}

/** The line the stylist never crosses: her pieces and his never share an outfit. */
export function crossesCutFor(items: { cutFor?: string | null }[]): boolean {
  let her = false;
  let him = false;
  for (const i of items) {
    if (i.cutFor === 'womens') her = true;
    else if (i.cutFor === 'mens') him = true;
  }
  return her && him;
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

/** Which item fills which slot; ids, so a caller can name the offender. */
export interface SlotSummary {
  base: string[];
  mid: string[];
  outer: string[];
  bottom: string[];
  onePiece: string[];
  footwear: string[];
  accessories: string[];
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
  warnings: Violation[];
  score: number;
  slots: SlotSummary;
}

export interface ValidatorOptions {
  eventType?: EventType;
  weather?: ValidatorWeather | null;
  recentWear?: RecentWear[];
  now?: Date;
  /**
   * Whether the closet has any clean footwear. Missing shoes are a violation
   * when it does (default) and only a warning when it doesn't.
   */
  hasCleanFootwear?: boolean;
  /** Season is derived from `now` and the hemisphere unless given outright. */
  hemisphere?: Hemisphere;
  season?: Season;
  /** Item states that count as available; default clean only. */
  availableStates?: readonly string[];
  /**
   * The formality to aim for (1–5). Defaults to the event's own target; the
   * taste layer shifts it toward how the person actually dresses on such days.
   */
  formalityTarget?: number;
}

const EXACT_REPEAT_DAYS = 14;
const OVERLAP_REPEAT_DAYS = 7;
const DRESSED_EVENTS: readonly EventType[] = ['work', 'occasion', 'evening'];
const PATTERNED = /stripe|check|plaid|floral|graphic|animal|leopard|zebra|paisley|tartan|print|logo|polka|houndstooth|argyle/i;

/**
 * The slot an item fills. A subtype keyword that says mid/outer/one-piece wins
 * over a stored role: the stored role is what an older catalogue derived
 * (a blazer tagged "top" came out as base), and the keyword is the truth.
 */
export function roleOf(item: Pick<ValidatorItem, 'category' | 'layerRole' | 'subtype'>): string {
  const derived = item.subtype ? deriveLayerRole(item.category, item.subtype) : null;
  if (derived && derived !== 'base') return derived;
  if (item.layerRole) return item.layerRole;
  if (derived) return derived;
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
export function warmthBand(temperatureC: number): [number, number] {
  if (temperatureC >= 28) return [0, 4];
  if (temperatureC >= 20) return [1, 7];
  if (temperatureC >= 12) return [4, 10];
  if (temperatureC >= 5) return [7, 15];
  return [10, 99];
}

function needsLayer(item: ValidatorItem): boolean {
  if (item.needsLayer != null) return item.needsLayer;
  return deriveNeedsLayer(item.subtype, item.details, item.material, item.formalityScore);
}

function label(item: ValidatorItem): string {
  return item.subtype ?? item.category;
}

export function validateOutfit(items: ValidatorItem[], opts: ValidatorOptions = {}): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Violation[] = [];
  const roleById = new Map(items.map((i) => [i.id, roleOf(i)]));
  const role = (i: ValidatorItem) => roleById.get(i.id)!;
  const roles = items.map(role);
  const inRole = (r: string) => items.filter((i) => role(i) === r);

  const slots: SlotSummary = {
    base: inRole('base').map((i) => i.id),
    mid: inRole('mid').map((i) => i.id),
    outer: inRole('outer').map((i) => i.id),
    bottom: inRole('bottom').map((i) => i.id),
    onePiece: inRole('one-piece').map((i) => i.id),
    footwear: inRole('footwear').map((i) => i.id),
    accessories: inRole('accessory').map((i) => i.id),
  };

  // --- Wearable at all ------------------------------------------------------
  const notWearable = items.filter((i) => !isWearableCategory(i.category));
  if (notWearable.length > 0) {
    violations.push({
      rule: 'not-wearable',
      message: `${notWearable.map(label).join(', ')}: not a wearable piece`,
    });
  }

  // --- Cut for ------------------------------------------------------------
  if (crossesCutFor(items)) {
    violations.push({ rule: 'cut-for', message: 'Mixes pieces cut for her with pieces cut for him' });
  }

  // --- Availability -------------------------------------------------------
  const available = opts.availableStates ?? ['clean'];
  const unavailable = items.filter((i) => !available.includes(i.state));
  if (unavailable.length > 0) {
    violations.push({
      rule: 'availability',
      message: `${unavailable.length} item(s) are not available (in the wash, packed, or retired)`,
    });
  }

  // --- Slot cardinality ---------------------------------------------------
  const hasOnePiece = slots.onePiece.length > 0;
  const hasBottom = slots.bottom.length > 0;
  if (slots.bottom.length > 1) {
    violations.push({ rule: 'slots', message: 'Two bottoms in one outfit' });
  }
  if (slots.onePiece.length > 1) {
    violations.push({ rule: 'slots', message: 'Two one-pieces in one outfit' });
  }
  if (hasOnePiece && hasBottom) {
    violations.push({ rule: 'slots', message: 'A one-piece and a bottom do not go together' });
  }
  if (slots.base.length > 1) {
    violations.push({ rule: 'slots', message: 'Two base tops in one outfit' });
  }
  if (slots.mid.length > 1) {
    violations.push({ rule: 'slots', message: 'Two mid layers in one outfit' });
  }
  if (slots.outer.length > 1) {
    violations.push({ rule: 'slots', message: 'Two outer layers in one outfit' });
  }
  if (slots.footwear.length > 1) {
    violations.push({ rule: 'slots', message: 'Two pairs of shoes in one outfit' });
  }
  if (hasOnePiece && slots.base.length > 0) {
    const knit = inRole('base').every((i) => layersUnderOnePiece(i.subtype, i.texture));
    if (!knit) violations.push({ rule: 'slots', message: 'A top under a one-piece only works as a fine knit' });
  }

  // --- Layer completeness -------------------------------------------------
  const hasBase = slots.base.length > 0;
  const standaloneMid = inRole('mid').some((i) => midStandsAlone(i.subtype));
  if (!hasOnePiece && !(hasBottom && (hasBase || standaloneMid))) {
    const layerOnly = slots.mid.length > 0 || slots.outer.length > 0;
    violations.push({
      rule: 'completeness',
      message:
        hasBottom && layerOnly
          ? 'Nothing under the layer — needs a base top (shirt, tee, blouse) or a one-piece'
          : 'Outfit is incomplete — needs a top and a bottom, or a one-piece',
    });
  }
  if (slots.footwear.length === 0) {
    const closetHasShoes = opts.hasCleanFootwear ?? true;
    (closetHasShoes ? violations : warnings).push({
      rule: 'footwear',
      message: closetHasShoes ? 'No footwear in this outfit' : 'No footwear in this outfit (none clean in the closet)',
    });
  }

  // --- Needs a layer ------------------------------------------------------
  const exposed = inRole('base').filter(needsLayer);
  if (exposed.length > 0 && slots.mid.length === 0 && slots.outer.length === 0) {
    const cold = opts.weather != null && opts.weather.temperatureC < 18;
    const dressed = opts.eventType != null && DRESSED_EVENTS.includes(opts.eventType);
    (dressed || cold ? violations : warnings).push({
      rule: 'layer',
      message: `${exposed.map(label).join(', ')} wants a layer over it${dressed ? ` for a ${opts.eventType} setting` : cold ? ' in this weather' : ''}`,
    });
  }

  // --- Formality coherence ------------------------------------------------
  const scored = items.filter((i) => role(i) !== 'accessory' && i.formalityScore != null);
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
      const target = opts.formalityTarget ?? EVENT_FORMALITY[opts.eventType];
      const gap = Math.abs(avg - target);
      const article = /^[aeiou]/.test(opts.eventType) ? 'an' : 'a';
      if (gap > 2) {
        violations.push({
          rule: 'formality',
          message: `Outfit formality does not fit ${article} ${opts.eventType} setting`,
        });
      } else if (gap > 1) {
        warnings.push({
          rule: 'formality',
          message: `Outfit formality is a stretch for ${article} ${opts.eventType} setting`,
        });
      }
    }
  }

  // --- Shoe formality against the bottom ----------------------------------
  const shoe = inRole('footwear')[0];
  const lower = inRole('bottom')[0] ?? inRole('one-piece')[0];
  if (shoe) {
    const sf = shoeFormalityOf(shoe.subtype, shoe.formalityScore);
    const bf = lower?.formalityScore ?? null;
    if (opts.eventType === 'athletic' && sf != null && sf >= 4) {
      violations.push({ rule: 'shoe-formality', message: `${label(shoe)} are not for an athletic setting` });
    } else if (sf != null && bf != null) {
      const delta = sf - bf;
      if (opts.eventType && DRESSED_EVENTS.includes(opts.eventType)) {
        if (delta < -1 || delta > 2) {
          violations.push({
            rule: 'shoe-formality',
            message: `${label(shoe)} are too ${delta < 0 ? 'casual' : 'dressy'} for the ${label(lower!)} in a ${opts.eventType} setting`,
          });
        }
      } else if (Math.abs(delta) >= 3) {
        warnings.push({
          rule: 'shoe-formality',
          message: `${label(shoe)} and the ${label(lower!)} sit far apart in formality`,
        });
      }
    }
  }

  // --- Weather sanity -----------------------------------------------------
  if (opts.weather) {
    const temp = opts.weather.temperatureC;
    const clothing = items.filter((i) => !['footwear', 'accessory'].includes(role(i)));
    const known = clothing.filter((i) => i.warmthValue != null);
    // Degrade gracefully on missing data: only judge when most values exist.
    if (known.length > 0 && known.length >= clothing.length / 2) {
      const total = known.reduce((a, i) => a + i.warmthValue!, 0);
      const [min, max] = warmthBand(temp);
      if (total < min - 3 || total > max + 3) {
        violations.push({
          rule: 'weather',
          message: `Outfit warmth is far off for ${temp}°C`,
        });
      } else if (total < min || total > max) {
        warnings.push({
          rule: 'weather',
          message: `Outfit may be too ${total < min ? 'light' : 'warm'} for ${temp}°C`,
        });
      }
    }

    const desc = opts.weather.description?.toLowerCase() ?? '';
    const wet = /rain|drizzle|snow|shower|storm|sleet/.test(desc);
    if (wet && temp < 20 && !roles.includes('outer')) {
      warnings.push({ rule: 'weather', message: 'Wet weather but no outer layer' });
    }

    // Footwear has its own weather: toes out in the cold or the wet, boots in a heatwave.
    for (const f of inRole('footwear')) {
      if (isOpenToe(f.subtype, f.details) && (temp < 12 || wet)) {
        violations.push({ rule: 'weather', message: `Open-toe ${label(f)} in ${wet ? 'wet weather' : `${temp}°C`}` });
      } else if (temp > 28 && isHeavyBoot(f.subtype, f.warmthValue)) {
        warnings.push({ rule: 'weather', message: `${label(f)} will be heavy at ${temp}°C` });
      }
    }
  }

  // --- Season -------------------------------------------------------------
  const season = opts.season ?? currentSeason(opts.now ?? new Date(), opts.hemisphere ?? 'north');
  const outOfSeason = items.filter((i) => role(i) !== 'accessory' && !seasonAllows(i.season, { season }));
  if (outOfSeason.length >= 2) {
    violations.push({ rule: 'season', message: `${outOfSeason.map(label).join(', ')} are not ${season} pieces` });
  } else if (outOfSeason.length === 1) {
    warnings.push({ rule: 'season', message: `${label(outOfSeason[0])} is not a ${season} piece` });
  }

  // --- Pattern clash ------------------------------------------------------
  const patterned = items.filter((i) => role(i) !== 'accessory' && PATTERNED.test(i.pattern ?? ''));
  if (patterned.length >= 2) {
    warnings.push({ rule: 'pattern', message: `${patterned.map(label).join(' and ')}: two patterns compete` });
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
  return { ok: violations.length === 0, violations, warnings, score, slots };
}
