import { describe, expect, it } from 'vitest';
import { validateOutfit, type ValidatorItem } from './validator.service';

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

  it('only warns about missing footwear', () => {
    const r = validateOutfit([tee(), jeans()]);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.rule === 'completeness')).toBe(true);
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
