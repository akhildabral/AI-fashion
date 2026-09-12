import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Fitting Room's backend fixes: re-keeping never wipes store or price,
// "Bought it" carries the shop price and source into the closet and clears
// the nudge, the nudge is a choice, the wishlist helps the Closet's gaps and
// never the styleable pool, measurements are validated, and a candidate's
// try-on needs a reflection.

const mocks = vi.hoisted(() => ({
  prisma: {
    styleProfile: { findUnique: vi.fn(async () => null), upsert: vi.fn(async (args: unknown) => args) },
    wardrobeItem: { findMany: vi.fn(async () => []), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })), count: vi.fn(async () => 1) },
    wearLog: { findMany: vi.fn(async () => []) },
    poll: { findMany: vi.fn(async () => []) },
    tryOn: { findMany: vi.fn(async () => []), findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    usageEvent: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../lib/jobs', () => ({ enqueue: vi.fn() }));
vi.mock('../lib/push', () => ({ sendPush: vi.fn(), sendNativeEvent: vi.fn() }));
vi.mock('../lib/storage', () => ({ deleteFile: vi.fn(), keyFromStored: (s: string) => s, mimeForKey: () => 'image/png', readStored: vi.fn(), saveImageBuffer: vi.fn() }));
vi.mock('../services/wardrobe.service', () => ({
  detectGarments: vi.fn(),
  catalogTags: vi.fn(),
  deriveReasoningAttributes: () => ({ layerRole: 'base', warmthValue: 1, formalityScore: 2 }),
  draftResaleListing: vi.fn(),
  suggestOutfits: vi.fn(),
  withColourAttributes: (i: unknown) => i,
}));
vi.mock('../services/cleanup.service', () => ({ generativeCleanupAvailable: () => false, matteGarment: vi.fn(), studioRender: vi.fn() }));
vi.mock('../services/closet-match.service', () => ({ fingerprintOf: vi.fn(), matchPiece: vi.fn(), SURE_AT: 1 }));
vi.mock('../services/tryon.service', () => ({ defaultTryOnMode: () => 'text', generateTryOn: vi.fn(), renderOutfit: vi.fn() }));
vi.mock('../services/weather.service', () => ({ getTripForecast: vi.fn(), getWeather: vi.fn() }));
vi.mock('../services/taste.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/taste.service')>()),
  loadTasteProfile: vi.fn(async () => null),
}));

import { loadStyleableWardrobe, nudgeDate, updateData, updateItem } from './wardrobe.controller';
import { closetGaps } from './ritual.controller';
import { measurementsSchema, updateMyProfile } from './profile.controller';
import { createCandidateTryOn } from './tryon.controller';
import { HttpError } from '../middleware/error';
import { closetGapsFor, formalityBandFor, ghostPiece, occasionPhrase, type PairingPiece } from '../services/pairing.service';

type Res = { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; body?: unknown; code?: number };
function res(): Res {
  const r: Res = { status: vi.fn(), json: vi.fn() };
  r.status.mockImplementation((c: number) => ((r.code = c), r));
  r.json.mockImplementation((b: unknown) => ((r.body = b), r));
  return r;
}
const user = { id: 'u1', role: 'member', plan: 'free' };
const NOW = new Date('2026-09-12T10:00:00Z');

const existing = { owned: false, price: null, seenPrice: 1999, listPrice: 2999, salePrice: 2499 };

describe('updateData (PATCH /wardrobe/:id)', () => {
  it('never writes store or seenPrice when the body omits them; an explicit null clears', () => {
    expect(updateData({ owned: false }, existing, NOW)).toEqual({ owned: false });
    expect(updateData({}, existing, NOW)).toEqual({});
    expect(updateData({ owned: false, store: null, seenPrice: null }, existing, NOW)).toEqual({ owned: false, store: null, seenPrice: null });
    expect(updateData({ store: 'Zara, Palladium' }, existing, NOW)).toEqual({ store: 'Zara, Palladium' });
  });

  it('"Bought it" copies sale ?? list ?? seen into price, keeps the source and try-on untouched, clears the nudge', () => {
    const out = updateData({ owned: true }, existing, NOW);
    expect(out).toEqual({ owned: true, price: 2499, nudgeAt: null });
    expect(updateData({ owned: true }, { ...existing, salePrice: null }, NOW).price).toBe(2999);
    expect(updateData({ owned: true }, { ...existing, salePrice: null, listPrice: null }, NOW).price).toBe(1999);
    // Nothing the shop said is touched: no sourceUrl/retailer/productName/chosenSize/tryOnUrl key is written.
    for (const k of ['sourceUrl', 'retailer', 'productName', 'chosenSize', 'tryOnUrl', 'store', 'seenPrice']) expect(out).not.toHaveProperty(k);
    // A price they typed wins over the shop's.
    expect(updateData({ owned: true, price: 1500 }, existing, NOW).price).toBe(1500);
    // A price already on the ledger stays.
    expect(updateData({ owned: true }, { ...existing, price: 1200 }, NOW).price).toBeUndefined();
    // Already owned: nothing copies, nothing clears.
    expect(updateData({ owned: true }, { ...existing, owned: true }, NOW)).toEqual({ owned: true });
  });

  it('nudgeIn is a choice: a fortnight, a month, or never; nudgeAt takes a date or null', () => {
    expect(nudgeDate('fortnight', NOW)).toEqual(new Date('2026-09-26T10:00:00Z'));
    expect(nudgeDate('month', NOW)).toEqual(new Date('2026-10-12T10:00:00Z'));
    expect(nudgeDate('never', NOW)).toBeNull();
    expect(updateData({ nudgeIn: 'fortnight' }, existing, NOW)).toEqual({ nudgeAt: new Date('2026-09-26T10:00:00Z') });
    expect(updateData({ nudgeIn: 'never' }, existing, NOW)).toEqual({ nudgeAt: null });
    expect(updateData({ nudgeAt: null }, existing, NOW)).toEqual({ nudgeAt: null });
    const when = new Date('2026-12-01T00:00:00Z');
    expect(updateData({ nudgeAt: when }, existing, NOW)).toEqual({ nudgeAt: when });
    expect(updateData({ gapOptOut: true }, existing, NOW)).toEqual({ gapOptOut: true });
  });

  it('the handler accepts nudgeIn and gapOptOut and writes only what was sent', async () => {
    mocks.prisma.wardrobeItem.findFirst.mockResolvedValueOnce({ attrConfidence: null, category: 'top', subtype: 't-shirt', material: null, formality: null, shoeType: null, ...existing });
    mocks.prisma.wardrobeItem.findUnique.mockResolvedValueOnce({ id: 'w1' });
    const r = res();
    await updateItem({ user, params: { id: 'w1' }, body: { nudgeIn: 'month', gapOptOut: true } } as never, r as never);
    const call = mocks.prisma.wardrobeItem.update.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(call.data.gapOptOut).toBe(true);
    expect(call.data.nudgeAt).toBeInstanceOf(Date);
    expect(call.data).not.toHaveProperty('nudgeIn');
    expect(call.data).not.toHaveProperty('store');
    expect(call.data).not.toHaveProperty('seenPrice');
    expect(call.data).not.toHaveProperty('owned');
    expect((call.data.attrConfidence as Record<string, number>).gapOptOut).toBe(1);
    expect(call.data.attrConfidence).not.toHaveProperty('nudgeIn');
    expect(r.body).toEqual({ item: { id: 'w1' } });
  });
});

describe('the wishlist and the pools', () => {
  beforeEach(() => {
    mocks.prisma.wardrobeItem.findMany.mockReset();
    mocks.prisma.wardrobeItem.findMany.mockResolvedValue([]);
  });

  it('loadStyleableWardrobe only ever asks for owned pieces', async () => {
    await loadStyleableWardrobe('u1').catch(() => undefined);
    const where = (mocks.prisma.wardrobeItem.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.owned).toBe(true);
  });

  it('closetGaps reads the owned closet and hands the wishlist (opted in, ready) to the ghost simulation', async () => {
    const r = res();
    await closetGaps({ user } as never, r as never);
    const calls = mocks.prisma.wardrobeItem.findMany.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);
    expect(calls[0]).toMatchObject({ owned: true, status: 'ready', state: 'clean' });
    expect(calls[1]).toMatchObject({ owned: false, gapOptOut: false, status: 'ready', suppressed: false });
    const body = r.body as { suggestions: { wishlistItemId?: string }[]; outfitsPossible: number };
    expect(body.outfitsPossible).toBe(0);
    expect(body.suggestions.every((s) => !s.wishlistItemId)).toBe(true);
  });
});

let seq = 0;
function piece(p: Partial<PairingPiece> & { category: string }): PairingPiece {
  return { id: `p-${++seq}`, subtype: null, primaryColor: 'black', pattern: 'solid', formalityScore: 2, warmthValue: 2, layerRole: null, colorPalette: null, state: 'clean', imageUrl: '', status: 'ready', suppressed: false, owned: true, twinOfId: null, twinResolvedAt: null, season: [], cutFor: 'unisex', ...p };
}

describe('closetGapsFor with the wishlist', () => {
  const tee = (extra: Partial<PairingPiece> = {}) => piece({ category: 'top', subtype: 't-shirt', warmthValue: 1, primaryColor: 'white', ...extra });
  const closet = [tee(), tee({ primaryColor: 'navy' }), tee({ primaryColor: 'grey' }), piece({ category: 'footwear', subtype: 'sneakers', primaryColor: 'white' })];

  it('a real wishlist piece that fills the gap replaces the plain ghost and says so', () => {
    const wanted = piece({ id: 'wish-1', category: 'bottom', subtype: 'jeans', primaryColor: 'navy', warmthValue: 3, owned: false });
    const plain = closetGapsFor(closet);
    const withWish = closetGapsFor(closet, { wishlist: [wanted] });
    expect(plain.suggestions[0].category).toBe('bottom');
    expect(plain.suggestions[0].wishlistItemId).toBeUndefined();
    const hit = withWish.suggestions.find((s) => s.wishlistItemId === 'wish-1');
    expect(hit).toBeDefined();
    expect(hit!.wanted).toBe('the navy jeans in your wishlist');
    expect(hit!.unlocks).toBeGreaterThan(0);
    expect(hit!.category).toBe('bottom');
    expect(hit!.formality).toBe(2);
    // Same kind and band as the ghost it beat: one suggestion for that slot, the real one.
    expect(withWish.suggestions.filter((s) => s.category === 'bottom' && s.formality === 2)).toHaveLength(1);
    expect(withWish.outfitsPossible).toBe(plain.outfitsPossible);
  });

  it('ignores wishlist pieces that are owned, still processing, suppressed, or unlock nothing', () => {
    const owned = piece({ id: 'o', category: 'bottom', subtype: 'jeans', primaryColor: 'navy', warmthValue: 3, owned: true });
    const processing = piece({ id: 'p', category: 'bottom', subtype: 'jeans', primaryColor: 'navy', warmthValue: 3, owned: false, status: 'processing' });
    const suppressed = piece({ id: 's', category: 'bottom', subtype: 'jeans', primaryColor: 'navy', warmthValue: 3, owned: false, suppressed: true });
    const useless = piece({ id: 'x', category: 'top', subtype: 'blouse', primaryColor: 'red', owned: false, cutFor: 'womens' });
    const { suggestions } = closetGapsFor(closet, { wishlist: [owned, processing, suppressed, useless] });
    expect(suggestions.every((s) => !s.wishlistItemId)).toBe(true);
  });
});

describe('occasion-first gaps', () => {
  const tee = (extra: Partial<PairingPiece> = {}) => piece({ category: 'top', subtype: 't-shirt', warmthValue: 1, primaryColor: 'white', ...extra });
  const shirt = (extra: Partial<PairingPiece> = {}) => piece({ category: 'top', subtype: 'shirt', formalityScore: 4, warmthValue: 1, primaryColor: 'white', ...extra });
  // A casual closet with two dressy tops and dressy shoes but no dressy bottom.
  const closet = [
    tee(),
    tee({ primaryColor: 'navy' }),
    piece({ category: 'bottom', subtype: 'jeans', primaryColor: 'navy', warmthValue: 3 }),
    piece({ category: 'footwear', subtype: 'sneakers', primaryColor: 'white' }),
    shirt(),
    shirt({ primaryColor: 'black' }),
    piece({ category: 'footwear', subtype: 'oxford shoes', formalityScore: 4, primaryColor: 'black' }),
  ];

  it('the band follows the kind of day: an occasion simulates only the dressy bands', () => {
    expect(formalityBandFor('occasion')).toEqual([4, 5]);
    expect(formalityBandFor('work')).toEqual([3, 4, 5]);
    expect(formalityBandFor('casual')).toEqual([1, 2, 3]);
    expect(formalityBandFor('athletic')).toEqual([1, 2]);
  });

  it('restricts the simulation to the event type: validated for it, within its band, phrased for it', () => {
    const plain = closetGapsFor(closet);
    const forWork = closetGapsFor(closet, { eventType: 'work', occasion: 'a client meeting' });
    expect(forWork.suggestions.length).toBeGreaterThan(0);
    for (const s of forWork.suggestions) {
      expect([3, 4, 5]).toContain(s.formality);
      expect(s.unlocks).toBeGreaterThan(0);
      expect(s.wanted).toMatch(/^a \w+ (smart-casual|business|formal) .+ would give you \d+ outfits? for the client meeting$/);
    }
    // The missing piece for work is a dressier bottom: the shirts and oxfords are waiting on it.
    expect(forWork.suggestions[0].category).toBe('bottom');
    // Without an occasion the answer is as before: the casual band is in play and the wanted is a noun, not a sentence.
    expect(plain.suggestions[0].formality).toBe(2);
    expect(plain.suggestions[0].wanted).toMatch(/^a \w+ /);
    expect(plain.suggestions[0].wanted).not.toMatch(/would give you/);
  });

  it('a casual closet makes nothing for the occasion band and every suggestion sits in it', () => {
    const casual = [tee(), tee({ primaryColor: 'navy' }), piece({ category: 'bottom', subtype: 'jeans', primaryColor: 'navy', warmthValue: 3 }), piece({ category: 'footwear', subtype: 'sneakers', primaryColor: 'white' })];
    const r = closetGapsFor(casual, { eventType: 'occasion', occasion: 'a wedding reception' });
    expect(r.outfitsPossible).toBe(0);
    for (const s of r.suggestions) expect([4, 5]).toContain(s.formality);
    for (const s of r.suggestions) expect(s.wanted).toMatch(/for the wedding reception$/);
  });

  it('the wishlist comes first: a real piece that unlocks as much as the plain ghost is the suggestion, ahead of it', () => {
    // The same piece as the best plain ghost, but real and in the wishlist.
    const wanted: PairingPiece = { ...ghostPiece({ slot: 'bottom', colour: 'black', formality: 3, cutFor: 'unisex' }), id: 'wish-chinos', owned: false, status: 'ready', suppressed: false };
    const plain = closetGapsFor(closet, { eventType: 'work' });
    const withWish = closetGapsFor(closet, { eventType: 'work', occasion: 'the office', wishlist: [wanted] });
    const best = plain.suggestions[0];
    expect(best).toMatchObject({ category: 'bottom', formality: 3 });
    const hit = withWish.suggestions.find((s) => s.wishlistItemId === 'wish-chinos');
    expect(hit).toBeDefined();
    expect(hit!.unlocks).toBe(best.unlocks);
    expect(withWish.suggestions[0].wishlistItemId).toBe('wish-chinos');
    expect(hit!.wanted).toBe(`the black chinos in your wishlist would give you ${hit!.unlocks} outfits for the office`);
    // One suggestion for that slot and band, and it is the real one, not the ghost.
    expect(withWish.suggestions.filter((s) => s.category === 'bottom' && s.formality === 3)).toHaveLength(1);
  });

  it('phrases the occasion after "for"', () => {
    expect(occasionPhrase('a wedding reception')).toBe('the wedding reception');
    expect(occasionPhrase('An interview!')).toBe('the interview');
    expect(occasionPhrase('my sister’s graduation')).toBe('my sister’s graduation');
    expect(occasionPhrase('tonight')).toBe('tonight');
    expect(occasionPhrase('', 'casual')).toBe('the weekend');
    expect(occasionPhrase('Work', 'work')).toBe('work');
    expect(occasionPhrase(null, 'occasion')).toBe('the occasion');
  });

  it('GET /stats/gaps?occasion= classifies the day and answers with the event, the phrase and what the closet can make', async () => {
    mocks.prisma.wardrobeItem.findMany.mockReset();
    mocks.prisma.wardrobeItem.findMany.mockResolvedValue([]);
    const r = res();
    await closetGaps({ user, query: { occasion: 'a wedding reception' } } as never, r as never);
    expect(r.body).toMatchObject({ eventType: 'occasion', occasion: 'the wedding reception', canMake: 0 });
    expect((r.body as { suggestions: { formality: number }[] }).suggestions.every((s) => s.formality >= 4)).toBe(true);
    const typed = res();
    await closetGaps({ user, query: { eventType: 'work', occasion: 'Work' } } as never, typed as never);
    expect(typed.body).toMatchObject({ eventType: 'work', occasion: 'work', canMake: 0 });
    // No occasion: the answer keeps its old shape.
    const plain = res();
    await closetGaps({ user, query: {} } as never, plain as never);
    expect(plain.body).toMatchObject({ outfitsPossible: 0 });
    expect(plain.body).not.toHaveProperty('eventType');
    expect(plain.body).not.toHaveProperty('canMake');
  });
});

describe('measurements (PATCH /profile)', () => {
  it('accepts a sane set in cm or inches, all optional', () => {
    expect(measurementsSchema.parse({ unit: 'cm', chest: 96, waist: 82, preferredFit: 'slim' })).toEqual({ unit: 'cm', chest: 96, waist: 82, preferredFit: 'slim' });
    expect(measurementsSchema.parse({ unit: 'in', inseam: 32 })).toEqual({ unit: 'in', inseam: 32 });
    expect(measurementsSchema.parse({ unit: 'cm' })).toEqual({ unit: 'cm' });
  });

  it('rejects out-of-range numbers per unit, a bad unit, a bad fit', () => {
    expect(measurementsSchema.safeParse({ unit: 'cm', chest: 400 }).success).toBe(false);
    expect(measurementsSchema.safeParse({ unit: 'cm', inseam: 10 }).success).toBe(false);
    expect(measurementsSchema.safeParse({ unit: 'in', chest: 96 }).success).toBe(false);
    expect(measurementsSchema.safeParse({ unit: 'mm', chest: 96 }).success).toBe(false);
    expect(measurementsSchema.safeParse({ unit: 'cm', preferredFit: 'baggy' }).success).toBe(false);
    expect(measurementsSchema.safeParse({ chest: 96 }).success).toBe(false);
  });

  it('the profile handler writes measurements, or clears them with null, and leaves them alone when omitted', async () => {
    const r = res();
    await updateMyProfile({ user, body: { measurements: { unit: 'cm', waist: 80 } } } as never, r as never);
    let call = mocks.prisma.styleProfile.upsert.mock.calls.at(-1)![0] as { update: Record<string, unknown> };
    expect(call.update.measurements).toEqual({ unit: 'cm', waist: 80 });

    await updateMyProfile({ user, body: { measurements: null } } as never, res() as never);
    call = mocks.prisma.styleProfile.upsert.mock.calls.at(-1)![0] as { update: Record<string, unknown> };
    expect(call.update.measurements).toBeDefined();
    expect(call.update.measurements).not.toEqual(expect.objectContaining({ unit: expect.anything() }));

    await updateMyProfile({ user, body: { city: 'Mumbai' } } as never, res() as never);
    call = mocks.prisma.styleProfile.upsert.mock.calls.at(-1)![0] as { update: Record<string, unknown> };
    expect(call.update).not.toHaveProperty('measurements');
  });
});

describe('POST /wardrobe/:id/tryon (a candidate on the reflection)', () => {
  it('needs a reflection: 400 with reason no-reflection, and gives the reserved render back', async () => {
    mocks.prisma.wardrobeItem.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'ready' });
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ photoPath: null });
    const req = { user, params: { id: 'c1' }, body: {}, usageEventId: 'ue1' };
    await expect(createCandidateTryOn(req as never, res() as never)).rejects.toMatchObject({ status: 400, message: 'Add your reflection first', extra: { reason: 'no-reflection' } });
    expect(mocks.prisma.usageEvent.deleteMany).toHaveBeenCalledWith({ where: { id: 'ue1' } });
  });

  it('queues the candidate alone, and a candidate is allowed through the owned filter', async () => {
    mocks.prisma.wardrobeItem.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'ready' });
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ photoPath: 'p.jpg' }).mockResolvedValueOnce({ photoPath: 'p.jpg' });
    mocks.prisma.wardrobeItem.findMany.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([{ id: 'c1', imageUrl: '', category: 'top', subtype: null }]);
    mocks.prisma.tryOn.findFirst.mockResolvedValueOnce(null);
    mocks.prisma.tryOn.create.mockResolvedValueOnce({ id: 't1', itemIds: ['c1'], status: 'queued', imageUrl: '' });
    const r = res();
    await createCandidateTryOn({ user, params: { id: 'c1' }, body: { fresh: true }, usageEventId: 'ue2' } as never, r as never);
    expect(r.code).toBe(202);
    const created = mocks.prisma.tryOn.create.mock.calls[0][0] as { data: { itemIds: string[]; usageEventId: string } };
    expect(created.data.itemIds).toEqual(['c1']);
    expect(created.data.usageEventId).toBe('ue2');
    // The lookup that admits pieces to a render filters by owner only, never by `owned`.
    const wheres = mocks.prisma.wardrobeItem.findMany.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);
    const admit = wheres.find((w) => w.id && typeof w.id === 'object' && 'in' in (w.id as object));
    expect(admit).toBeDefined();
    expect(admit).not.toHaveProperty('owned');
  });

  it('the error body carries the reason for the page', () => {
    const e = new HttpError(400, 'Add your reflection first', { reason: 'no-reflection' });
    expect(e.extra).toEqual({ reason: 'no-reflection' });
  });
});
