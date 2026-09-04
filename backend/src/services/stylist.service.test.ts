import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WardrobeItem } from '@prisma/client';
import { blackJeans, blackPumps, bluePolo, greySweatpants, rustBlazer, whiteSneakers } from './__fixtures__/dev-closet';

// Closet-aware generated looks, with the model replaced by canned looks:
// owned ids are honoured and described in the catalogue's words, anything
// the closet cannot supply is marked wanted with its slot, a hallucinated id
// is a wanted piece, and an owned-only look that breaks the rules is rebuilt
// from the pool or dropped.

const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }));

vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('../lib/ai', () => ({ textModel: async () => ({}), aiAbortSignal: () => undefined, aiErrorMessage: (_e: unknown, f: string) => f }));
vi.mock('../lib/imagegen', () => ({ generateImage: vi.fn(async () => null) }));
vi.mock('../lib/storage', () => ({ saveImageBuffer: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: {} }));
vi.mock('../config/env', () => ({ env: { LOOKS_PER_REQUEST: 2 } }));

import { generateLooks, resolveClosetLooks, wantedPhraseOf, type OutfitPlan } from './stylist.service';
import type { CatalogItem } from './wardrobe.service';

const row = (p: object): CatalogItem =>
  ({ ...p, userId: 'u1', secondaryColor: null, occasions: [], weight: null, renderNotes: null, description: null, createdAt: new Date('2026-01-01') }) as unknown as CatalogItem;

const polo = row(bluePolo);
const jeans = row(blackJeans);
const sneakers = row(whiteSneakers);
const pumps = row(blackPumps);
const sweatpants = row(greySweatpants);
const blazer = row(rustBlazer);
const pool = [polo, jeans, sneakers, pumps, sweatpants, blazer];
const closet = { closet: pool, eventType: 'casual' as const, season: 'spring' as const };

type Piece = OutfitPlan['pieces'][number] & { ownedId: string | null };
const piece = (category: Piece['category'], subtype: string, color: string, ownedId: string | null, material: string | null = null): Piece => ({
  category, subtype, color, material, pattern: 'solid', render: `${color} ${subtype}`, ownedId,
});
const plan = (title: string, pieces: Piece[]): OutfitPlan => ({
  title,
  pieces,
  items: { top: '', bottom: '', outerwear: '', footwear: '', accessories: [] },
  palette: [],
  rationale: 'Because.',
  imagePrompt: 'a model',
});

beforeEach(() => vi.clearAllMocks());

describe('closet-aware looks', () => {
  it('honours owned ids and describes them in the catalogue\'s words', () => {
    const [look] = resolveClosetLooks([plan('Blue and black', [piece('top', 'polo', 'navy', polo.id), piece('bottom', 'jeans', 'black', jeans.id), piece('footwear', 'sneakers', 'white', sneakers.id)])], closet);
    expect(look.ownedItemIds).toEqual([polo.id, jeans.id, sneakers.id]);
    expect(look.wanted).toEqual([]);
    expect(look.plan.pieces[0]).toMatchObject({ subtype: 'polo shirt', color: 'blue' });
    expect(look.verdict).toMatchObject({ ok: true });
  });

  it('marks what the closet cannot supply as wanted, with its slot', () => {
    const [look] = resolveClosetLooks([plan('Cream and denim', [piece('top', 'silk blouse', 'cream', null, 'silk'), piece('bottom', 'jeans', 'black', jeans.id), piece('footwear', 'sneakers', 'white', sneakers.id)])], closet);
    expect(look.ownedItemIds).toEqual([jeans.id, sneakers.id]);
    expect(look.wanted).toEqual([{ wanted: 'a cream silk blouse', slot: 'base' }]);
    expect(look.verdict?.ok).toBe(true);
  });

  it('treats a hallucinated id, or an id used twice, as a wanted piece', () => {
    const [look] = resolveClosetLooks([plan('Ghost', [piece('top', 'tee', 'white', 'not-a-real-id'), piece('bottom', 'jeans', 'black', jeans.id), piece('footwear', 'sneakers', 'white', jeans.id)])], closet);
    expect(look.ownedItemIds).toEqual([jeans.id]);
    expect(look.wanted.map((w) => w.slot)).toEqual(['base', 'footwear']);
  });

  it('rebuilds an owned-only look that breaks the rules from the pool, pinned to its first piece', () => {
    const [look] = resolveClosetLooks([plan('Pumps and sweats', [piece('footwear', 'pumps', 'black', pumps.id), piece('bottom', 'sweatpants', 'grey', sweatpants.id)])], closet);
    expect(look).toBeDefined();
    expect(look.ownedItemIds).toContain(pumps.id);
    expect(look.ownedItemIds.length).toBeGreaterThanOrEqual(3);
    expect(look.verdict?.ok).toBe(true);
    expect(look.wanted).toEqual([]);
  });

  it('drops an owned-only look that fails when the pool cannot fix it', () => {
    const noTops = { ...closet, closet: [pumps, sweatpants, jeans, sneakers] };
    const out = resolveClosetLooks([plan('Pumps and sweats', [piece('footwear', 'pumps', 'black', pumps.id), piece('bottom', 'sweatpants', 'grey', sweatpants.id)])], noTops);
    expect(out).toEqual([]);
  });

  it('generateLooks carries ownedItemIds, wanted and verdict, and drops the failing look', async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        looks: [
          { ...plan('Good', [piece('top', 'polo', 'blue', polo.id), piece('bottom', 'jeans', 'black', jeans.id), piece('footwear', 'sneakers', 'white', sneakers.id)]) },
          { ...plan('Bad', [piece('footwear', 'pumps', 'black', pumps.id), piece('bottom', 'sweatpants', 'grey', sweatpants.id)]) },
        ],
      },
    });
    const looks = await generateLooks('brunch', 'unisex', null, { ...closet, closet: [polo, jeans, sneakers, pumps, sweatpants] });
    // The bad look is pinned to the pumps and rebuilt around them; both survive.
    expect(looks).toHaveLength(2);
    expect(looks[0]).toMatchObject({ ownedItemIds: [polo.id, jeans.id, sneakers.id], wanted: [], verdict: { ok: true } });
    expect(looks[1].ownedItemIds).toContain(pumps.id);
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    const call = mocks.generateObject.mock.calls[0][0] as { prompt: string; instructions: string };
    expect(call.prompt).toContain(`id=${polo.id}`);
    expect(call.instructions).toContain('Hard rules');
  });

  it('the profile-only path carries empty closet fields and no verdict', async () => {
    mocks.generateObject.mockResolvedValue({ object: { looks: [{ ...plan('Solo', [piece('top', 'tee', 'white', null)]) }] } });
    const looks = await generateLooks('brunch', 'unisex', null);
    expect(looks[0]).toMatchObject({ ownedItemIds: [], wanted: [], verdict: null });
    expect((looks[0].outfit.pieces[0] as { ownedId?: unknown }).ownedId).toBeUndefined();
    const call = mocks.generateObject.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).not.toContain('Wardrobe catalogue');
  });

  it('phrases a wanted piece with an article', () => {
    expect(wantedPhraseOf({ color: 'olive', material: null, subtype: 'field jacket' })).toBe('an olive field jacket');
    expect(wantedPhraseOf({ color: 'Cream', material: 'silk', subtype: 'blouse' })).toBe('a cream silk blouse');
  });
});
