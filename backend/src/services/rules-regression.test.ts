import { describe, expect, it } from 'vitest';
import type { WardrobeItem } from '@prisma/client';
import { validateOutfit } from './validator.service';
import { PAIR_THRESHOLD, closestOwned, closetGapsFor, likeness, outfitsAround, pairScore, pairsFor } from './pairing.service';
import { honestRationale, planOpinion, prefilterPool, validateAndRank, violationConstraints } from './compose.service';
import {
  blackJeans,
  blackPumps,
  blackTank,
  blackTrousers,
  bluePolo,
  cleanTank,
  devCloset,
  goldSwatch,
  greySweatpants,
  rustBlazer,
  whiteSneakers,
} from './__fixtures__/dev-closet';

// Each case here is a probe that went wrong on the dev closet. The rules
// core must keep saying no to these, whatever the composer proposes.

const rules = (r: { violations: { rule: string }[] }) => r.violations.map((v) => v.rule);

describe('dev closet regressions', () => {
  it('sweatpants + trousers + polo: two bottoms is a violation', () => {
    const r = validateOutfit([greySweatpants, blackTrousers, bluePolo], { eventType: 'work' });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('slots');
    expect(r.slots.bottom).toEqual([greySweatpants.id, blackTrousers.id]);
  });

  it('blazer + trousers + pumps: nothing under the blazer is a violation', () => {
    const r = validateOutfit([rustBlazer, blackTrousers, blackPumps], { eventType: 'evening' });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('completeness');
    expect(r.slots.base).toEqual([]);
    expect(r.slots.mid).toEqual([rustBlazer.id]);
  });

  it('a blazer tagged top with role base is still read as a layer', () => {
    const misfiled = { ...rustBlazer, category: 'top', layerRole: 'base' };
    const r = validateOutfit([misfiled, blackTrousers, blackPumps], { eventType: 'work' });
    expect(rules(r)).toContain('completeness');
  });

  it('tank + sweatpants with clean pumps in the closet: no footwear is a violation', () => {
    const r = validateOutfit([cleanTank, greySweatpants], { eventType: 'casual', hasCleanFootwear: true });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('footwear');
  });

  it('polo + jeans + pumps for a gym session: the shoe is a violation', () => {
    const r = validateOutfit([bluePolo, blackJeans, blackPumps], { eventType: 'athletic' });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('shoe-formality');
  });

  it('pumps + polo + sweatpants for a gym session: a violation', () => {
    const r = validateOutfit([blackPumps, bluePolo, greySweatpants], { eventType: 'athletic' });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('shoe-formality');
  });

  it('the gold swatch in any outfit is a violation', () => {
    const r = validateOutfit([goldSwatch, blackPumps], { eventType: 'occasion' });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('not-wearable');
    const r2 = validateOutfit([bluePolo, blackJeans, blackPumps, goldSwatch]);
    expect(rules(r2)).toContain('not-wearable');
  });

  it('the in-wash tank never pairs and never lands in an outfit', () => {
    expect(pairsFor(greySweatpants, devCloset).map((p) => p.id)).not.toContain(blackTank.id);
    expect(pairsFor(bluePolo, devCloset).map((p) => p.id)).not.toContain(blackTank.id);
    for (const seed of devCloset) {
      for (const o of outfitsAround(seed, devCloset, { limit: 100 })) {
        expect(o.itemIds).not.toContain(blackTank.id);
        expect(o.itemIds).not.toContain(goldSwatch.id);
      }
    }
    expect(outfitsAround(blackTank, devCloset)).toEqual([]);
  });

  it('the polo is not the tank top\'s near-twin', () => {
    expect(likeness(blackTank, bluePolo)).toBe(0);
    expect(closestOwned(blackTank, devCloset)?.id).not.toBe(bluePolo.id);
  });

  it('sneakers under tailored trousers score below the pair threshold and fail at work', () => {
    expect(pairScore(whiteSneakers, blackTrousers)).toBeLessThan(PAIR_THRESHOLD);
    const r = validateOutfit([bluePolo, blackTrousers, whiteSneakers], { eventType: 'work' });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('shoe-formality');
  });

  it('gaps come from the closet, not a hard-coded trio', () => {
    const { suggestions, outfitsPossible } = closetGapsFor(devCloset);
    const wanted = suggestions.map((s) => s.wanted);
    expect(wanted).not.toContain('a versatile white shirt');
    expect(wanted).not.toContain('a dark pair of jeans');
    expect(wanted).not.toContain('a white sneaker');
    expect(outfitsPossible).toBeGreaterThanOrEqual(1);
    for (const s of suggestions) {
      expect(s).toMatchObject({ category: expect.any(String), wanted: expect.any(String), colour: expect.any(String), formality: expect.any(Number) });
      expect(s.unlocks).toBeGreaterThan(0);
    }
    // One shirt to go under the blazer and over the trousers: the closet's clearest gap.
    const top = suggestions.find((s) => s.category === 'top');
    expect(top).toBeDefined();
    expect(top!.unlocks).toBeGreaterThan(0);
  });
});

// The same probes through the ranking the brief uses: candidates in, the
// honest one out. Passing candidates always beat failing ones; when nothing
// passes, the least-bad ships marked as such.

const rows = (...pieces: object[]) => pieces as unknown as WardrobeItem[];
const candidate = (...pieces: object[]) => ({ items: rows(...pieces), rationale: '' });
const cleanPool = rows(blackPumps, rustBlazer, blackTrousers, bluePolo, greySweatpants, blackJeans);

describe('dev closet regressions through validateAndRank', () => {
  it('gym session: sweatpants beat jeans under the only clean shoes, and the verdict is honest', () => {
    const ranked = validateAndRank([candidate(bluePolo, blackJeans, blackPumps), candidate(bluePolo, greySweatpants, blackPumps)], {
      eventType: 'athletic',
      recentWear: [],
      hasCleanFootwear: true,
    });
    expect(ranked.every((o) => !o.validation.ok)).toBe(true);
    expect(ranked[0].items.map((i) => i.id)).toContain(greySweatpants.id);
    const line = honestRationale(ranked[0].validation, ranked[0].items, 'athletic', { fit: 'A perfect sporty look' });
    expect(line).toMatch(/^Nothing clean makes a complete training outfit today: black pumps are not for an athletic setting/);
    expect(line).not.toMatch(/perfect/i);
  });

  it('client dinner: blazer + trousers + pumps with no shirt loses to the same with the polo under it', () => {
    const ranked = validateAndRank([candidate(rustBlazer, blackTrousers, blackPumps), candidate(bluePolo, rustBlazer, blackTrousers, blackPumps)], {
      eventType: 'evening',
      recentWear: [],
      hasCleanFootwear: true,
    });
    expect(ranked[0].validation.ok).toBe(true);
    expect(ranked[0].items.map((i) => i.id)).toContain(bluePolo.id);
    expect(ranked).toHaveLength(1);
  });

  it('wedding reception as an occasion: the formal set passes where the weekday read made it a violation', () => {
    const set = candidate(bluePolo, rustBlazer, blackTrousers, blackPumps);
    const asOccasion = validateAndRank([set], { eventType: 'occasion', recentWear: [], hasCleanFootwear: true });
    const asCasual = validateAndRank([set], { eventType: 'casual', recentWear: [], hasCleanFootwear: true });
    expect(asOccasion[0].validation.ok).toBe(true);
    expect(asOccasion[0].validation.warnings.some((w) => /casual setting/.test(w.message))).toBe(false);
    expect(asCasual[0].validation.warnings.some((w) => /casual setting/.test(w.message))).toBe(true);
  });

  it('a pinned sweatpants office day: sweatpants + trousers + polo is never ok:true', () => {
    const ranked = validateAndRank([candidate(greySweatpants, blackTrousers, bluePolo, blackPumps)], { eventType: 'work', recentWear: [], hasCleanFootwear: true });
    expect(ranked[0].validation.ok).toBe(false);
    expect(ranked[0].validation.violations.map((v) => v.rule)).toContain('slots');
    const constraints = violationConstraints(ranked);
    expect(constraints.some((c) => /two bottoms/i.test(c) && c.includes(greySweatpants.id))).toBe(true);
  });

  it("the person's sweatpants + blazer + pumps for work gets an opinion with a swap offered", () => {
    const items = rows(greySweatpants, rustBlazer, blackPumps);
    const v = validateOutfit(items, { eventType: 'work' });
    expect(v.ok).toBe(false);
    const line = planOpinion(v, items, 'work');
    expect(line).toMatch(/pumps/);
    expect(line).toMatch(/Want me to /);
    expect(line).not.toMatch(/keep it as it is/);
  });

  it('the pre-filter narrows a work pool to the office band but never empties a slot', () => {
    const pool = prefilterPool(cleanPool, { eventType: 'work', season: 'winter' });
    const ids = pool.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([blackTrousers.id, rustBlazer.id, blackPumps.id, bluePolo.id]));
    expect(ids).not.toContain(greySweatpants.id);
    const gym = prefilterPool(cleanPool, { eventType: 'athletic', season: 'summer' });
    expect(gym.map((i) => i.id)).toEqual(expect.arrayContaining([greySweatpants.id, blackPumps.id]));
  });
});
