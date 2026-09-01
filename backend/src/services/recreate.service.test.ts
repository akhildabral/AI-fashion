import { describe, expect, it } from 'vitest';
import { matchScore, recreateOutfit } from './recreate.service';

describe('recreate matching', () => {
  const src = { id: 's1', category: 'top', subtype: 'hoodie', primaryColor: 'blue', formalityScore: 2, warmthValue: 3, pattern: 'solid' };
  it('scores identical attributes highest', () => {
    const twin = { ...src, id: 'c1' };
    expect(matchScore(src, twin)).toBeGreaterThan(6);
  });
  it('greedy match uses each closet piece once and reports gaps', () => {
    const sources = [src, { ...src, id: 's2', category: 'footwear', subtype: 'sneaker', primaryColor: 'white' }];
    const closet = [{ ...src, id: 'c1', wearCount: 5 }];
    const r = recreateOutfit(sources, closet);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].match.id).toBe('c1');
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].wanted).toContain('sneaker');
  });
  it('category is a hard gate', () => {
    const closet = [{ ...src, id: 'c1', category: 'bottom', wearCount: 0 }];
    const r = recreateOutfit([src], closet);
    expect(r.matched).toHaveLength(0);
    expect(r.missing).toHaveLength(1);
  });
});
