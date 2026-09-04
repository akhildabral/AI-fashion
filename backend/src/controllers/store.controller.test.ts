import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', () => ({ prisma: {} }));
vi.mock('../lib/notify', () => ({ notify: vi.fn() }));

import { unlockWords, verdictLine } from './store.controller';

// The store verdict in words: what the piece goes with and makes, then the
// one ghost — by colour and formality band — that would take the count up.

describe('store verdict line', () => {
  it('names the best ghost by colour and band and says what it unlocks in words', () => {
    const line = verdictLine({ pairs: 7, outfits: 4, unlock: { slot: 'bottom', gain: 5, colour: 'navy', formality: 3 } });
    expect(line).toBe('Goes with 7 of your pieces and unlocks 4 outfits. A navy smart-casual trouser would unlock 9.');
  });

  it('picks the noun from the slot and the band', () => {
    expect(unlockWords({ slot: 'shoes', gain: 2, colour: 'white', formality: 2 })).toBe('a white casual sneaker');
    expect(unlockWords({ slot: 'shoes', gain: 2, colour: 'black', formality: 3 })).toBe('a black smart-casual loafer');
    expect(unlockWords({ slot: 'outer', gain: 2, colour: 'black', formality: 4 })).toBe('a black business coat');
    expect(unlockWords({ slot: 'top', gain: 2, colour: 'white', formality: 2 })).toBe('a white casual tee');
    expect(unlockWords({ slot: 'top', gain: 1 })).toBe('a shirt');
  });

  it('is honest when nothing complete comes of it yet', () => {
    expect(verdictLine({ pairs: 2, outfits: 0, unlock: { slot: 'top', gain: 3, colour: 'black', formality: 2 } })).toBe(
      'Goes with 2 of your pieces but makes no complete outfit yet. A black casual tee would unlock 3.',
    );
    expect(verdictLine({ pairs: 0, outfits: 0, unlock: null })).toBe('Goes with nothing you own yet.');
  });

  it('singular counts read as singular, and no ghost means one sentence', () => {
    expect(verdictLine({ pairs: 1, outfits: 1, unlock: null })).toBe('Goes with 1 of your pieces and unlocks 1 outfit.');
    expect(verdictLine({ pairs: 3, outfits: 2, unlock: { slot: 'outer', gain: 0 } })).toBe('Goes with 3 of your pieces and unlocks 2 outfits.');
  });
});
