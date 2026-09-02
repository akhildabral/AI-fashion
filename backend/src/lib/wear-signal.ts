/**
 * What a corrected day says about a piece: left on the chair when it was
 * laid out counts against it, reached for when it wasn't counts for it.
 * Capped so one habit never drowns the validator's own judgement.
 * Pure, so it can be tested without a database behind it.
 */
export function wearSignalBonus(sig: { passedOver: number; chosenInstead: number } | undefined): number {
  if (!sig) return 0;
  return Math.min(sig.chosenInstead, 4) * 2 - Math.min(sig.passedOver, 4) * 1.5;
}
