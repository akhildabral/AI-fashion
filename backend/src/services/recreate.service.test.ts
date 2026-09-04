import { describe, expect, it } from 'vitest';
import { srgbToLab } from '../lib/color';
import { blackJeans, blackPumps, blackTrousers, bluePolo, cleanTank, rustBlazer, whiteSneakers } from './__fixtures__/dev-closet';
import { colourCloseness, recreateFromPieces, slotScore, type SlotCandidate, type SlotSource } from './recreate.service';

// Recreate, slot by slot: a piece stands in only for a piece in the same
// slot role, close enough in family, colour and formality; a slot with no
// stand-in is named in words; and the recreated set is judged by the rules.

const palette = (r: number, g: number, b: number) => [{ hex: '#000000', share: 1, lab: srgbToLab(r, g, b) }];

function source(p: Partial<SlotSource> & Pick<SlotSource, 'id' | 'category' | 'subtype'>): SlotSource {
  return { primaryColor: null, formalityScore: null, warmthValue: null, pattern: 'solid', ...p };
}

function cand(p: Partial<SlotCandidate> & Pick<SlotCandidate, 'id' | 'category' | 'subtype'>): SlotCandidate {
  return { primaryColor: null, formalityScore: null, warmthValue: null, pattern: 'solid', state: 'clean', ...p };
}

const closet: SlotCandidate[] = [blackPumps, rustBlazer, blackTrousers, bluePolo, blackJeans, whiteSneakers, cleanTank].map((c) => ({ ...c }));

describe('slot-role matching', () => {
  it('matches a blazer filed under top to the blazer filed under outerwear, never to a shirt', () => {
    const blazer = source({ id: 's-blazer', category: 'top', subtype: 'blazer', primaryColor: 'rust', formalityScore: 4 });
    const r = recreateFromPieces([blazer], closet);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].slot).toBe('mid');
    expect(r.pairs[0].match.id).toBe('rust-blazer');
  });

  it('a shirt never takes the blazer, whatever the colour', () => {
    const shirt = source({ id: 's-shirt', category: 'top', subtype: 'shirt', primaryColor: 'rust', formalityScore: 4 });
    const r = recreateFromPieces([shirt], [{ ...rustBlazer }]);
    expect(r.pairs).toHaveLength(0);
    expect(r.missing[0]).toMatchObject({ slot: 'base', reason: 'no clean top near rust shirt' });
  });

  it('uses each closet piece at most once', () => {
    const a = source({ id: 'a', category: 'bottom', subtype: 'jeans', primaryColor: 'black', formalityScore: 2 });
    const b = source({ id: 'b', category: 'bottom', subtype: 'jeans', primaryColor: 'black', formalityScore: 2 });
    const r = recreateFromPieces([a, b], [{ ...blackJeans }]);
    expect(r.pairs.map((p) => p.match.id)).toEqual(['black-jeans']);
    expect(r.missing.map((m) => m.sourceId)).toEqual(['b']);
  });
});

describe('minimum score', () => {
  const loafers = source({ id: 's-loafers', category: 'footwear', subtype: 'black loafers', primaryColor: 'black', formalityScore: 3 });

  it('a different family with no close colour is not a stand-in', () => {
    expect(slotScore(loafers, cand({ ...whiteSneakers })).acceptable).toBe(false);
    expect(slotScore(loafers, cand({ ...blackPumps })).acceptable).toBe(false);
  });

  it('the same family within a step of formality is', () => {
    const flats = cand({ id: 'flats', category: 'footwear', subtype: 'ballet flats', primaryColor: 'beige', formalityScore: 3 });
    const s = slotScore(loafers, flats);
    expect(s.acceptable).toBe(true);
    expect(s.reasons).toContain('the same kind of piece');
  });

  it('the same family two steps off in formality is not', () => {
    const dressy = cand({ id: 'dressy', category: 'footwear', subtype: 'loafers', primaryColor: 'black', formalityScore: 5 });
    expect(slotScore(loafers, dressy).acceptable).toBe(false);
  });

  it('a close colour in Lab carries a different family of the same category', () => {
    const src = { ...loafers, colorPalette: palette(20, 20, 20) };
    const boots = cand({ id: 'boots', category: 'footwear', subtype: 'ankle boots', primaryColor: 'black', formalityScore: 3, colorPalette: palette(28, 26, 27) });
    const c = colourCloseness(src, boots);
    expect(c.deltaE).not.toBeNull();
    expect(c.deltaE!).toBeLessThan(20);
    expect(slotScore(src, boots).acceptable).toBe(true);
  });

  it('prefers the closer colour, then the clean piece', () => {
    const black = cand({ id: 'black', category: 'footwear', subtype: 'black loafers', primaryColor: 'black', formalityScore: 3 });
    const brown = cand({ id: 'brown', category: 'footwear', subtype: 'loafers', primaryColor: 'brown', formalityScore: 3 });
    expect(recreateFromPieces([loafers], [brown, black]).pairs[0].match.id).toBe('black');
    const washed = { ...black, id: 'washed', state: 'in-wash' };
    const r = recreateFromPieces([loafers], [washed, { ...black }], { availableStates: ['clean', 'in-wash'] });
    expect(r.pairs[0].match.id).toBe('black');
    expect(r.pairs[0].reasons).toContain('the same type');
  });
});

describe('missing slots', () => {
  it('names the slot and the piece it had no stand-in for', () => {
    const loafers = source({ id: 's-loafers', category: 'footwear', subtype: 'black loafers', primaryColor: 'black', formalityScore: 3 });
    const dress = source({ id: 's-dress', category: 'dress', subtype: 'slip dress', primaryColor: 'ivory', formalityScore: 4 });
    const r = recreateFromPieces([loafers, dress], closet);
    expect(r.missing).toEqual([
      { sourceId: 's-loafers', slot: 'footwear', wanted: 'black loafers', reason: 'no clean footwear near black loafers' },
      { sourceId: 's-dress', slot: 'one-piece', wanted: 'cream slip dress', reason: 'no clean one-piece near cream slip dress' },
    ]);
    expect(r.outfit).toEqual([]);
    expect(r.verdict).toBeNull();
  });

  it('drops the word "clean" when the closet counts what is in the wash', () => {
    const loafers = source({ id: 's-loafers', category: 'footwear', subtype: 'black loafers', primaryColor: 'black', formalityScore: 3 });
    const r = recreateFromPieces([loafers], [], { availableStates: ['clean', 'in-wash'] });
    expect(r.missing[0].reason).toBe('no footwear near black loafers');
  });
});

describe('validation of the recreated set', () => {
  it('a complete casual set passes', () => {
    const sources = [
      source({ id: 's1', category: 'top', subtype: 'polo shirt', primaryColor: 'navy', formalityScore: 2 }),
      source({ id: 's2', category: 'bottom', subtype: 'jeans', primaryColor: 'black', formalityScore: 2 }),
      source({ id: 's3', category: 'footwear', subtype: 'sneakers', primaryColor: 'white', formalityScore: 2 }),
    ];
    const r = recreateFromPieces(sources, closet, { eventType: 'casual', season: 'spring' });
    expect(r.pairs.map((p) => p.match.id)).toEqual(['blue-polo', 'black-jeans', 'white-sneakers']);
    expect(r.outfit.map((i) => i.id)).toEqual(['blue-polo', 'black-jeans', 'white-sneakers']);
    expect(r.verdict).toMatchObject({ ok: true, violations: [] });
  });

  it('a tank under nothing for work fails with the layer rule named', () => {
    const sources = [
      source({ id: 's1', category: 'top', subtype: 'tank top', primaryColor: 'black', formalityScore: 2 }),
      source({ id: 's2', category: 'bottom', subtype: 'tailored trousers', primaryColor: 'black', formalityScore: 4 }),
      source({ id: 's3', category: 'footwear', subtype: 'pumps', primaryColor: 'black', formalityScore: 4 }),
    ];
    const r = recreateFromPieces(sources, closet, { eventType: 'work', season: 'spring' });
    expect(r.pairs).toHaveLength(3);
    expect(r.verdict?.ok).toBe(false);
    expect(r.verdict?.violations.map((v) => v.rule)).toContain('layer');
  });

  it('a set with the shoes missing is judged incomplete when the closet has clean shoes', () => {
    const sources = [
      source({ id: 's1', category: 'top', subtype: 'polo shirt', primaryColor: 'blue', formalityScore: 2 }),
      source({ id: 's2', category: 'bottom', subtype: 'jeans', primaryColor: 'black', formalityScore: 2 }),
      source({ id: 's3', category: 'footwear', subtype: 'hiking boots', primaryColor: 'brown', formalityScore: 1 }),
    ];
    const r = recreateFromPieces(sources, closet, { eventType: 'casual', season: 'spring', weather: { temperatureC: 18 } });
    expect(r.missing.map((m) => m.slot)).toEqual(['footwear']);
    expect(r.verdict?.violations.map((v) => v.rule)).toContain('footwear');
  });
});
