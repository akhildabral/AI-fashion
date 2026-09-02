import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { bandOf, fingerprintOf, hamming, matchPiece, scorePair } from './closet-match.service';

const base = { id: 'a', category: 'top', subtype: 'polo', primaryColor: 'navy', pattern: 'solid', formalityScore: 3, warmthValue: 3, material: 'cotton', colorPalette: [{ hex: '#1f2a44', lab: { L: 18, a: 4, b: -20 }, share: 0.8 }] };

describe('closet matcher', () => {
  it('fingerprints the same picture the same, and a different one differently', async () => {
    const a = await sharp({ create: { width: 64, height: 80, channels: 3, background: '#223355' } }).png().toBuffer();
    const b = await sharp({ create: { width: 64, height: 80, channels: 3, background: '#223355' } }).composite([{ input: await sharp({ create: { width: 20, height: 60, channels: 3, background: '#ffffff' } }).png().toBuffer(), left: 10, top: 10 }]).png().toBuffer();
    const fa = await fingerprintOf(a);
    const fa2 = await fingerprintOf(await sharp(a).resize(128, 160).jpeg().toBuffer());
    const fb = await fingerprintOf(b);
    expect(fa).toHaveLength(16);
    expect(hamming(fa, fa2)).toBeLessThanOrEqual(4);
    expect(hamming(fa, fb)).toBeGreaterThan(10);
  });

  it('calls the same piece sure, a sibling near, and a stranger new', () => {
    const same = { ...base, id: 'b', fingerprint: 'ffffffffffffffff' };
    const src = { ...base, fingerprint: 'ffffffffffffffff' };
    expect(bandOf(scorePair(src, same).score)).toBe('sure');
    const sibling = { ...base, id: 'c', primaryColor: 'black', colorPalette: [{ hex: '#111111', lab: { L: 8, a: 0, b: 0 }, share: 0.8 }] };
    expect(bandOf(scorePair(base, sibling).score)).toBe('near');
    const stranger = { ...base, id: 'd', subtype: 'tank', primaryColor: 'red', pattern: 'striped', material: 'linen', colorPalette: [{ hex: '#c02020', lab: { L: 45, a: 60, b: 40 }, share: 0.8 }] };
    expect(bandOf(scorePair(base, stranger).score)).toBe('new');
  });

  it('never crosses categories and honours exclusions', () => {
    const closet = [{ ...base, id: 'b' }, { ...base, id: 'c', category: 'bottom' }];
    const out = matchPiece(base, closet, { exclude: new Set(['b']) });
    expect(out).toHaveLength(0);
    expect(matchPiece(base, closet).map((m) => m.candidate.id)).toEqual(['b']);
  });
});

it('a photo of a plain piece still finds that piece when it has no palette or fingerprint', () => {
  const seeded = { id: 'tank', category: 'top', subtype: 'tank top', primaryColor: 'black', formalityScore: 2, warmthValue: 0, pattern: 'solid', material: 'cotton', colorPalette: null, fingerprint: null };
  const fromPhoto = { id: 'photo-0', category: 'top', subtype: 'tank top', primaryColor: 'black', formalityScore: 2, warmthValue: 0, pattern: 'solid', material: 'cotton', colorPalette: [], fingerprint: 'abcdef0123456789' };
  const [m] = matchPiece(fromPhoto, [seeded]);
  expect(m.band).not.toBe('new');
});
