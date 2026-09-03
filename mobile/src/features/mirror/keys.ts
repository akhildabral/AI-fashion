// Query keys the Mirror adds beyond `qk` (src/lib/query.ts): inspiration
// looks, swap alternatives, the closet match for a look.
export const mk = {
  /** The two looks the stylist last sketched, kept across lens switches. */
  looks: ['looks', 'fresh'] as const,
  /** Looks the member kept. */
  keptLooks: ['looks', 'kept'] as const,
  /** Clean pieces of the same kind, for a swap on the rail. */
  alternatives: (slot: string, exclude: string[]) => ['brief-alternatives', slot, exclude.join(',')] as const,
  /** How an inspiration look maps onto the closet. */
  recreate: (lookId: string) => ['looks', lookId, 'recreate'] as const,
}
