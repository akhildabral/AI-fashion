import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', () => ({ prisma: {} }));
vi.mock('../controllers/wardrobe.controller', () => ({ loadStyleableWardrobe: vi.fn(async () => []) }));
vi.mock('./weather.service', () => ({ getWeather: vi.fn(), getTripForecast: vi.fn() }));

import {
  budgetFor,
  closetStamp,
  computeVerdictV2,
  projectedWears,
  topEventTypes,
  unlockWords,
  type VerdictClosetPiece,
  type VerdictInputs,
  type VerdictPiece,
} from './verdict.service';
import type { TasteProfileData } from './taste.service';

// Verdict v2, by the ladder: a duplicate or nothing to wear it with waits; a
// clean piece with three outfits earns its place; a stretch on the budget
// could work. Every line stays in the stylist's voice — never "buy".

let seq = 0;
function piece(p: Partial<VerdictPiece> & { category: string }): VerdictPiece {
  return {
    id: `p-${++seq}`,
    subtype: null,
    primaryColor: 'black',
    pattern: 'solid',
    formalityScore: 2,
    warmthValue: 2,
    layerRole: null,
    colorPalette: null,
    state: 'clean',
    imageUrl: '',
    status: 'ready',
    suppressed: false,
    owned: true,
    twinOfId: null,
    twinResolvedAt: null,
    season: [],
    cutFor: 'unisex',
    ...p,
  };
}
const owned = (p: Partial<VerdictClosetPiece> & { category: string }): VerdictClosetPiece => ({ ...piece(p), wearCount: p.wearCount ?? 0, createdAt: p.createdAt ?? new Date('2026-01-01') });

const tee = (extra: Partial<VerdictPiece> = {}) => piece({ category: 'top', subtype: 't-shirt', formalityScore: 2, warmthValue: 1, primaryColor: 'white', fit: 'regular', length: 'regular', ...extra });
const jeans = (extra: Partial<VerdictClosetPiece> = {}) => owned({ category: 'bottom', subtype: 'jeans', formalityScore: 2, warmthValue: 3, primaryColor: 'navy', ...extra });
const chinos = (extra: Partial<VerdictClosetPiece> = {}) => owned({ category: 'bottom', subtype: 'chinos', formalityScore: 3, warmthValue: 3, primaryColor: 'beige', ...extra });
const sneakers = (extra: Partial<VerdictClosetPiece> = {}) => owned({ category: 'footwear', subtype: 'sneakers', formalityScore: 2, warmthValue: 2, primaryColor: 'white', ...extra });
const loafers = (extra: Partial<VerdictClosetPiece> = {}) => owned({ category: 'footwear', subtype: 'loafers', formalityScore: 3, warmthValue: 2, primaryColor: 'brown', ...extra });

/** A closet a tee makes several outfits from. */
const roomy = () => [jeans(), jeans({ primaryColor: 'black' }), chinos(), sneakers(), loafers()];

const NOW = new Date('2026-09-12T10:00:00Z');
function inputs(over: Partial<VerdictInputs> = {}): VerdictInputs {
  return { piece: tee(), closet: roomy(), profile: null, taste: null, weather: null, wears: [], now: NOW, ...over };
}

function allLines(v: ReturnType<typeof computeVerdictV2>['v2']): string[] {
  return [v.line, ...v.closet.lines, ...(v.taste?.lines ?? []), ...(v.build?.lines ?? []), ...v.money.lines, ...(v.climate?.lines ?? [])].map((l) => (typeof l === 'string' ? l : l.line));
}

describe('verdict v2 headline ladder', () => {
  it('earns its place with three clean outfits, no duplicate, no flags', () => {
    const { v2 } = computeVerdictV2(inputs());
    expect(v2.closet.outfits).toBeGreaterThanOrEqual(3);
    expect(v2.closet.duplicate).toBe(false);
    expect(v2.headline).toBe('earns');
    expect(v2.line).toMatch(/^It would earn its place/);
    expect(v2.eventTypes).toEqual(['work', 'casual']);
    expect(v2.version).toBe(2);
  });

  it('waits on a near-duplicate, and says which piece and how often it is worn', () => {
    const twin = owned({ category: 'top', subtype: 't-shirt', formalityScore: 2, warmthValue: 1, primaryColor: 'white', wearCount: 2 });
    const { v2 } = computeVerdictV2(inputs({ closet: [...roomy(), twin] }));
    expect(v2.closet.duplicate).toBe(true);
    expect(v2.closet.closest).toMatchObject({ id: twin.id, label: 'white t-shirt', wears: 2 });
    expect(v2.closet.closest!.likeness).toBeGreaterThanOrEqual(6);
    expect(v2.headline).toBe('wait');
    expect(v2.line).toBe("I'd wait on this one: you own it in white, worn twice.");
    expect(v2.money.lines.some((l) => l.line === 'You already own this in white, worn twice.' && l.tone === 'flag')).toBe(true);
  });

  it('a near-duplicate never gets the top headline even when everything else is clean', () => {
    const twin = owned({ category: 'top', subtype: 't-shirt', formalityScore: 2, warmthValue: 1, primaryColor: 'white' });
    const { v2 } = computeVerdictV2(inputs({ closet: [...roomy(), twin], profile: { budgetBand: 'luxury', currency: 'INR' } }));
    expect(v2.closet.outfits).toBeGreaterThanOrEqual(3);
    expect(v2.headline).not.toBe('earns');
  });

  it('waits when nothing you own completes it', () => {
    const { v2 } = computeVerdictV2(inputs({ closet: [owned({ category: 'top', subtype: 'shirt', primaryColor: 'blue' })] }));
    expect(v2.closet.outfits).toBe(0);
    expect(v2.headline).toBe('wait');
    expect(v2.line).toMatch(/^I'd wait on this one: nothing you own completes it yet/);
    expect(v2.closet.lines[0].tone).toBe('flag');
  });

  it('waits on a colour the fitting struck out and names the rule', () => {
    const { v2 } = computeVerdictV2(inputs({ profile: { avoidColors: ['white'], bodyType: 'average' } }));
    expect(v2.build?.flags).toContain('avoid-colour');
    expect(v2.headline).toBe('wait');
    expect(v2.line).toBe("I'd wait on this one: white is a shade you asked me to avoid.");
  });

  it('waits when the price is far past the budget band, could work when it is a stretch', () => {
    const far = computeVerdictV2(inputs({ piece: tee({ listPrice: 20000, currency: 'INR' }), profile: { budgetBand: 'budget' } })).v2;
    expect(far.money.budget).toBe('far');
    expect(far.headline).toBe('wait');
    expect(far.line).toBe("I'd wait on this one: it sits well past what you told me you spend.");

    const above = computeVerdictV2(inputs({ piece: tee({ listPrice: 4000, currency: 'INR' }), profile: { budgetBand: 'budget' } })).v2;
    expect(above.money.budget).toBe('above');
    expect(above.headline).toBe('could');
    expect(above.line).toMatch(/^It could work: a stretch on your budget/);

    const within = computeVerdictV2(inputs({ piece: tee({ salePrice: 1999, listPrice: 2999, currency: 'INR' }), profile: { budgetBand: 'budget' } })).v2;
    expect(within.money).toMatchObject({ budget: 'within', price: 1999, currency: 'INR' });
    expect(within.money.lines[0].line).toMatch(/^₹1,999 down from ₹2,999/);
    expect(within.headline).toBe('earns');
  });

  it('could work with one or two outfits and says what would take it further', () => {
    const { v2 } = computeVerdictV2(inputs({ closet: [jeans(), sneakers()] }));
    expect(v2.closet.outfits).toBeGreaterThan(0);
    expect(v2.closet.outfits).toBeLessThan(3);
    expect(v2.headline).toBe('could');
    expect(v2.line).toMatch(/^It could work: only \d outfits? so far/);
  });

  it('waits on open-toe shoes in the cold and says so from the climate plaque', () => {
    const sandals = piece({ category: 'footwear', subtype: 'sandals', formalityScore: 2, warmthValue: 0, primaryColor: 'tan' });
    const { v2 } = computeVerdictV2(inputs({ piece: sandals, closet: [jeans(), chinos(), owned({ category: 'top', subtype: 't-shirt', primaryColor: 'white', warmthValue: 1 })], weather: { location: 'London', temperatureC: 6, description: 'Overcast', highC: 8, lowC: 3 } }));
    expect(v2.climate?.lines[0].tone).toBe('flag');
    expect(v2.headline).toBe('wait');
    expect(v2.line).toMatch(/^I'd wait on this one: open-toe at 8°C in London/);
  });

  it('has no climate plaque without a city, and a quiet one when the piece suits the day', () => {
    expect(computeVerdictV2(inputs()).v2.climate).toBeNull();
    const { v2 } = computeVerdictV2(inputs({ weather: { location: 'Bengaluru', temperatureC: 26, description: 'Clear', highC: 28, lowC: 20 } }));
    expect(v2.climate?.lines).toEqual([{ line: 'Fine for Bengaluru at 28°C today.', tone: 'good' }]);
    expect(v2.headline).toBe('earns');
  });

  it('never tells anyone to buy, or not to', () => {
    const cases = [
      computeVerdictV2(inputs()),
      computeVerdictV2(inputs({ closet: [] })),
      computeVerdictV2(inputs({ piece: tee({ listPrice: 90000, currency: 'INR' }), profile: { budgetBand: 'budget', avoidColors: ['white'], bodyType: 'plus', heightCm: 185, skinTone: 'fair', measurements: { unit: 'cm', preferredFit: 'slim' } } })),
      computeVerdictV2(inputs({ closet: [...roomy(), owned({ category: 'top', subtype: 't-shirt', primaryColor: 'white' })] })),
    ];
    for (const { v2 } of cases) {
      for (const line of allLines(v2)) {
        expect(line).not.toMatch(/\bbuy\b/i);
        expect(line).not.toMatch(/don't buy|do not buy/i);
      }
      expect(v2.line.split(/\s+/).length).toBeLessThanOrEqual(22);
    }
  });
});

describe('verdict v2 plaques', () => {
  it('taste is null on a cold start and scored once the record is warm', () => {
    expect(computeVerdictV2(inputs({ taste: null })).v2.taste).toBeNull();
    const cold = { sampleSize: 2 } as TasteProfileData;
    expect(computeVerdictV2(inputs({ taste: cold })).v2.taste).toBeNull();

    const warm: TasteProfileData = {
      computedAt: NOW.toISOString(),
      sampleSize: 40,
      colourAffinity: { families: { white: { wears: 20, items: 3, share: 0.5, affinity: 0.9 } } as TasteProfileData['colourAffinity']['families'], avoids: [] } as TasteProfileData['colourAffinity'],
      formalityOffset: {},
      pairAffinity: { items: [], families: {}, negatives: [] } as unknown as TasteProfileData['pairAffinity'],
      silhouette: { fits: {}, lengths: {} } as unknown as TasteProfileData['silhouette'],
      shoeHabits: {},
      layering: {},
      favouriteOutfits: [],
      facts: [],
      dismissedFacts: [],
    };
    const liked = computeVerdictV2(inputs({ taste: warm })).v2;
    expect(liked.taste).not.toBeNull();
    expect(liked.taste!.score).toBeGreaterThan(0.25);
    expect(liked.taste!.lines[0]).toMatchObject({ tone: 'good' });
    expect(liked.taste!.lines[0].line).toMatch(/^Sits with what you reach for: white/);

    const loud = computeVerdictV2(inputs({ piece: tee({ primaryColor: 'red' }), taste: { ...warm, colourAffinity: { families: { red: { wears: 1, items: 4, share: 0.02, affinity: -0.9 } }, avoids: ['red'] } as unknown as TasteProfileData['colourAffinity'] } })).v2;
    expect(loud.taste!.score).toBeLessThanOrEqual(-0.3);
    expect(loud.taste!.lines[0]).toEqual({ line: 'Louder than what you usually wear.', tone: 'flag' });
    expect(loud.headline).toBe('could');
    expect(loud.line).toBe("It could work, though it's louder than what you usually wear.");
  });

  it('build is null without a fitting and reads cut, length and colour against it', () => {
    expect(computeVerdictV2(inputs({ profile: {} })).v2.build).toBeNull();
    const tall = computeVerdictV2(inputs({ piece: tee({ length: 'cropped', fit: 'slim' }), profile: { heightCm: 185, bodyType: 'slim' } })).v2;
    expect(tall.build?.flags).toEqual([]);
    expect(tall.build?.lines.map((l) => l.line)).toContain('Cropped and slim; on a taller frame it will sit above the waistband.');
    expect(tall.headline).toBe('earns');

    const prefers = computeVerdictV2(inputs({ piece: tee({ fit: 'oversized' }), profile: { measurements: { unit: 'cm', preferredFit: 'slim' } } })).v2;
    expect(prefers.build?.flags).toEqual(['fit']);
    expect(prefers.build?.lines[0]).toEqual({ line: "Cut oversized; you've told me you prefer a slim line.", tone: 'flag' });
    expect(prefers.headline).toBe('could');
    expect(prefers.line).toBe("It could work, though cut oversized; you've told me you prefer a slim line.");

    const fair = computeVerdictV2(inputs({ profile: { skinTone: 'fair' } })).v2;
    expect(fair.build?.lines[0].line).toMatch(/^White on a fair complexion washes out/);
    expect(fair.build?.lines[0].tone).toBe('note');
  });

  it('projects wears from the family median over the last 180 days, then the category, then a dozen', () => {
    const closet = [jeans({ id: 'j1' }), jeans({ id: 'j2', primaryColor: 'black' }), chinos({ id: 'c1' }), sneakers()];
    const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
    const wears = [
      ...Array.from({ length: 10 }, (_, i) => ({ itemIds: ['j1'], wornOn: day(i * 10 + 1) })),
      ...Array.from({ length: 4 }, (_, i) => ({ itemIds: ['j2'], wornOn: day(i * 20 + 1) })),
      { itemIds: ['j1'], wornOn: day(400) },
    ];
    const denim = piece({ category: 'bottom', subtype: 'jeans', primaryColor: 'grey', listPrice: 3000, currency: 'INR' });
    // j1: 10 wears in 180 days → 20.3/yr; j2: 4 → 8.1/yr; median of two = 14.2.
    expect(projectedWears(denim, closet, wears, NOW)).toEqual({ perYear: 14.2, basis: 'family' });
    const trouser = piece({ category: 'bottom', subtype: 'wool trousers', primaryColor: 'grey' });
    // No trousers owned: the bottoms' mean (20.3 + 8.1 + 0) / 3.
    expect(projectedWears(trouser, closet, wears, NOW)).toEqual({ perYear: 9.5, basis: 'category' });
    expect(projectedWears(piece({ category: 'dress', subtype: 'dress' }), closet, wears, NOW)).toEqual({ perYear: 12, basis: 'default' });

    const { v2 } = computeVerdictV2(inputs({ piece: denim, closet, wears }));
    expect(v2.money.projectedWearsPerYear).toBe(14.2);
    expect(v2.money.costPerWear).toBe(211.27);
    expect(v2.money.lines.some((l) => /^About ₹211.27 a wear if it goes out as often as your other jeanss?, 14 times a year\.$/.test(l.line))).toBe(true);
  });

  it('reads the budget table per currency and category, unknown without a price or band', () => {
    expect(budgetFor(null, 'INR', 'mid', 'top')).toBe('unknown');
    expect(budgetFor(500, null, 'mid', 'top')).toBe('unknown');
    expect(budgetFor(500, 'INR', null, 'top')).toBe('unknown');
    expect(budgetFor(500, 'GBP', 'mid', 'top')).toBe('unknown');
    expect(budgetFor(7000, 'INR', 'mid', 'top')).toBe('within');
    expect(budgetFor(12000, 'INR', 'mid', 'top')).toBe('above');
    expect(budgetFor(13000, 'INR', 'mid', 'top')).toBe('far');
    expect(budgetFor(13000, 'INR', 'mid', 'outerwear')).toBe('within');
    expect(budgetFor(100, 'AED', 'budget', 'top')).toBe('within');
    expect(budgetFor(90000, 'USD', 'luxury', 'top')).toBe('within');
  });

  it('picks the member\'s top two kinds of day from the last 90 days', () => {
    const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
    const wears = [
      { itemIds: [], wornOn: day(1), eventType: 'evening' },
      { itemIds: [], wornOn: day(2), eventType: 'evening' },
      { itemIds: [], wornOn: day(3), eventType: 'occasion' },
      { itemIds: [], wornOn: day(120), eventType: 'work' },
      { itemIds: [], wornOn: day(121), eventType: 'work' },
      { itemIds: [], wornOn: day(4), eventType: 'not-a-type' },
    ];
    expect(topEventTypes(wears, NOW)).toEqual(['evening', 'occasion']);
    expect(topEventTypes([{ itemIds: [], wornOn: day(1), eventType: 'casual' }], NOW)).toEqual(['casual', 'work']);
    expect(topEventTypes([], NOW)).toEqual(['work', 'casual']);
  });

  it('names the unlock in words and keeps the legacy fields', () => {
    const r = computeVerdictV2(inputs({ closet: [jeans(), sneakers()] }));
    expect(unlockWords({ slot: 'bottom', gain: 5, colour: 'navy', formality: 3 })).toBe('a navy smart-casual trouser');
    expect(r.legacy).toMatchObject({ outfits: r.v2.closet.outfits, pairs: r.v2.closet.pairs, closetSize: 2 });
    expect(r.top.length).toBeLessThanOrEqual(3);
    if (r.v2.closet.unlock) expect(typeof r.v2.closet.unlock.formality).toBe('string');
  });
});

describe('closet stamp', () => {
  const base = { ownedIds: ['b', 'a'], closetUpdatedAt: new Date('2026-09-01T00:00:00Z'), profileUpdatedAt: new Date('2026-08-01T00:00:00Z'), tasteComputedAt: '2026-08-15T00:00:00.000Z' };
  it('is a stable signed 32-bit int, order-insensitive over the ids', () => {
    const a = closetStamp(base);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(-2147483648);
    expect(a).toBeLessThanOrEqual(2147483647);
    expect(closetStamp({ ...base, ownedIds: ['a', 'b'] })).toBe(a);
  });
  it('moves when a piece is added or bought, when the closet, the profile or the taste record is edited', () => {
    const a = closetStamp(base);
    expect(closetStamp({ ...base, ownedIds: ['a', 'b', 'c'] })).not.toBe(a);
    expect(closetStamp({ ...base, closetUpdatedAt: new Date('2026-09-02T00:00:00Z') })).not.toBe(a);
    expect(closetStamp({ ...base, profileUpdatedAt: new Date('2026-09-02T00:00:00Z') })).not.toBe(a);
    expect(closetStamp({ ...base, tasteComputedAt: null })).not.toBe(a);
  });
});
