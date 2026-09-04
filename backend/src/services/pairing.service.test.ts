import { describe, expect, it } from 'vitest';
import {
  PAIR_THRESHOLD,
  closestOwned,
  closetGapsFor,
  dominantFormality,
  ghostPiece,
  harmonyTerm,
  likeness,
  outfitsAround,
  pairScore,
  pairsFor,
  slot,
  subtypeFamily,
  unlockAround,
  type PairingPiece,
} from './pairing.service';
import { srgbToLab } from '../lib/color';
import { colourOf } from './validator.service';

let seq = 0;
function piece(p: Partial<PairingPiece> & { category: string }): PairingPiece {
  return {
    id: `p-${++seq}`,
    subtype: null,
    primaryColor: 'black',
    pattern: 'solid',
    formalityScore: 3,
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
    ...p,
  };
}

const tee = (extra: Partial<PairingPiece> = {}) => piece({ category: 'top', subtype: 't-shirt', formalityScore: 2, warmthValue: 1, primaryColor: 'white', ...extra });
const jeans = (extra: Partial<PairingPiece> = {}) => piece({ category: 'bottom', subtype: 'jeans', formalityScore: 2, warmthValue: 3, primaryColor: 'navy', ...extra });
const sneakers = (extra: Partial<PairingPiece> = {}) => piece({ category: 'footwear', subtype: 'sneakers', formalityScore: 2, warmthValue: 2, primaryColor: 'white', ...extra });
const trousers = (extra: Partial<PairingPiece> = {}) => piece({ category: 'bottom', subtype: 'tailored trousers', formalityScore: 4, warmthValue: 2, primaryColor: 'charcoal', ...extra });
const pumps = (extra: Partial<PairingPiece> = {}) => piece({ category: 'footwear', subtype: 'pumps', formalityScore: 4, warmthValue: 1, primaryColor: 'black', ...extra });
const sweats = (extra: Partial<PairingPiece> = {}) => piece({ category: 'bottom', subtype: 'sweatpants', formalityScore: 1, warmthValue: 3, primaryColor: 'grey', ...extra });

describe('slot', () => {
  it('reads the layer from the subtype even when the category is top', () => {
    expect(slot(piece({ category: 'top', subtype: 'blazer', layerRole: 'base' }))).toBe('mid');
    expect(slot(piece({ category: 'top', subtype: 'denim jacket', layerRole: 'base' }))).toBe('outer');
    expect(slot(piece({ category: 'top', subtype: 'jumpsuit' }))).toBe('dress');
    expect(slot(piece({ category: 'top', subtype: 't-shirt' }))).toBe('top');
    expect(slot(piece({ category: 'other', subtype: 'swatch' }))).toBe('accessory');
  });
});

describe('pairScore', () => {
  it('scores sneakers under tailored trousers below the pair threshold', () => {
    expect(pairScore(sneakers(), trousers())).toBeLessThan(PAIR_THRESHOLD);
  });

  it('scores pumps over sweatpants below the pair threshold', () => {
    expect(pairScore(pumps(), sweats())).toBeLessThan(PAIR_THRESHOLD);
  });

  it('still pairs the right shoe with the right bottom', () => {
    expect(pairScore(sneakers(), jeans())).toBeGreaterThanOrEqual(PAIR_THRESHOLD);
    expect(pairScore(piece({ category: 'footwear', subtype: 'oxford shoes', formalityScore: 4, warmthValue: 2 }), trousers())).toBeGreaterThanOrEqual(PAIR_THRESHOLD);
  });

  it('penalises two oversized pieces, a crop over a low rise, a relaxed leg under an oversized top', () => {
    const plain = pairScore(tee(), jeans());
    expect(pairScore(tee({ fit: 'oversized' }), jeans({ fit: 'oversized' }))).toBeCloseTo(plain - 1.5, 5);
    expect(pairScore(tee({ fit: 'oversized' }), jeans({ fit: 'oversized', details: { rise: 'low' } }))).toBeCloseTo(plain - 1.5, 5);
    expect(pairScore(tee({ length: 'cropped' }), jeans({ details: { rise: 'low' } }))).toBeCloseTo(plain - 1, 5);
    expect(pairScore(tee({ fit: 'oversized' }), jeans({ fit: 'relaxed' }))).toBeCloseTo(plain - 1, 5);
  });

  it('counts stripes as a pattern in the both-loud rule', () => {
    const plain = pairScore(tee(), jeans());
    expect(pairScore(tee({ pattern: 'striped' }), jeans({ pattern: 'checked' }))).toBeCloseTo(plain - 2.5, 5);
    expect(pairScore(tee({ pattern: 'striped' }), jeans())).toBeCloseTo(plain, 5);
  });

  it('never pairs a swatch', () => {
    expect(pairScore(piece({ category: 'other', subtype: 'swatch' }), jeans())).toBe(0);
  });

  it('scores pattern scale when both were read: bold on bold fights, fine under bold is a small ask, fine on fine is fine', () => {
    const plain = pairScore(tee(), jeans());
    expect(pairScore(tee({ pattern: 'floral', patternScale: 'bold' }), jeans({ pattern: 'checked', patternScale: 'bold' }))).toBeCloseTo(plain - 2.5, 5);
    expect(pairScore(tee({ pattern: 'floral', patternScale: 'bold' }), jeans({ pattern: 'striped', patternScale: 'fine' }))).toBeCloseTo(plain - 0.5, 5);
    expect(pairScore(tee({ pattern: 'striped', patternScale: 'fine' }), jeans({ pattern: 'checked', patternScale: 'fine' }))).toBeCloseTo(plain, 5);
    expect(pairScore(tee({ pattern: 'striped', patternScale: 'medium' }), jeans({ pattern: 'checked', patternScale: 'bold' }))).toBeCloseTo(plain - 1.5, 5);
    // A solid against a bold pattern is no pattern clash at all.
    expect(pairScore(tee({ pattern: 'solid', patternScale: 'none' }), jeans({ pattern: 'floral', patternScale: 'bold' }))).toBeCloseTo(plain, 5);
  });
});

// LAB fixtures: a piece whose colour is known from its palette, with a name
// the neutral fallback would never catch, so the palette is what speaks.
function lab(r: number, g: number, b: number) {
  return [{ hex: '#000000', lab: srgbToLab(r, g, b), share: 0.9 }];
}
const navyLab = lab(20, 30, 80);
const camelLab = lab(193, 154, 107);
const blackLab = lab(10, 10, 10);
const redLab = lab(255, 0, 0);
const greenLab = lab(0, 128, 0);
const tealLab = lab(0, 128, 128);
const skyLab = lab(135, 206, 235);
const dustyBlueLab = lab(110, 140, 170);
const dustyBlue2Lab = lab(130, 160, 190);
const rustLab = lab(183, 65, 14);
const cadetLab = lab(95, 158, 160);
const kellyLab = lab(76, 187, 23);
const violetLab = lab(143, 0, 255);

describe('colour harmony', () => {
  // The same two pieces with nothing known about their colours: the baseline.
  const base = () => pairScore(tee({ primaryColor: 'mystery' }), jeans({ primaryColor: 'mystery' }));
  const withColours = (a: unknown, b: unknown) => pairScore(tee({ primaryColor: 'mystery', colorPalette: a as never }), jeans({ primaryColor: 'mystery', colorPalette: b as never }));

  it('navy + camel: a neutral goes with anything', () => {
    expect(withColours(navyLab, camelLab)).toBeCloseTo(base() + 2, 5);
  });

  it('black + anything, however loud', () => {
    expect(withColours(blackLab, redLab)).toBeCloseTo(base() + 2, 5);
    expect(withColours(redLab, blackLab)).toBeCloseTo(base() + 2, 5);
  });

  it('vivid red + vivid green clash, and warm against cool is one more strike', () => {
    expect(withColours(redLab, greenLab)).toBeCloseTo(base() - 3, 5);
    expect(harmonyTerm(colourOf({ colorPalette: redLab }), colourOf({ colorPalette: greenLab }))).toBe(-3);
  });

  it('teal + sky blue sit next to each other on the wheel', () => {
    expect(withColours(tealLab, skyLab)).toBeCloseTo(base() + 1, 5);
  });

  it('two muted blues are tonal, and tonal is best when both are soft', () => {
    expect(withColours(dustyBlueLab, dustyBlue2Lab)).toBeCloseTo(base() + 1.5, 5);
    expect(harmonyTerm(colourOf({ colorPalette: kellyLab }), colourOf({ colorPalette: greenLab }))).toBe(0.5); // two vivid greens
  });

  it('opposites work when one is quiet and fight when both shout', () => {
    expect(withColours(rustLab, cadetLab)).toBeCloseTo(base() + 0.5, 5);
    expect(harmonyTerm(colourOf({ colorPalette: kellyLab }), colourOf({ colorPalette: violetLab }))).toBe(-1);
  });

  it('uses the stored family and vividness when the row carries them, and the name only as a neutral fallback', () => {
    // A stored neutral goes with anything, a piece of unknown colour included.
    expect(pairScore(tee({ primaryColor: 'mystery', colourFamily: 'neutral', colourVividness: 'muted' }), jeans({ primaryColor: 'mystery' }))).toBeCloseTo(base() + 2, 5);
    expect(pairScore(tee({ primaryColor: 'mystery', colourFamily: 'neutral', colourVividness: 'muted' }), jeans({ primaryColor: 'mystery', colourFamily: 'red', colourVividness: 'vivid' }))).toBeCloseTo(base() + 2, 5);
    expect(pairScore(tee({ primaryColor: 'mystery', colourFamily: 'red', colourVividness: 'vivid' }), jeans({ primaryColor: 'mystery', colourFamily: 'green', colourVividness: 'vivid' }))).toBeCloseTo(base() - 3, 5);
    expect(pairScore(tee({ primaryColor: 'black' }), jeans({ primaryColor: 'mystery' }))).toBeCloseTo(base() + 2, 5);
    expect(pairScore(tee({ primaryColor: 'red' }), jeans({ primaryColor: 'green' }))).toBeCloseTo(base(), 5);
  });

  it('harmonyTerm is zero when a side is unknown, unless the other is a neutral', () => {
    expect(harmonyTerm(null, colourOf({ colorPalette: redLab }))).toBe(0);
    expect(harmonyTerm(null, colourOf({ colorPalette: blackLab }))).toBe(2);
    expect(colourOf({ primaryColor: 'mystery' })).toBeNull();
  });
});

describe('pool hygiene', () => {
  it('keeps the wash, suppressed pieces, unanswered twins and swatches out of pairs', () => {
    const t = tee();
    const closet = [
      t,
      jeans({ state: 'in-wash' }),
      jeans({ suppressed: true }),
      jeans({ twinOfId: 'someone' }),
      piece({ category: 'other', subtype: 'swatch' }),
      jeans({ id: 'good-jeans' }),
      jeans({ id: 'answered-twin', twinOfId: 'someone', twinResolvedAt: new Date() }),
    ];
    expect(pairsFor(t, closet).map((p) => p.id).sort()).toEqual(['answered-twin', 'good-jeans']);
  });

  it('never builds an outfit from a piece in the wash', () => {
    const t = tee();
    const dirty = jeans({ id: 'dirty', state: 'in-wash' });
    const shoes = sneakers();
    expect(outfitsAround(t, [t, dirty, shoes])).toEqual([]);
    expect(outfitsAround(dirty, [t, dirty, shoes])).toEqual([]);
    const clean = jeans({ id: 'clean' });
    const around = outfitsAround(t, [t, dirty, clean, shoes]);
    expect(around.length).toBeGreaterThan(0);
    expect(around.every((o) => !o.itemIds.includes('dirty'))).toBe(true);
  });

  it('can widen the states for a packed capsule', () => {
    const t = tee({ state: 'packed' });
    const j = jeans({ state: 'packed' });
    const s = sneakers({ state: 'packed' });
    expect(outfitsAround(t, [t, j, s])).toEqual([]);
    expect(outfitsAround(t, [t, j, s], { availableStates: ['clean', 'packed'] }).length).toBe(1);
  });

  it('requires shoes when the closet has clean shoes, and only then', () => {
    const t = tee();
    const j = jeans();
    expect(outfitsAround(t, [t, j]).length).toBe(1);
    // Clean shoes exist but none pair with the piece: no outfit counts.
    expect(outfitsAround(t, [t, j, pumps({ formalityScore: 5, subtype: 'stilettos' })])).toEqual([]);
  });
});

describe('likeness and closestOwned', () => {
  it('is zero across categories and across subtype families', () => {
    const tank = piece({ category: 'top', subtype: 'tank top', formalityScore: 2 });
    const polo = piece({ category: 'top', subtype: 'polo shirt', formalityScore: 2 });
    const shoes = sneakers();
    expect(likeness(tank, polo)).toBe(0);
    expect(likeness(tank, shoes)).toBe(0);
    expect(closestOwned(tank, [polo, shoes])).toBeNull();
  });

  it('finds the near-twin in the same family', () => {
    const tank = piece({ category: 'top', subtype: 'tank top', primaryColor: 'black', formalityScore: 2 });
    const cami = piece({ id: 'cami', category: 'top', subtype: 'camisole', primaryColor: 'black', formalityScore: 2 });
    const polo = piece({ category: 'top', subtype: 'polo shirt', primaryColor: 'black', formalityScore: 2 });
    const best = closestOwned(tank, [polo, cami]);
    expect(best?.id).toBe('cami');
    expect(best!.likeness).toBeGreaterThan(0);
    expect(likeness(tank, piece({ ...tank, id: 'same' }))).toBeGreaterThan(likeness(tank, cami));
  });

  it('groups subtypes into families', () => {
    expect(subtypeFamily('polo shirt')).toBe('polo');
    expect(subtypeFamily('oxford shirt')).toBe('shirt');
    expect(subtypeFamily('tank top')).toBe('tank');
    expect(subtypeFamily('white sneakers')).toBe('sneaker');
    expect(subtypeFamily('penny loafers')).toBe('flat');
    expect(subtypeFamily('black pumps')).toBe('heel');
    expect(subtypeFamily('sweatpants')).toBe('sweats');
    expect(subtypeFamily('tailored trousers')).toBe('trousers');
  });
});

describe('ghosts', () => {
  it('builds a plain piece in the slot with a neutral colour and a real subtype', () => {
    const g = ghostPiece({ slot: 'shoes', colour: 'navy', formality: 3 });
    expect(g.category).toBe('footwear');
    expect(g.primaryColor).toBe('navy');
    expect(g.subtype).toBe('loafers');
    expect(g.formalityScore).toBe(3);
    expect(slot(g)).toBe('shoes');
  });

  it('finds the closet formality band', () => {
    expect(dominantFormality([tee(), jeans(), sneakers(), trousers()])).toBe(2);
    expect(dominantFormality([])).toBe(3);
  });

  it('unlockAround names the slot, colour and formality of the best ghost', () => {
    const t = tee();
    const j = jeans();
    const j2 = jeans({ primaryColor: 'black' });
    // No shoes in the closet: a ghost shoe is what unlocks outfits around the tee.
    const u = unlockAround(t, [t, j, j2]);
    expect(u).not.toBeNull();
    expect(u!.slot).toBe('shoes');
    expect(u!.gain).toBe(2);
    expect(['black', 'white', 'navy', 'beige']).toContain(u!.colour);
    expect(u!.formality).toBe(2);
  });

  it('closetGapsFor simulates over the real closet and stays bounded', () => {
    const closet = [tee(), tee({ primaryColor: 'navy' }), jeans(), sneakers()];
    const started = Date.now();
    const { suggestions, outfitsPossible } = closetGapsFor(closet);
    expect(Date.now() - started).toBeLessThan(300);
    expect(outfitsPossible).toBeGreaterThan(0);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    for (const s of suggestions) {
      expect(s.unlocks).toBeGreaterThan(0);
      expect(s.colour).toBeTruthy();
      expect([2, 3, 4]).toContain(s.formality);
      expect(s.wanted).toMatch(new RegExp(`^a ${s.colour} `));
    }
    // Two tees and one bottom: a second bottom is worth more than a third tee.
    expect(suggestions[0].category).toBe('bottom');
  });

  it('closetGapsFor holds under 300 ms on a 200-piece closet', () => {
    const closet: PairingPiece[] = [];
    const colours = ['black', 'white', 'navy', 'red', 'green', 'beige', 'blue', 'grey'];
    for (let i = 0; i < 200; i++) {
      const c = colours[i % colours.length];
      const f = 1 + (i % 4);
      const kind = i % 4;
      closet.push(
        kind === 0
          ? piece({ category: 'top', subtype: f >= 3 ? 'shirt' : 't-shirt', primaryColor: c, formalityScore: f, warmthValue: 1 })
          : kind === 1
            ? piece({ category: 'bottom', subtype: f >= 3 ? 'trousers' : 'jeans', primaryColor: c, formalityScore: f, warmthValue: 3 })
            : kind === 2
              ? piece({ category: 'footwear', subtype: f >= 3 ? 'loafers' : 'sneakers', primaryColor: c, formalityScore: f, warmthValue: 2 })
              : piece({ category: 'outerwear', subtype: 'jacket', primaryColor: c, formalityScore: f, warmthValue: 5 }),
      );
    }
    const started = Date.now();
    const { suggestions } = closetGapsFor(closet);
    expect(Date.now() - started).toBeLessThan(300);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});
