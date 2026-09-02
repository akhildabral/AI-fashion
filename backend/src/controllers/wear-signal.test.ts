import { describe, expect, it } from 'vitest';
import { wearSignalBonus } from './wardrobe.controller';

describe('wearSignalBonus', () => {
  it('is nothing without a corrected day', () => {
    expect(wearSignalBonus(undefined)).toBe(0);
    expect(wearSignalBonus({ passedOver: 0, chosenInstead: 0 })).toBe(0);
  });
  it('nudges a piece reached for instead up, and one left on the chair down', () => {
    expect(wearSignalBonus({ passedOver: 0, chosenInstead: 1 })).toBe(2);
    expect(wearSignalBonus({ passedOver: 2, chosenInstead: 0 })).toBe(-3);
  });
  it('caps both habits', () => {
    expect(wearSignalBonus({ passedOver: 9, chosenInstead: 0 })).toBe(-6);
    expect(wearSignalBonus({ passedOver: 0, chosenInstead: 9 })).toBe(8);
  });
});
