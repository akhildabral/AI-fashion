import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WardrobeItem } from '@prisma/client';
import {
  blackJeans,
  blackPumps,
  blackTank,
  blackTrousers,
  bluePolo,
  greySweatpants,
  rustBlazer,
  whiteSneakers,
} from '../services/__fixtures__/dev-closet';

// The composition flow end to end, with the model replaced by canned
// structured candidates: what kind of day the occasion names, what the
// pre-filter keeps, that a failing first pass is re-prompted exactly once,
// that the least-bad fallback is honest, that the person's own plan gets an
// opinion, and that alternatives and swaps respect the slot.

const mocks = vi.hoisted(() => ({
  suggestOutfits: vi.fn(),
  generateObject: vi.fn(),
  loadStyleableWardrobe: vi.fn(),
  loadRecentWear: vi.fn(async () => []),
  tasteFor: vi.fn(async () => null),
  recordSwap: vi.fn(async () => undefined),
  recordWoreInstead: vi.fn(async () => undefined),
  recordComposed: vi.fn(async () => undefined),
  prisma: {
    styleProfile: { findUnique: vi.fn(async () => null) },
    wardrobeItem: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(async () => 1) },
    dailyBrief: { findUnique: vi.fn(), update: vi.fn(async () => ({})), upsert: vi.fn() },
    wearLog: { findMany: vi.fn(async () => []), create: vi.fn() },
    tasteProfile: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../lib/ai', () => ({ textModel: async () => ({}), aiAbortSignal: () => undefined, aiErrorMessage: (_e: unknown, f: string) => f, AI_TIMEOUT_MS: 1 }));
vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('../lib/wear-rules', () => ({ applyWear: vi.fn(async () => []), washTolerance: () => 1 }));
vi.mock('../services/wardrobe.service', () => ({ suggestOutfits: mocks.suggestOutfits }));
vi.mock('../services/weather.service', () => ({ getTripForecast: vi.fn(async () => ({ location: 'Dev', partial: false, days: [] })), getWeather: vi.fn(async () => ({ location: 'Dev', temperatureC: 18, description: 'clear' })) }));
vi.mock('./trip.controller', () => ({ activeTripFor: vi.fn(async () => null) }));
vi.mock('../services/taste-events', () => ({ recordSwap: mocks.recordSwap, recordWoreInstead: mocks.recordWoreInstead, recordComposed: mocks.recordComposed }));
vi.mock('../services/taste.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/taste.service')>()),
  loadTasteProfile: vi.fn(async () => null),
  recomputeTasteProfileSoon: vi.fn(async () => false),
}));
vi.mock('./wardrobe.controller', () => ({
  loadStyleableWardrobe: mocks.loadStyleableWardrobe,
  loadRecentWear: mocks.loadRecentWear,
  tasteFor: mocks.tasteFor,
  poolSignals: (items: { id: string; category: string }[]) => ({
    wearCounts: new Map<string, number>(),
    pollWins: new Map<string, number>(),
    wearSignals: new Map<string, { passedOver: number; chosenInstead: number }>(),
    hasCleanFootwear: items.some((i) => i.category === 'footwear'),
  }),
}));

import { classifyOccasion, readOccasion, resetOccasionCache } from '../lib/occasion';
import { composeWithRetry, enumerateFromPool, honestRationale, planOpinion, prefilterPool, validateAndRank } from '../services/compose.service';
import { validateOutfit } from '../services/validator.service';
import { briefAlternatives, composeOutfit, judgeOwnPlan, swapBriefItem } from './brief.controller';
import { HttpError } from '../middleware/error';

// Stable uuids so the request schemas accept them.
const UUID = {
  pumps: '11111111-1111-4111-8111-111111111111',
  tank: '22222222-2222-4222-8222-222222222222',
  blazer: '33333333-3333-4333-8333-333333333333',
  trousers: '44444444-4444-4444-8444-444444444444',
  polo: '55555555-5555-4555-8555-555555555555',
  sweatpants: '66666666-6666-4666-8666-666666666666',
  jeans: '77777777-7777-4777-8777-777777777777',
  sneakers: '88888888-8888-4888-8888-888888888888',
};

type Row = WardrobeItem & { wearCount: number; pollWins: number; passedOver: number; chosenInstead: number; closetHasFootwear: boolean };
const row = (p: object, id: string): Row =>
  ({ ...p, id, imageUrl: '', userId: 'u1', wearCount: 0, pollWins: 0, passedOver: 0, chosenInstead: 0, closetHasFootwear: true, secondaryColor: null, occasions: [], weight: null, createdAt: new Date('2026-01-01') }) as unknown as Row;

const pumps = row(blackPumps, UUID.pumps);
const tank = row({ ...blackTank, state: 'in-wash' }, UUID.tank);
const blazer = row(rustBlazer, UUID.blazer);
const trousers = row(blackTrousers, UUID.trousers);
const polo = row(bluePolo, UUID.polo);
const sweatpants = row(greySweatpants, UUID.sweatpants);
const jeans = row(blackJeans, UUID.jeans);
const sneakers = row(whiteSneakers, UUID.sneakers);

/** The dev closet as loadStyleableWardrobe returns it: clean pieces only. */
const closet = [pumps, blazer, trousers, polo, sweatpants, jeans];
const everything = [...closet, tank, sneakers];
const byId = new Map(everything.map((i) => [i.id, i]));

const outfit = (items: Row[], why?: Record<string, string>) => ({ items, rationale: why?.fit ?? '', why: why ?? {} });

beforeEach(() => {
  vi.clearAllMocks();
  resetOccasionCache();
  mocks.loadStyleableWardrobe.mockResolvedValue(closet);
  mocks.prisma.wardrobeItem.findMany.mockImplementation(async (args: { where?: { id?: { in?: string[] } } }) => {
    const ids = args?.where?.id?.in;
    return (ids ? ids.map((id) => byId.get(id)).filter(Boolean) : everything) as Row[];
  });
  mocks.prisma.wardrobeItem.findFirst.mockImplementation(async (args: { where: { id: string } }) => byId.get(args.where.id) ?? null);
});

describe('occasion → kind of day', () => {
  it('reads the occasion by keyword before the weekday', () => {
    expect(classifyOccasion("a friend's wedding reception")).toBe('occasion');
    expect(classifyOccasion('a gym session then coffee')).toBe('athletic');
    expect(classifyOccasion('a client dinner at a fine-dining restaurant')).toBe('evening');
    expect(classifyOccasion('an office day')).toBe('work');
    expect(classifyOccasion('brunch with friends')).toBe('casual');
    expect(classifyOccasion('quarterly numbers with the board')).toBe(null);
  });

  it('asks the model once for an unknown phrase and caches the answer', async () => {
    mocks.generateObject.mockResolvedValue({ object: { eventType: 'work', formalityTarget: 4, notes: 'a boardroom' } });
    const first = await readOccasion('u1', 'quarterly numbers with the board');
    const second = await readOccasion('u1', 'Quarterly numbers with the board');
    expect(first).toMatchObject({ eventType: 'work', formalityTarget: 4, source: 'model' });
    expect(second).toEqual(first);
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    // A keyword phrase never reaches the model.
    await readOccasion('u1', 'a wedding');
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
  });

  it('falls back to null when the model is unavailable, so the weekday decides', async () => {
    mocks.generateObject.mockRejectedValue(new Error('timeout'));
    expect(await readOccasion('u1', 'quarterly numbers with the board')).toBe(null);
  });
});

describe('pre-filter', () => {
  it('keeps a candidate per essential slot even when nothing sits in the band', () => {
    // Athletic target 1: pumps are three steps away, but they are the only shoes.
    const pool = prefilterPool(closet, { eventType: 'athletic', season: 'summer' });
    const ids = pool.map((i) => i.id);
    expect(ids).toContain(UUID.sweatpants);
    expect(ids).toContain(UUID.polo);
    expect(ids).toContain(UUID.pumps);
    // The blazer is a layer three steps off: a layer never relaxes that far.
    expect(ids).not.toContain(UUID.blazer);
  });

  it('drops pieces outside the band when the slot has something in it', () => {
    const pool = prefilterPool(closet, { eventType: 'work', season: 'winter' });
    const ids = pool.map((i) => i.id);
    expect(ids).toContain(UUID.trousers);
    expect(ids).toContain(UUID.blazer);
    expect(ids).toContain(UUID.pumps);
    expect(ids).not.toContain(UUID.sweatpants);
  });

  it('respects the weather for footwear and warmth', () => {
    const hot = { location: 'x', temperatureC: 31, description: 'sunny', highC: 33, lowC: 25 };
    const pool = prefilterPool(closet, { eventType: 'work', weather: hot, season: 'summer' });
    // A wool blazer (warmth 5) is out at 33°; the trousers (4) stay.
    expect(pool.map((i) => i.id)).not.toContain(UUID.blazer);
    expect(pool.map((i) => i.id)).toContain(UUID.trousers);
  });
});

describe('compose with one retry', () => {
  const rank = { eventType: 'work' as const, recentWear: [], hasCleanFootwear: true, season: 'winter' as const };

  it('a violating first pass triggers exactly one re-prompt naming the violations', async () => {
    const suggest = vi
      .fn()
      .mockResolvedValueOnce([outfit([blazer, trousers, pumps])]) // nothing under the blazer
      .mockResolvedValueOnce([outfit([polo, trousers, pumps, blazer], { fit: 'the blazer squares the polo' })]);
    const r = await composeWithRetry(suggest, rank);
    expect(suggest).toHaveBeenCalledTimes(2);
    const constraints = suggest.mock.calls[1][0] as string[];
    expect(constraints.length).toBeGreaterThan(0);
    expect(constraints[0]).toMatch(/^Do not: /);
    expect(constraints[0]).toContain(UUID.blazer);
    expect(r?.verdict.ok).toBe(true);
    expect(r?.passedOn).toBe(2);
    expect(r?.top.items.map((i) => i.id).sort()).toEqual([UUID.polo, UUID.trousers, UUID.pumps, UUID.blazer].sort());
  });

  it('a passing first pass never re-prompts', async () => {
    const suggest = vi.fn().mockResolvedValue([outfit([polo, trousers, pumps, blazer])]);
    const r = await composeWithRetry(suggest, rank);
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(r?.passedOn).toBe(1);
  });

  it('when nothing passes, the least-bad candidate ships with an honest verdict and no praise', async () => {
    // Gym day: the only clean shoes are pumps; every candidate fails on them.
    const suggest = vi
      .fn()
      .mockResolvedValueOnce([outfit([polo, jeans, pumps], { fit: 'Effortlessly chic and perfect for the gym' })])
      .mockResolvedValueOnce([outfit([polo, sweatpants, pumps], { fit: 'A perfect sporty look' })]);
    const r = await composeWithRetry(suggest, { ...rank, eventType: 'athletic' });
    expect(suggest).toHaveBeenCalledTimes(2);
    expect(r?.verdict.ok).toBe(false);
    expect(r?.verdict.violations.map((v) => v.rule)).toContain('shoe-formality');
    // Least-bad: sweatpants (one violation) over jeans+pumps (shoe + formality).
    expect(r?.top.items.map((i) => i.id)).toContain(UUID.sweatpants);
    const line = honestRationale(r!.top.validation, r!.top.items, 'athletic', r!.top.why);
    expect(line).toMatch(/^Nothing clean makes a complete training outfit today: /);
    expect(line).toContain('black pumps are not for an athletic setting');
    expect(line).toMatch(/Here is the closest\.$/);
    expect(line).not.toMatch(/perfect|chic|stunning/i);
  });

  it('when the model fails twice, the pairer enumerates a passing outfit from the pool before least-bad', async () => {
    const suggest = vi.fn().mockResolvedValue([outfit([blazer, trousers, pumps])]); // no base, twice
    const r = await composeWithRetry(suggest, rank, { fallback: () => enumerateFromPool(closet, { eventType: 'work', season: 'winter' }) });
    expect(suggest).toHaveBeenCalledTimes(2);
    expect(r?.passedOn).toBe(3);
    expect(r?.verdict.ok).toBe(true);
    expect(r?.top.items.map((i) => i.id)).toContain(UUID.polo);
  });

  it('never hands back a set already shown when anything else remains', async () => {
    const shown = [UUID.polo, UUID.trousers, UUID.pumps, UUID.blazer];
    const suggest = vi.fn().mockResolvedValue([outfit([polo, trousers, pumps, blazer]), outfit([polo, jeans, pumps])]);
    const r = await composeWithRetry(suggest, { ...rank, eventType: 'casual' }, { exclude: [shown] });
    expect(r?.top.items.map((i) => i.id)).not.toEqual(expect.arrayContaining([UUID.blazer]));
  });
});

describe('composeOutfit', () => {
  it('attaches a verdict and an honest rationale to the brief payload', async () => {
    mocks.suggestOutfits
      .mockResolvedValueOnce([outfit([polo, jeans, pumps], { fit: 'Effortlessly chic' })])
      .mockResolvedValueOnce([outfit([polo, sweatpants, pumps])]);
    const payload = await composeOutfit('u1', 'athletic', 'a gym session then coffee', '2026-09-05');
    expect(payload).not.toBeNull();
    expect(payload!.verdict?.ok).toBe(false);
    expect(payload!.rationale).toMatch(/^Nothing clean makes a complete training outfit today/);
    expect(payload!.rationale).not.toMatch(/chic/i);
    expect(mocks.suggestOutfits).toHaveBeenCalledTimes(2);
    // The second call carries the constraints.
    const opts = mocks.suggestOutfits.mock.calls[1][3] as { constraints: string[] };
    expect(opts.constraints[0]).toMatch(/^Do not: /);
  });

  it('a passing candidate carries verdict.ok with its warnings and a rationale that does not contradict them', async () => {
    mocks.suggestOutfits.mockResolvedValueOnce([outfit([polo, trousers, pumps, blazer], { fit: 'The blazer squares the polo.', formality: 'Perfectly office-ready.' })]);
    const payload = await composeOutfit('u1', 'work', null, '2026-09-05');
    expect(payload!.verdict?.ok).toBe(true);
    expect(payload!.rationale).toMatch(/^The blazer squares the polo\./);
    expect(payload!.rationale.split(/\s+/).length).toBeLessThanOrEqual(22);
    expect(mocks.suggestOutfits).toHaveBeenCalledTimes(1);
    // Passing the occasion-derived count: work asks for four candidates.
    expect(mocks.suggestOutfits.mock.calls[0][2]).toBe(4);
  });
});

describe("the person's own plan", () => {
  it('sweatpants + blazer + pumps for work gets an opinion, not a rationalisation', async () => {
    const { verdict, opinion } = await judgeOwnPlan('u1', [UUID.sweatpants, UUID.blazer, UUID.pumps], 'work', null, '2026-09-08');
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(['completeness', 'shoe-formality']));
    expect(opinion).toMatch(/pumps/);
    expect(opinion).toMatch(/Want me to (swap|add|rework)/);
    expect(opinion).not.toMatch(/keep it as it is/);
  });

  it('a clean plan is left alone in one line', () => {
    const v = validateOutfit([polo, trousers, pumps, blazer], { eventType: 'work' });
    expect(v.ok).toBe(true);
    expect(planOpinion(v, [polo, trousers, pumps, blazer], 'work')).toMatch(/^Your own choice, laid out ahead\./);
  });

  it('a pinned pump for the gym gets an honest verdict', () => {
    const ranked = validateAndRank([outfit([polo, sweatpants, pumps])], { eventType: 'athletic', recentWear: [], hasCleanFootwear: true });
    expect(ranked[0].validation.ok).toBe(false);
    expect(planOpinion(ranked[0].validation, ranked[0].items, 'athletic')).toMatch(/pumps are not for training/);
  });
});

function call(handler: (req: never, res: never) => Promise<unknown>, req: object) {
  const json = vi.fn();
  const res = { json, status: vi.fn(() => ({ json })) };
  return handler({ user: { id: 'u1' }, ...req } as never, res as never).then(() => json.mock.calls[0]?.[0]);
}

describe('alternatives', () => {
  it('are the same role as the current piece, clean, and ranked by how they sit with the rest', async () => {
    // Replacing the trousers in polo + trousers + pumps + blazer.
    const out = await call(briefAlternatives, {
      query: { slot: 'bottom', current: UUID.trousers, exclude: [UUID.polo, UUID.trousers, UUID.pumps, UUID.blazer].join(',') },
    });
    expect(out.role).toBe('bottom');
    const ids = out.alternatives.map((a: { id: string }) => a.id);
    expect(ids).not.toContain(UUID.trousers);
    expect(ids).not.toContain(UUID.polo);
    expect(ids).not.toContain(UUID.pumps);
    expect(ids.every((id: string) => [UUID.jeans, UUID.sweatpants].includes(id))).toBe(true);
    // Jeans sit with pumps better than sweatpants do.
    expect(ids[0]).toBe(UUID.jeans);
    expect(out.alternatives[0].pairScore).toBeGreaterThanOrEqual(out.alternatives[1].pairScore);
  });

  it('a blazer misfiled as a top is still offered as a mid layer, never as a base', async () => {
    const out = await call(briefAlternatives, { query: { slot: 'top', current: UUID.polo, exclude: [UUID.polo, UUID.trousers, UUID.pumps].join(',') } });
    expect(out.role).toBe('base');
    expect(out.alternatives.map((a: { id: string }) => a.id)).not.toContain(UUID.blazer);
  });
});

describe('swap', () => {
  const day = (itemIds: string[]) => ({
    id: 'd1',
    wornLogId: null,
    payload: { title: 'x', rationale: 'r', itemIds, eventType: 'work', occasion: null, weather: null, trip: null },
  });

  it('refuses a piece from another slot', async () => {
    mocks.prisma.dailyBrief.findUnique.mockResolvedValue(day([UUID.polo, UUID.trousers, UUID.pumps]));
    await expect(call(swapBriefItem, { body: { date: '2026-09-05', outId: UUID.trousers, inId: UUID.blazer } })).rejects.toBeInstanceOf(HttpError);
    expect(mocks.recordSwap).not.toHaveBeenCalled();
  });

  it('refuses a piece that is not clean', async () => {
    mocks.prisma.dailyBrief.findUnique.mockResolvedValue(day([UUID.polo, UUID.trousers, UUID.pumps]));
    await expect(call(swapBriefItem, { body: { date: '2026-09-05', outId: UUID.polo, inId: UUID.tank } })).rejects.toThrow(/not clean/);
  });

  it('re-validates the new set, stores the verdict and records the swap', async () => {
    mocks.prisma.dailyBrief.findUnique.mockResolvedValue(day([UUID.polo, UUID.trousers, UUID.pumps]));
    const out = await call(swapBriefItem, { body: { date: '2026-09-05', outId: UUID.trousers, inId: UUID.sweatpants } });
    expect(out.brief.itemIds).toEqual([UUID.polo, UUID.sweatpants, UUID.pumps]);
    expect(out.verdict.ok).toBe(false);
    expect(out.verdict.violations.map((v: { rule: string }) => v.rule)).toContain('shoe-formality');
    expect(out.brief.rationale).toMatch(/pumps/);
    const stored = mocks.prisma.dailyBrief.update.mock.calls[0][0].data.payload;
    expect(stored.verdict.ok).toBe(false);
    expect(mocks.recordSwap).toHaveBeenCalledWith('u1', expect.objectContaining({ outId: UUID.trousers, inId: UUID.sweatpants, slot: 'bottom', itemIds: [UUID.polo, UUID.trousers, UUID.pumps] }));
  });
});
