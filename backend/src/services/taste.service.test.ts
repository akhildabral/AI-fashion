import { describe, expect, it } from 'vitest';
import {
  colourFamilyOf,
  deriveColourAffinity,
  deriveFacts,
  deriveFormalityOffset,
  derivePairAffinity,
  deriveTasteProfile,
  favouriteOutfitFor,
  labFamily,
  subtypeFamilyOf,
  tasteFormalityTarget,
  tasteItemBonus,
  tastePairBonus,
  tastePromptBlock,
  type TasteItem,
  type TasteWear,
} from './taste.service';

// A small closet: two tops, two bottoms, two pairs of shoes, one layer.
const items: TasteItem[] = [
  { id: 'tee-white', category: 'top', subtype: 't-shirt', primaryColor: 'white', formalityScore: 2, layerRole: 'base', fit: 'regular', createdAt: '2026-01-01' },
  { id: 'shirt-navy', category: 'top', subtype: 'oxford shirt', primaryColor: 'navy', formalityScore: 4, layerRole: 'base', fit: 'slim', createdAt: '2026-01-01' },
  { id: 'trouser-grey', category: 'bottom', subtype: 'tailored trousers', primaryColor: 'charcoal', formalityScore: 4, layerRole: 'bottom', fit: 'slim', createdAt: '2026-01-01' },
  { id: 'jeans-blue', category: 'bottom', subtype: 'jeans', primaryColor: 'blue', formalityScore: 2, layerRole: 'bottom', fit: 'slim', createdAt: '2026-01-01' },
  { id: 'sneaker-white', category: 'footwear', subtype: 'sneakers', primaryColor: 'white', formalityScore: 2, layerRole: 'footwear', createdAt: '2026-01-01' },
  { id: 'loafer-brown', category: 'footwear', subtype: 'loafers', primaryColor: 'brown', formalityScore: 4, layerRole: 'footwear', createdAt: '2026-01-01' },
  { id: 'blazer-navy', category: 'outerwear', subtype: 'blazer', primaryColor: 'navy', formalityScore: 4, layerRole: 'outer', createdAt: '2026-01-01' },
  { id: 'knit-green', category: 'top', subtype: 'sweater', primaryColor: 'forest green', formalityScore: 3, layerRole: 'mid', createdAt: '2026-01-01' },
];

const now = new Date('2026-06-15T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

/** n work days where the laid-out shirt/trousers/loafers were swapped for tee/trousers/sneakers. */
function correctedWorkDays(n: number): TasteWear[] {
  return Array.from({ length: n }, (_, i) => ({
    itemIds: ['tee-white', 'trouser-grey', 'sneaker-white'],
    suggestedItemIds: ['shirt-navy', 'trouser-grey', 'loafer-brown'],
    woreInstead: true,
    eventType: 'work',
    wornOn: day(i + 1),
    weather: { temperatureC: 21 },
  }));
}

describe('colour families', () => {
  it('maps the canonical names and falls back to the palette', () => {
    expect(colourFamilyOf({ primaryColor: 'Navy Blue' })).toBe('navy');
    expect(colourFamilyOf({ primaryColor: 'charcoal' })).toBe('grey');
    expect(colourFamilyOf({ primaryColor: 'forest green' })).toBe('green');
    expect(colourFamilyOf({ primaryColor: 'dusty burgundy' })).toBe('red');
    expect(colourFamilyOf({ primaryColor: null, colorPalette: [{ hex: '#1f2a44', lab: { L: 18, a: 4, b: -20 }, share: 0.8 }] })).toBe('navy');
    expect(colourFamilyOf({ primaryColor: null, colorPalette: null })).toBeNull();
  });

  it('reads LCh hue into a family', () => {
    expect(labFamily({ L: 95, a: 0, b: 2 })).toBe('white');
    expect(labFamily({ L: 10, a: 1, b: -1 })).toBe('black');
    expect(labFamily({ L: 50, a: 2, b: 3 })).toBe('grey');
    expect(labFamily({ L: 45, a: 60, b: 40 })).toBe('red');
    expect(labFamily({ L: 55, a: -40, b: 40 })).toBe('green');
    expect(labFamily({ L: 60, a: -5, b: -45 })).toBe('blue');
  });

  it('families subtypes', () => {
    expect(subtypeFamilyOf({ category: 'footwear', subtype: 'running sneakers' })).toBe('sneaker');
    expect(subtypeFamilyOf({ category: 'bottom', subtype: 'tailored trousers' })).toBe('tailored-trouser');
    expect(subtypeFamilyOf({ category: 'top', subtype: null })).toBe('tee');
  });
});

describe('colour affinity', () => {
  it('scores worn share against closet share and finds what is never worn', () => {
    // Eight wear days; navy owned (shirt, blazer) and never worn; white worn every day.
    const wears: TasteWear[] = Array.from({ length: 8 }, (_, i) => ({ itemIds: ['tee-white', 'jeans-blue', 'sneaker-white'], wornOn: day(i + 1), eventType: 'casual' }));
    const c = deriveColourAffinity(items, wears);
    expect(c.families.white.affinity).toBeGreaterThan(0.3);
    expect(c.families.navy.wears).toBe(0);
    expect(c.families.navy.affinity).toBe(-1);
    expect(c.families.navy.opportunities).toBe(8);
    expect(c.avoids).toEqual(['brown', 'green', 'grey', 'navy']);
    expect(c.favourite).toBe('white');
  });

  it('needs eight chances before calling a colour avoided', () => {
    const wears: TasteWear[] = Array.from({ length: 5 }, (_, i) => ({ itemIds: ['tee-white'], wornOn: day(i + 1) }));
    expect(deriveColourAffinity(items, wears).avoids).toEqual([]);
  });

  it('only counts chances since the piece arrived', () => {
    const late = items.map((i) => (i.id === 'blazer-navy' || i.id === 'shirt-navy' ? { ...i, createdAt: day(2) } : i));
    const wears: TasteWear[] = Array.from({ length: 10 }, (_, i) => ({ itemIds: ['tee-white'], wornOn: day(i + 1) }));
    const c = deriveColourAffinity(late, wears);
    expect(c.families.navy.opportunities).toBe(2);
    expect(c.avoids).not.toContain('navy');
  });
});

describe('formality offset', () => {
  it('is worn minus laid out on corrected days, per event type, clamped', () => {
    // Worn (2,4,2)=2.67 vs laid out (4,4,4)=4: a 1.33 step down.
    const f = deriveFormalityOffset(items, correctedWorkDays(4), []);
    expect(f.work.days).toBe(4);
    expect(f.work.offset).toBeCloseTo(-1.33, 1);
    expect(f.all.offset).toBeCloseTo(-1.33, 1);
    expect(f.work.offset).toBeGreaterThanOrEqual(-2);
  });

  it('reads swaps as in minus out', () => {
    const events = [
      { kind: 'swap', outId: 'loafer-brown', inId: 'sneaker-white', eventType: 'work', occurredOn: day(1), itemIds: [] },
      { kind: 'swap', outId: 'sneaker-white', inId: 'loafer-brown', eventType: 'evening', occurredOn: day(2), itemIds: [] },
    ];
    const f = deriveFormalityOffset(items, [], events);
    expect(f.work).toEqual({ offset: -2, days: 1 });
    expect(f.evening).toEqual({ offset: 2, days: 1 });
  });

  it('ignores days that were not corrected', () => {
    const wears: TasteWear[] = [{ itemIds: ['tee-white'], suggestedItemIds: ['shirt-navy'], woreInstead: false, wornOn: day(1) }];
    expect(deriveFormalityOffset(items, wears, [])).toEqual({});
  });
});

describe('pair affinity', () => {
  it('counts co-wears by item and by family, and swaps as negatives', () => {
    const wears = correctedWorkDays(3);
    const events = [
      { kind: 'swap', outId: 'blazer-navy', inId: 'knit-green', eventType: 'work', occurredOn: day(1), itemIds: ['tee-white', 'sneaker-white'] },
      { kind: 'swap', outId: 'blazer-navy', inId: 'knit-green', eventType: 'work', occurredOn: day(2), itemIds: ['tee-white', 'jeans-blue'] },
    ];
    const p = derivePairAffinity(items, wears, events);
    expect(p.items.find((x) => x.a === 'sneaker-white' && x.b === 'tee-white')?.count).toBe(3);
    expect(p.families['sneaker|tailored-trouser']).toEqual({ count: 3, eventTypes: { work: 3 } });
    expect(p.negatives[0]).toEqual({ a: 'blazer-navy', b: 'tee-white', count: 2 });
  });
});

describe('facts', () => {
  it('says nothing under five wears', () => {
    const profile = deriveTasteProfile({ items, wears: correctedWorkDays(4), now });
    expect(profile.sampleSize).toBe(4);
    expect(profile.facts).toEqual([]);
  });

  it('speaks once the record can support it, in the stylist’s voice', () => {
    const profile = deriveTasteProfile({ items, wears: correctedWorkDays(6), now });
    const ids = profile.facts.map((f) => f.id);
    expect(ids).toContain('formality:work');
    expect(ids).toContain('pair:sneaker|tailored-trouser');
    expect(ids).toContain('shoes:work');
    expect(profile.facts.find((f) => f.id === 'formality:work')?.text).toBe('You dress a step more casual than I lay out on work days.');
    expect(profile.facts.find((f) => f.id === 'pair:sneaker|tailored-trouser')?.text).toBe('You wear sneakers with tailored trousers on work days.');
    expect(profile.facts.find((f) => f.id === 'shoes:work')?.text).toBe('Sneakers on work days, almost every time.');
    for (const f of profile.facts) {
      expect(f.text).not.toMatch(/color|favorite/);
      expect(f.strength).toBeGreaterThan(0);
      expect(f.strength).toBeLessThanOrEqual(1);
    }
    expect(profile.facts.length).toBeLessThanOrEqual(8);
  });

  it('needs three observations per fact and honours dismissals', () => {
    // Six wears, but only two of them corrected: the formality fact stays unsaid.
    const wears: TasteWear[] = [...correctedWorkDays(2), ...Array.from({ length: 4 }, (_, i) => ({ itemIds: ['tee-white', 'jeans-blue', 'sneaker-white'], wornOn: day(i + 10), eventType: 'casual' }))];
    const profile = deriveTasteProfile({ items, wears, now });
    expect(profile.facts.map((f) => f.id)).not.toContain('formality:work');
    const dismissed = deriveTasteProfile({ items, wears: correctedWorkDays(6), now, dismissedFacts: ['formality:work'] });
    expect(dismissed.facts.map((f) => f.id)).not.toContain('formality:work');
    expect(dismissed.dismissedFacts).toEqual(['formality:work']);
  });

  it('names the avoided colour and the favourite look', () => {
    const wears: TasteWear[] = Array.from({ length: 8 }, (_, i) => ({ itemIds: ['tee-white', 'jeans-blue', 'sneaker-white'], wornOn: day(i + 1), eventType: 'casual', outfitId: 'o1' }));
    const profile = deriveTasteProfile({ items, wears, now, outfits: [{ id: 'o1', itemIds: ['tee-white', 'jeans-blue', 'sneaker-white'], eventType: 'casual', wearCount: 8, rating: 5 }] });
    expect(profile.facts.find((f) => f.id === 'avoid:navy')?.text).toBe('There’s navy on the rail, but you never reach for it.');
    expect(profile.favouriteOutfits[0]).toMatchObject({ id: 'o1', wearCount: 8, lastWornOn: '2026-06-14', label: 'white t-shirt, blue jeans, white sneakers' });
    expect(profile.facts.find((f) => f.kind === 'favourite')?.text).toBe('Your most-worn look: the white t-shirt, blue jeans, white sneakers, worn 8 times.');
  });

  it('drops facts outside the six-month window', () => {
    const old = correctedWorkDays(6).map((w) => ({ ...w, wornOn: day(400) }));
    expect(deriveTasteProfile({ items, wears: old, now }).sampleSize).toBe(0);
  });

  it('deriveFacts alone respects the sample floor', () => {
    const p = deriveTasteProfile({ items, wears: correctedWorkDays(6), now });
    expect(deriveFacts({ ...p, sampleSize: 4 }, items)).toEqual([]);
  });
});

describe('hooks', () => {
  const profile = deriveTasteProfile({
    items,
    now,
    wears: [...correctedWorkDays(8), ...Array.from({ length: 4 }, (_, i) => ({ itemIds: ['tee-white', 'jeans-blue', 'sneaker-white'], wornOn: day(i + 20), eventType: 'casual' }))],
    events: Array.from({ length: 5 }, (_, i) => ({ kind: 'swap', outId: 'blazer-navy', inId: 'knit-green', eventType: 'work', occurredOn: day(i + 1), itemIds: ['tee-white', 'sneaker-white'] })),
  });
  const by = (id: string) => items.find((i) => i.id === id)!;

  it('pair bonus rewards co-wears, punishes swaps, and stays inside ±1.5', () => {
    expect(tastePairBonus(profile, by('tee-white'), by('sneaker-white'))).toBe(1.5);
    expect(tastePairBonus(profile, by('blazer-navy'), by('tee-white'))).toBeLessThan(0);
    expect(tastePairBonus(profile, by('blazer-navy'), by('tee-white'))).toBeGreaterThanOrEqual(-1.5);
    expect(tastePairBonus(profile, by('knit-green'), by('loafer-brown'))).toBe(0);
    expect(tastePairBonus(null, by('tee-white'), by('sneaker-white'))).toBe(0);
  });

  it('item bonus follows colour and shoe habits, capped at ±2', () => {
    expect(tasteItemBonus(profile, by('sneaker-white'), 'work')).toBeGreaterThan(0);
    expect(tasteItemBonus(profile, by('loafer-brown'), 'work')).toBeLessThan(0);
    expect(tasteItemBonus(profile, by('shirt-navy'), 'work')).toBeLessThan(0);
    for (const item of items) {
      const b = tasteItemBonus(profile, item, 'work');
      expect(Math.abs(b)).toBeLessThanOrEqual(2);
    }
    expect(tasteItemBonus(undefined, by('sneaker-white'), 'work')).toBe(0);
  });

  it('formality target shifts by the offset and stays within 1–5', () => {
    // Eight corrected days at −1.33 and five blazer→knit swaps at −1: a mean of −1.21.
    expect(tasteFormalityTarget(profile, 'work', 4)).toBeCloseTo(2.79, 1);
    expect(tasteFormalityTarget(profile, 'occasion', 5)).toBeLessThanOrEqual(5);
    expect(tasteFormalityTarget(null, 'work', 4)).toBe(4);
    const cold = { ...profile, sampleSize: 2 };
    expect(tasteFormalityTarget(cold, 'work', 4)).toBe(4);
  });

  it('prompt block is short, third person, and empty when cold', () => {
    const block = tastePromptBlock(profile);
    expect(block.startsWith('How they actually dress:')).toBe(true);
    expect(block.split('\n').length).toBeLessThanOrEqual(6);
    expect(block).not.toMatch(/\bYou\b/);
    expect(tastePromptBlock(null)).toBe('');
    expect(tastePromptBlock({ ...profile, sampleSize: 1 })).toBe('');
  });

  it('favourite outfit matches the day and the weather', () => {
    const p = deriveTasteProfile({
      items,
      now,
      wears: Array.from({ length: 6 }, (_, i) => ({ itemIds: ['tee-white', 'jeans-blue', 'sneaker-white'], wornOn: day(i + 1), eventType: 'casual', outfitId: 'o1', weather: { temperatureC: 28 } })),
      outfits: [{ id: 'o1', itemIds: ['tee-white', 'jeans-blue', 'sneaker-white'], eventType: 'casual', wearCount: 6, rating: null }],
    });
    expect(favouriteOutfitFor(p, { eventType: 'casual', temperatureC: 26 })?.id).toBe('o1');
    expect(favouriteOutfitFor(p, { eventType: 'casual', temperatureC: 8 })).toBeNull();
    expect(favouriteOutfitFor(p, { eventType: 'work' })).toBeNull();
    expect(favouriteOutfitFor(null, { eventType: 'casual' })).toBeNull();
  });
});
