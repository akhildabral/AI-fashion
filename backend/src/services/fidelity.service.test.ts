import { describe, expect, it } from 'vitest';
import { corrections, scoreFidelity, type CheckedGarment, type FidelityVerdict, type GarmentVerdict } from './fidelity.service';

// The scorer: a verdict per garment becomes a score and a retry decision.
// A missing piece or a major miss (colour, sleeve/length, silhouette) earns
// the one retry; a print miss alone does not; shoes that could not be in
// the frame are not counted.

const specs: CheckedGarment[] = [
  { itemId: 'tee', slot: 'top', spec: 'black cotton t-shirt, half sleeves, crew neck, One Piece logo print', category: 'top' },
  { itemId: 'trousers', slot: 'bottom', spec: 'black trousers, straight leg', category: 'bottom' },
  { itemId: 'nb', slot: 'shoes', spec: 'grey sneakers, a sneaker — New Balance 574', category: 'footwear' },
];

function ok(index: number, over: Partial<GarmentVerdict> = {}): GarmentVerdict {
  return { index, slot: specs[index - 1].slot, present: true, matches: { colour: true, sleeveOrLength: true, silhouette: true, print: true }, note: '', ...over };
}

function verdict(garments: GarmentVerdict[], over: Partial<FidelityVerdict> = {}): FidelityVerdict {
  return { garments, personPreserved: true, shoesVisible: true, ...over };
}

describe('scoreFidelity', () => {
  it('a perfect verdict scores 100 and asks for nothing', () => {
    const s = scoreFidelity(verdict([ok(1), ok(2), ok(3)]), specs);
    expect(s).toEqual({ score: 100, retry: false, failed: [], minor: [] });
  });

  it('the owner’s case — long sleeves, different trousers, generic shoes — earns the retry', () => {
    const v = verdict([
      ok(1, { matches: { colour: true, sleeveOrLength: false, silhouette: true, print: true }, note: 'Rendered with long sleeves' }),
      ok(2, { matches: { colour: true, sleeveOrLength: true, silhouette: false, print: true }, note: 'Wider, pleated trousers' }),
      ok(3, { matches: { colour: true, sleeveOrLength: true, silhouette: false, print: true }, note: 'A generic grey trainer, not the pictured model' }),
    ]);
    const s = scoreFidelity(v, specs);
    expect(s.retry).toBe(true);
    expect(s.failed).toEqual([0, 1, 2]);
    expect(s.score).toBe(75);
  });

  it('a missing garment is a retry and earns nothing', () => {
    const s = scoreFidelity(verdict([ok(1), ok(2), ok(3, { present: false, note: 'Barefoot' })]), specs);
    expect(s.retry).toBe(true);
    expect(s.failed).toEqual([2]);
    expect(s.score).toBe(67);
  });

  it('a print miss alone lowers the score but is not worth a second render', () => {
    const s = scoreFidelity(verdict([ok(1, { matches: { colour: true, sleeveOrLength: true, silhouette: true, print: false } }), ok(2), ok(3)]), specs);
    expect(s.retry).toBe(false);
    expect(s.minor).toEqual([0]);
    expect(s.failed).toEqual([]);
    expect(s.score).toBe(92);
  });

  it('shoes that cannot be in the frame are not counted against the render', () => {
    const v = verdict([ok(1), ok(2), ok(3, { present: false, note: 'Feet are cropped out' })], { shoesVisible: false });
    expect(scoreFidelity(v, specs).retry).toBe(true);
    const excused = scoreFidelity(v, specs, { shoesOutOfFrame: true });
    expect(excused).toEqual({ score: 100, retry: false, failed: [], minor: [] });
  });

  it('a changed person halves the score and asks for the retry', () => {
    const s = scoreFidelity(verdict([ok(1), ok(2), ok(3)], { personPreserved: false }), specs);
    expect(s.score).toBe(50);
    expect(s.retry).toBe(true);
  });
});

describe('corrections', () => {
  it('names each failed garment, what was wrong, and restates its spec', () => {
    const v = verdict([
      ok(1, { matches: { colour: true, sleeveOrLength: false, silhouette: true, print: true }, note: 'Rendered with long sleeves.' }),
      ok(2),
      ok(3, { present: false, note: 'Generic shoes' }),
    ]);
    const lines = corrections(v, specs, scoreFidelity(v, specs));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('GARMENT 1 (the top)');
    expect(lines[0]).toContain('sleeve or hem length was wrong');
    expect(lines[0]).toContain('Rendered with long sleeves');
    expect(lines[0]).toContain('half sleeves');
    expect(lines[1]).toContain('GARMENT 3 (the shoes)');
    expect(lines[1]).toContain('missing or replaced');
    expect(lines[1]).toContain('New Balance 574');
  });

  it('says so when the person was changed', () => {
    const v = verdict([ok(1), ok(2), ok(3)], { personPreserved: false });
    const lines = corrections(v, specs, scoreFidelity(v, specs));
    expect(lines).toEqual([expect.stringContaining('the very same person')]);
  });
});
