import { describe, expect, it } from 'vitest';
import { validateOutfit, type ValidatorItem } from './validator.service';
import { srgbToLab } from '../lib/color';

let seq = 0;
function item(overrides: Partial<ValidatorItem>): ValidatorItem {
  return {
    id: `item-${++seq}`,
    category: 'top',
    layerRole: 'base',
    warmthValue: 2,
    formalityScore: 3,
    state: 'clean',
    ...overrides,
  };
}

const tee = () => item({ category: 'top', layerRole: 'base', warmthValue: 1, formalityScore: 2 });
const jeans = () => item({ category: 'bottom', layerRole: 'bottom', warmthValue: 3, formalityScore: 2 });
const sneakers = () => item({ category: 'footwear', layerRole: 'footwear', warmthValue: 2, formalityScore: 2 });
const coat = () => item({ category: 'outerwear', layerRole: 'outer', warmthValue: 7, formalityScore: 3 });
const dress = () => item({ category: 'dress', layerRole: 'one-piece', warmthValue: 2, formalityScore: 4 });

describe('completeness', () => {
  it('accepts top + bottom + footwear', () => {
    const r = validateOutfit([tee(), jeans(), sneakers()]);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('accepts a one-piece in place of top + bottom', () => {
    const r = validateOutfit([dress(), sneakers()]);
    expect(r.ok).toBe(true);
  });

  it('rejects a topless or bottomless outfit', () => {
    const r = validateOutfit([tee(), sneakers()]);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'completeness')).toBe(true);
  });

  it('rejects missing footwear when the closet has clean shoes', () => {
    const r = validateOutfit([tee(), jeans()]);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'footwear')).toBe(true);
  });

  it('only warns about missing footwear when nothing clean is in the closet', () => {
    const r = validateOutfit([tee(), jeans()], { hasCleanFootwear: false });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.rule === 'footwear')).toBe(true);
  });

  it('needs a base top under a layer, not just the layer', () => {
    const blazer = item({ category: 'top', layerRole: 'base', subtype: 'blazer', formalityScore: 4 });
    const r = validateOutfit([blazer, item({ ...jeans(), formalityScore: 4 }), item({ ...sneakers(), subtype: 'oxford shoes', formalityScore: 4 })]);
    expect(r.violations.some((v) => v.rule === 'completeness')).toBe(true);
    expect(r.slots.mid).toEqual([blazer.id]);
    expect(r.slots.base).toEqual([]);
  });

  it('lets knitwear stand alone as the top', () => {
    const sweater = item({ category: 'top', layerRole: 'mid', subtype: 'wool sweater' });
    const r = validateOutfit([sweater, jeans(), sneakers()]);
    expect(r.violations.some((v) => v.rule === 'completeness')).toBe(false);
  });

  it('reports the slot summary', () => {
    const t = tee();
    const j = jeans();
    const s = sneakers();
    const c = coat();
    const r = validateOutfit([t, j, s, c]);
    expect(r.slots).toEqual({ base: [t.id], mid: [], outer: [c.id], bottom: [j.id], onePiece: [], footwear: [s.id], accessories: [] });
  });
});

describe('slot cardinality', () => {
  it('rejects two bottoms', () => {
    const r = validateOutfit([tee(), jeans(), item({ category: 'bottom', layerRole: 'bottom', subtype: 'trousers' }), sneakers()]);
    expect(r.violations.some((v) => v.rule === 'slots' && /two bottoms/i.test(v.message))).toBe(true);
  });

  it('rejects a one-piece with a bottom', () => {
    const r = validateOutfit([dress(), jeans(), sneakers()]);
    expect(r.violations.some((v) => v.rule === 'slots')).toBe(true);
  });

  it('rejects two base tops, two mids, two outers, two pairs of shoes', () => {
    expect(validateOutfit([tee(), tee(), jeans(), sneakers()]).violations.some((v) => v.rule === 'slots')).toBe(true);
    const mid = () => item({ layerRole: 'mid', subtype: 'sweater' });
    expect(validateOutfit([tee(), mid(), mid(), jeans(), sneakers()]).violations.some((v) => v.rule === 'slots')).toBe(true);
    expect(validateOutfit([tee(), jeans(), sneakers(), coat(), coat()]).violations.some((v) => v.rule === 'slots')).toBe(true);
    expect(validateOutfit([tee(), jeans(), sneakers(), sneakers()]).violations.some((v) => v.rule === 'slots')).toBe(true);
  });

  it('rejects a base top under a one-piece unless it is a fine knit', () => {
    const under = validateOutfit([dress(), tee(), sneakers()]);
    expect(under.violations.some((v) => v.rule === 'slots')).toBe(true);
    const knit = validateOutfit([dress(), item({ subtype: 'turtleneck' }), sneakers()]);
    expect(knit.violations.some((v) => v.rule === 'slots')).toBe(false);
    const layered = validateOutfit([dress(), item({ layerRole: 'mid', subtype: 'cardigan' }), sneakers()]);
    expect(layered.violations.some((v) => v.rule === 'slots')).toBe(false);
  });

  it('rejects anything tagged other as not wearable', () => {
    const swatch = item({ category: 'other', layerRole: null, subtype: 'fabric swatch' });
    const r = validateOutfit([tee(), jeans(), sneakers(), swatch]);
    expect(r.violations.some((v) => v.rule === 'not-wearable')).toBe(true);
  });
});

describe('needs a layer', () => {
  const cami = () => item({ subtype: 'camisole', formalityScore: 3 });

  it('is a violation in a dressed setting and in the cold', () => {
    expect(validateOutfit([cami(), jeans(), sneakers()], { eventType: 'work' }).violations.some((v) => v.rule === 'layer')).toBe(true);
    expect(validateOutfit([cami(), jeans(), sneakers()], { weather: { temperatureC: 14 } }).violations.some((v) => v.rule === 'layer')).toBe(true);
  });

  it('is a warning in a casual setting', () => {
    const r = validateOutfit([cami(), jeans(), sneakers()], { eventType: 'casual' });
    expect(r.violations.some((v) => v.rule === 'layer')).toBe(false);
    expect(r.warnings.some((w) => w.rule === 'layer')).toBe(true);
  });

  it('is satisfied by a layer over it', () => {
    const r = validateOutfit([cami(), item({ layerRole: 'mid', subtype: 'cardigan' }), jeans(), sneakers()], { eventType: 'work' });
    expect(r.violations.some((v) => v.rule === 'layer')).toBe(false);
  });
});

describe('shoe formality', () => {
  const trousers = () => item({ category: 'bottom', layerRole: 'bottom', subtype: 'tailored trousers', formalityScore: 4, warmthValue: 2 });
  const shirt = () => item({ subtype: 'shirt', formalityScore: 4 });
  const pumps = () => item({ category: 'footwear', layerRole: 'footwear', subtype: 'pumps', formalityScore: 4, warmthValue: 1 });
  const sweats = () => item({ category: 'bottom', layerRole: 'bottom', subtype: 'sweatpants', formalityScore: 1, warmthValue: 3 });

  it('rejects sneakers under tailored trousers at work', () => {
    const r = validateOutfit([shirt(), trousers(), item({ ...sneakers(), subtype: 'sneakers' })], { eventType: 'work' });
    expect(r.violations.some((v) => v.rule === 'shoe-formality')).toBe(true);
  });

  it('accepts oxfords under tailored trousers at work', () => {
    const r = validateOutfit([shirt(), trousers(), item({ category: 'footwear', layerRole: 'footwear', subtype: 'oxford shoes', formalityScore: 4 })], { eventType: 'work' });
    expect(r.violations.some((v) => v.rule === 'shoe-formality')).toBe(false);
  });

  it('rejects dress shoes in an athletic setting', () => {
    const r = validateOutfit([item({ subtype: 'polo shirt', formalityScore: 2 }), sweats(), pumps()], { eventType: 'athletic' });
    expect(r.violations.some((v) => v.rule === 'shoe-formality')).toBe(true);
  });

  it('only warns on a wide gap in a casual setting', () => {
    const r = validateOutfit([tee(), sweats(), pumps()], { eventType: 'casual' });
    expect(r.violations.some((v) => v.rule === 'shoe-formality')).toBe(false);
    expect(r.warnings.some((w) => w.rule === 'shoe-formality')).toBe(true);
  });

  it('reads shoe formality off the subtype ladder when the stored score is the garment tag', () => {
    // Sneakers tagged "business" by a generous model are still sneakers.
    const r = validateOutfit([shirt(), trousers(), item({ category: 'footwear', layerRole: 'footwear', subtype: 'white sneakers', formalityScore: 4 })], { eventType: 'work' });
    expect(r.violations.some((v) => v.rule === 'shoe-formality')).toBe(true);
  });
});

describe('footwear weather', () => {
  const sandals = () => item({ category: 'footwear', layerRole: 'footwear', subtype: 'sandals', warmthValue: 0, formalityScore: 2 });

  it('rejects open toes in the cold and in the rain', () => {
    expect(validateOutfit([tee(), jeans(), sandals()], { weather: { temperatureC: 8 } }).violations.some((v) => v.rule === 'weather')).toBe(true);
    expect(validateOutfit([tee(), jeans(), sandals()], { weather: { temperatureC: 22, description: 'rain showers' } }).violations.some((v) => v.rule === 'weather')).toBe(true);
    expect(validateOutfit([tee(), jeans(), sandals()], { weather: { temperatureC: 24 } }).violations.some((v) => v.rule === 'weather')).toBe(false);
  });

  it('warns on heavy boots in a heatwave', () => {
    const boots = item({ category: 'footwear', layerRole: 'footwear', subtype: 'leather boots', warmthValue: 4 });
    const r = validateOutfit([item({ warmthValue: 0 }), item({ category: 'bottom', layerRole: 'bottom', warmthValue: 0 }), boots], { weather: { temperatureC: 31 } });
    expect(r.warnings.some((w) => w.rule === 'weather' && /heavy/.test(w.message))).toBe(true);
  });
});

describe('season', () => {
  const july = new Date('2026-07-15T09:00:00Z');
  it('notes an out-of-season tag softly and never refuses on it', () => {
    const wool = item({ subtype: 'wool sweater', layerRole: 'mid', season: ['winter'] });
    const one = validateOutfit([tee(), wool, jeans(), sneakers()], { now: july });
    expect(one.warnings.some((w) => w.rule === 'season' && /tagged for winter/.test(w.message))).toBe(true);
    expect(one.violations.some((v) => v.rule === 'season')).toBe(false);
    const two = validateOutfit([tee(), wool, item({ ...jeans(), season: ['fall', 'winter'] }), sneakers()], { now: july });
    expect(two.violations.some((v) => v.rule === 'season')).toBe(false);
    expect(two.warnings.filter((w) => w.rule === 'season')).toHaveLength(2);
  });
  it('is silent when a real temperature is known — warmth judges instead', () => {
    const cami = item({ subtype: 'camisole', layerRole: 'base', season: ['spring', 'summer'], warmthValue: 0 });
    const r = validateOutfit([cami, jeans(), sneakers()], { now: new Date('2026-09-05T09:00:00Z'), weather: { temperatureC: 26, description: 'partly cloudy' } });
    expect(r.warnings.some((w) => w.rule === 'season')).toBe(false);
    expect(r.violations.some((v) => v.rule === 'season')).toBe(false);
  });
  it('flips with the hemisphere and accepts an explicit season', () => {
    const wool = item({ subtype: 'wool sweater', layerRole: 'mid', season: ['winter'] });
    expect(validateOutfit([tee(), wool, jeans(), sneakers()], { now: july, hemisphere: 'south' }).warnings.some((w) => w.rule === 'season')).toBe(false);
    expect(validateOutfit([tee(), wool, jeans(), sneakers()], { season: 'winter' }).warnings.some((w) => w.rule === 'season')).toBe(false);
  });
});


describe('colour', () => {
  const lab = (r: number, g: number, b: number) => [{ hex: '#000000', lab: srgbToLab(r, g, b), share: 0.9 }];
  const red = lab(255, 0, 0);
  const green = lab(0, 128, 0);
  const cobalt = lab(0, 71, 171);
  const black = lab(10, 10, 10);
  const sage = lab(158, 178, 141);

  it('warns on three loud colours', () => {
    const r = validateOutfit([item({ colorPalette: red }), item({ ...jeans(), colorPalette: cobalt }), item({ ...sneakers(), colorPalette: green })]);
    expect(r.warnings.some((w) => w.rule === 'colour' && /three loud/.test(w.message))).toBe(true);
    expect(r.colours.vivid).toBe(3);
    expect(r.colours.families).toEqual(['red', 'blue', 'green']);
  });

  it('warns on two loud colours that clash, not on two that sit apart', () => {
    const clash = validateOutfit([item({ colorPalette: red }), item({ ...jeans(), colorPalette: green }), item({ ...sneakers(), colorPalette: black })]);
    expect(clash.warnings.some((w) => w.rule === 'colour' && /clash/.test(w.message))).toBe(true);
    const fine = validateOutfit([item({ colorPalette: red }), item({ ...jeans(), colorPalette: black }), item({ ...sneakers(), colorPalette: sage })]);
    expect(fine.warnings.some((w) => w.rule === 'colour')).toBe(false);
    expect(fine.colours).toEqual({ families: ['red', 'neutral', 'green'], vivid: 1 });
  });

  it('reads the stored family and vividness, the palette, or a neutral name, and abstains otherwise', () => {
    const r = validateOutfit([
      item({ colourFamily: 'red', colourVividness: 'vivid' }),
      item({ ...jeans(), colourFamily: 'green', colourVividness: 'vivid' }),
      item({ ...sneakers(), primaryColor: 'white' }),
    ]);
    expect(r.warnings.some((w) => w.rule === 'colour' && /clash/.test(w.message))).toBe(true);
    expect(r.colours).toEqual({ families: ['red', 'green', 'neutral'], vivid: 2 });
    const unknown = validateOutfit([tee(), jeans(), sneakers()]);
    expect(unknown.colours).toEqual({ families: [], vivid: 0 });
  });

  it('leaves accessories out of the colour count', () => {
    const scarf = item({ category: 'accessory', layerRole: 'accessory', colorPalette: green });
    const r = validateOutfit([item({ colorPalette: red }), item({ ...jeans(), colorPalette: cobalt }), sneakers(), scarf]);
    expect(r.colours.vivid).toBe(2);
    expect(r.warnings.some((w) => /three loud/.test(w.message))).toBe(false);
  });
});

describe('wearability second edition', () => {
  it('a sheer top is a layer violation for work and occasion, but not for a casual evening', () => {
    const blouse = () => item({ subtype: 'blouse', sheer: true, formalityScore: 3 });
    expect(validateOutfit([blouse(), jeans(), sneakers()], { eventType: 'work' }).violations.some((v) => v.rule === 'layer')).toBe(true);
    expect(validateOutfit([blouse(), jeans(), sneakers()], { eventType: 'occasion' }).violations.some((v) => v.rule === 'layer')).toBe(true);
    const evening = validateOutfit([blouse(), jeans(), sneakers()], { eventType: 'evening', weather: { temperatureC: 24 } });
    expect(evening.violations.some((v) => v.rule === 'layer')).toBe(false);
    expect(evening.warnings.some((w) => w.rule === 'layer')).toBe(false);
    // A layer over it settles the matter.
    expect(validateOutfit([blouse(), item({ layerRole: 'mid', subtype: 'blazer' }), jeans(), sneakers()], { eventType: 'work' }).violations.some((v) => v.rule === 'layer')).toBe(false);
  });

  it('the model saying needs a layer is honoured, and its saying not is only an opinion', () => {
    const top = () => item({ subtype: 'top', needsLayer: true, formalityScore: 3 });
    expect(validateOutfit([top(), jeans(), sneakers()], { eventType: 'work' }).violations.some((v) => v.rule === 'layer')).toBe(true);
    const cami = item({ subtype: 'camisole', needsLayer: false, formalityScore: 3 });
    expect(validateOutfit([cami, jeans(), sneakers()], { eventType: 'work' }).violations.some((v) => v.rule === 'layer')).toBe(true);
  });

  it('cocktail and formal occasions want the bottom and the shoes at business-casual or above', () => {
    const silkTop = item({ subtype: 'silk blouse', formalityScore: 5, dressCode: 'cocktail' });
    const casualTrousers = item({ category: 'bottom', layerRole: 'bottom', subtype: 'chinos', formalityScore: 4, dressCode: 'casual' });
    const heels = item({ category: 'footwear', layerRole: 'footwear', subtype: 'heels', formalityScore: 4, dressCode: 'cocktail' });
    const r = validateOutfit([silkTop, casualTrousers, heels], { eventType: 'occasion' });
    expect(r.violations.some((v) => v.rule === 'dress-code' && /chinos \(casual\)/.test(v.message))).toBe(true);
    const dressed = item({ category: 'bottom', layerRole: 'bottom', subtype: 'trousers', formalityScore: 4, dressCode: 'business-casual' });
    expect(validateOutfit([silkTop, dressed, heels], { eventType: 'occasion' }).violations.some((v) => v.rule === 'dress-code')).toBe(false);
    // The same pieces for work are not held to the occasion floor.
    expect(validateOutfit([silkTop, casualTrousers, heels], { eventType: 'work' }).violations.some((v) => v.rule === 'dress-code')).toBe(false);
    // A dress code on the shoes counts too.
    const sandals = item({ category: 'footwear', layerRole: 'footwear', subtype: 'heeled sandals', formalityScore: 4, dressCode: 'casual' });
    expect(validateOutfit([silkTop, dressed, sandals], { eventType: 'occasion' }).violations.some((v) => v.rule === 'dress-code')).toBe(true);
  });

  it('the dress code sharpens the formality read', () => {
    // Tagged casual (2) but read as cocktail (4.5): fits an occasion after all.
    const r = validateOutfit(
      [item({ formalityScore: 2, dressCode: 'cocktail' }), item({ ...jeans(), formalityScore: 2, dressCode: 'cocktail' }), item({ ...sneakers(), formalityScore: 2, dressCode: 'cocktail' })],
      { eventType: 'occasion' },
    );
    expect(r.violations.some((v) => v.rule === 'formality')).toBe(false);
  });

  it('a bold pattern on a bold pattern is named as such', () => {
    const r = validateOutfit([item({ pattern: 'floral', patternScale: 'bold' }), item({ ...jeans(), pattern: 'checked', patternScale: 'bold' }), sneakers()]);
    expect(r.warnings.some((w) => w.rule === 'pattern' && /bold/.test(w.message))).toBe(true);
  });

  it('reads shoe formality off the shoe type when the subtype says nothing', () => {
    const shoe = item({ category: 'footwear', layerRole: 'footwear', subtype: 'white pair', shoeType: 'sneaker', formalityScore: 4 });
    const trousers = item({ category: 'bottom', layerRole: 'bottom', subtype: 'tailored trousers', formalityScore: 4 });
    const r = validateOutfit([item({ formalityScore: 4 }), trousers, shoe], { eventType: 'work' });
    expect(r.violations.some((v) => v.rule === 'shoe-formality')).toBe(true);
  });
});

describe('pattern clash', () => {
  it('warns on two patterned pieces', () => {
    const r = validateOutfit([item({ pattern: 'striped' }), item({ ...jeans(), pattern: 'checked' }), sneakers()]);
    expect(r.warnings.some((w) => w.rule === 'pattern')).toBe(true);
  });

  it('is fine with one', () => {
    const r = validateOutfit([item({ pattern: 'floral' }), jeans(), sneakers()]);
    expect(r.warnings.some((w) => w.rule === 'pattern')).toBe(false);
  });
});

describe('availability', () => {
  it('rejects items that are in the wash', () => {
    const r = validateOutfit([tee(), item({ ...jeans(), state: 'in-wash' }), sneakers()]);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'availability')).toBe(true);
  });
});

describe('formality coherence', () => {
  it('rejects a casual outfit for a black-tie occasion', () => {
    const r = validateOutfit([tee(), jeans(), sneakers()], { eventType: 'occasion' });
    expect(r.violations.some((v) => v.rule === 'formality')).toBe(true);
  });

  it('accepts a casual outfit in a casual setting', () => {
    const r = validateOutfit([tee(), jeans(), sneakers()], { eventType: 'casual' });
    expect(r.ok).toBe(true);
  });

  it('warns when items span wildly different formality', () => {
    const gownTop = item({ formalityScore: 5 });
    const gymShorts = item({ category: 'bottom', layerRole: 'bottom', formalityScore: 1 });
    const r = validateOutfit([gownTop, gymShorts, sneakers()]);
    expect(r.warnings.some((w) => w.rule === 'formality')).toBe(true);
  });
});

describe('weather sanity', () => {
  it('rejects a heavy outfit in a heatwave', () => {
    const r = validateOutfit([item({ warmthValue: 5 }), item({ category: 'bottom', layerRole: 'bottom', warmthValue: 3 }), coat()], {
      weather: { temperatureC: 32 },
    });
    expect(r.violations.some((v) => v.rule === 'weather')).toBe(true);
  });

  it('rejects a summer outfit in freezing weather', () => {
    const r = validateOutfit([tee(), jeans(), sneakers()], { weather: { temperatureC: -2 } });
    expect(r.violations.some((v) => v.rule === 'weather')).toBe(true);
  });

  it('accepts a layered outfit in the cold', () => {
    const r = validateOutfit([item({ warmthValue: 2 }), item({ layerRole: 'mid', warmthValue: 5 }), jeans(), coat(), sneakers()], {
      weather: { temperatureC: 2 },
    });
    expect(r.ok).toBe(true);
  });

  it('warns on rain without an outer layer', () => {
    const r = validateOutfit([tee(), jeans(), sneakers()], {
      weather: { temperatureC: 15, description: 'light rain' },
    });
    expect(r.warnings.some((w) => w.rule === 'weather')).toBe(true);
  });

  it('degrades gracefully when warmth data is mostly missing', () => {
    const unknownTop = item({ warmthValue: null });
    const unknownBottom = item({ category: 'bottom', layerRole: 'bottom', warmthValue: null });
    const r = validateOutfit([unknownTop, unknownBottom, sneakers()], {
      weather: { temperatureC: -5 },
    });
    // No confident warmth judgment possible → no weather violation.
    expect(r.violations.some((v) => v.rule === 'weather')).toBe(false);
  });
});

describe('repeat avoidance', () => {
  const now = new Date('2026-08-31T08:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('rejects the exact same outfit worn recently', () => {
    const a = tee();
    const b = jeans();
    const c = sneakers();
    const r = validateOutfit([a, b, c], {
      recentWear: [{ itemIds: [a.id, b.id, c.id], wornOn: daysAgo(3) }],
      now,
    });
    expect(r.violations.some((v) => v.rule === 'repeat')).toBe(true);
  });

  it('allows the same outfit after the repeat window', () => {
    const a = tee();
    const b = jeans();
    const c = sneakers();
    const r = validateOutfit([a, b, c], {
      recentWear: [{ itemIds: [a.id, b.id, c.id], wornOn: daysAgo(20) }],
      now,
    });
    expect(r.violations.some((v) => v.rule === 'repeat')).toBe(false);
  });

  it('warns on heavy overlap with this week', () => {
    const a = tee();
    const b = jeans();
    const r = validateOutfit([a, b, sneakers()], {
      recentWear: [{ itemIds: [a.id, b.id, 'other-shoes'], wornOn: daysAgo(2) }],
      now,
    });
    expect(r.warnings.some((w) => w.rule === 'repeat')).toBe(true);
  });
});

describe('scoring', () => {
  it('ranks clean outfits above flawed ones', () => {
    const good = validateOutfit([tee(), jeans(), sneakers()], { eventType: 'casual' });
    const flawed = validateOutfit([tee(), jeans()], { eventType: 'occasion' });
    expect(good.score).toBeGreaterThan(flawed.score);
  });
});
