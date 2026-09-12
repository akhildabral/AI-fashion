import { describe, expect, it } from 'vitest';
import { compareEdge, compareLine, compareNames } from './compare.service';
import type { VerdictV2 } from './verdict.service';

// Compare two: the edge on every plaque is deterministic from the two
// verdicts, and the line names the one that earns its place and says why
// the other would wait.

function v2(p: Partial<VerdictV2> & { closet?: Partial<VerdictV2['closet']>; money?: Partial<VerdictV2['money']> } = {}): VerdictV2 {
  return {
    headline: 'could',
    line: '',
    eventTypes: ['work', 'casual'],
    taste: null,
    build: null,
    climate: null,
    computedAt: '2026-09-12T10:00:00.000Z',
    version: 2,
    ...p,
    closet: { outfits: 3, pairs: 5, closetSize: 20, closest: null, duplicate: false, unlock: null, lines: [], ...p.closet },
    money: { price: null, currency: null, asOf: null, budget: 'unknown', costPerWear: null, projectedWearsPerYear: null, lines: [], ...p.money },
  };
}

const blazer = { primaryColor: 'navy', subtype: 'blazer', category: 'outerwear' };
const coat = { primaryColor: 'camel', subtype: 'coat', category: 'outerwear' };

describe('compareEdge', () => {
  it('leans to more outfits, the non-duplicate, the higher taste score, the nearer budget and fewer build flags', () => {
    const a = v2({
      closet: { outfits: 6, duplicate: false },
      taste: { score: 0.8, lines: [] },
      money: { budget: 'within' },
      build: { lines: [{ line: 'The shoulder sits right.', tone: 'good' }], flags: [] },
    });
    const b = v2({
      closet: { outfits: 2, duplicate: true, closest: { id: 'c', label: 'camel coat', wears: 2, likeness: 7 } },
      taste: { score: 0.4, lines: [] },
      money: { budget: 'far' },
      build: { lines: [{ line: 'The length fights your build.', tone: 'flag' }], flags: ['length'] },
    });
    expect(compareEdge(a, b)).toEqual({ outfits: 'a', duplicate: 'a', taste: 'a', budget: 'a', build: 'a', overall: 'a' });
    expect(compareEdge(b, a)).toEqual({ outfits: 'b', duplicate: 'b', taste: 'b', budget: 'b', build: 'b', overall: 'b' });
  });

  it('ties when a side is unknown: no taste record, an unknown budget, no build read', () => {
    const a = v2({ taste: { score: 0.9, lines: [] }, money: { budget: 'within' }, build: { lines: [], flags: [] } });
    const b = v2({ taste: null, money: { budget: 'unknown' }, build: null });
    const e = compareEdge(a, b);
    expect(e.taste).toBe('tie');
    expect(e.budget).toBe('tie');
    expect(e.build).toBe('tie');
    expect(e.outfits).toBe('tie');
    expect(e.duplicate).toBe('tie');
    expect(e.overall).toBe('tie');
  });

  it('the headline decides overall; on the same headline the plaques vote in order, outfits first', () => {
    expect(compareEdge(v2({ headline: 'wait', closet: { outfits: 9 } }), v2({ headline: 'could', closet: { outfits: 1 } })).overall).toBe('b');
    expect(compareEdge(v2({ headline: 'earns', closet: { outfits: 1 } }), v2({ headline: 'could', closet: { outfits: 9 } })).overall).toBe('a');
    // Same headline, same outfits: the duplicate loses.
    expect(compareEdge(v2({ closet: { outfits: 3, duplicate: true } }), v2({ closet: { outfits: 3, duplicate: false } })).overall).toBe('b');
    // Same headline, same outfits, neither a duplicate: budget leans.
    expect(compareEdge(v2({ money: { budget: 'within' } }), v2({ money: { budget: 'above' } })).overall).toBe('a');
  });
});

describe('compareLine', () => {
  it('names the one that earns its place and why the other would wait', () => {
    const a = { piece: blazer, v2: v2({ headline: 'earns', closet: { outfits: 6 } }) };
    const b = { piece: coat, v2: v2({ headline: 'wait', closet: { outfits: 2, duplicate: true, closest: { id: 'c', label: 'camel coat', wears: 2, likeness: 7 } } }) };
    expect(compareLine(a, b)).toBe('The blazer earns its place; the coat would wait: you own one in camel, worn twice.');
    // Order of the arguments never changes who wins.
    expect(compareLine(b, a)).toBe('The blazer earns its place; the coat would wait: you own one in camel, worn twice.');
  });

  it('gives the wait reason from the verdict: nothing completes it, or the price', () => {
    const a = { piece: blazer, v2: v2({ headline: 'could', closet: { outfits: 2 } }) };
    expect(compareLine(a, { piece: coat, v2: v2({ headline: 'wait', closet: { outfits: 0, pairs: 1 } }) })).toBe('The blazer could work; the coat would wait: nothing you own completes it yet.');
    expect(compareLine(a, { piece: coat, v2: v2({ headline: 'wait', closet: { outfits: 4 }, money: { budget: 'far' } }) })).toBe('The blazer could work; the coat would wait: it sits well past what you spend.');
  });

  it('earns over could says the outfit counts', () => {
    const a = { piece: blazer, v2: v2({ headline: 'earns', closet: { outfits: 6 } }) };
    const b = { piece: coat, v2: v2({ headline: 'could', closet: { outfits: 1 } }) };
    expect(compareLine(a, b)).toBe('The blazer earns its place; the coat could work: 1 outfit to 6.');
  });

  it('on the same headline the plaques speak; a full tie is a coin toss', () => {
    const a = { piece: blazer, v2: v2({ headline: 'could', closet: { outfits: 5 } }) };
    const b = { piece: coat, v2: v2({ headline: 'could', closet: { outfits: 3 } }) };
    expect(compareLine(a, b)).toBe('Both could work; the blazer makes more of your closet: 5 outfits to 3.');
    expect(compareLine(a, { piece: coat, v2: v2({ headline: 'could', closet: { outfits: 5 } }) })).toBe('Both could work; honestly, a coin toss: they make the same of your closet.');
    expect(compareLine({ piece: blazer, v2: v2({ headline: 'earns', money: { budget: 'within' } }) }, { piece: coat, v2: v2({ headline: 'earns', money: { budget: 'above' } }) })).toBe(
      'Both would earn their place; the blazer sits closer to how you shop.',
    );
  });

  it('two of the same kind are told apart by colour', () => {
    expect(compareNames({ primaryColor: 'camel', subtype: 'coat', category: 'outerwear' }, { primaryColor: 'black', subtype: 'coat', category: 'outerwear' })).toEqual(['the camel coat', 'the black coat']);
    expect(compareNames(blazer, coat)).toEqual(['the blazer', 'the coat']);
    expect(compareNames({ subtype: 'coat', category: 'outerwear' }, { subtype: 'coat', category: 'outerwear' })).toEqual(['the first', 'the second']);
  });
});
