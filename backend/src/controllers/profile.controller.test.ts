import { beforeEach, describe, expect, it, vi } from 'vitest';

// PATCH /api/profile with fit references: validated against the brand table
// for the member's gender, merged with the manual numbers on file, and the
// inferred range recomputed. GET /api/profile/fit-brands lists the chips.

const mocks = vi.hoisted(() => ({
  prisma: {
    styleProfile: { findUnique: vi.fn(async () => null as unknown), upsert: vi.fn(async (args: unknown) => args) },
  },
}));
vi.mock('../lib/prisma', () => ({ prisma: mocks.prisma }));

import { getFitBrands, updateMyProfile } from './profile.controller';
import { mergeMeasurements } from '../services/profile.service';
import { HttpError } from '../middleware/error';

type Res = { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; body?: unknown; code?: number };
function res(): Res {
  const r: Res = { status: vi.fn(), json: vi.fn() };
  r.status.mockImplementation((c: number) => ((r.code = c), r));
  r.json.mockImplementation((b: unknown) => ((r.body = b), r));
  return r;
}
const user = { id: 'u1', role: 'member', plan: 'free' };
const lastUpsert = () => mocks.prisma.styleProfile.upsert.mock.calls.at(-1)![0] as { update: Record<string, unknown> };

beforeEach(() => {
  mocks.prisma.styleProfile.findUnique.mockReset().mockResolvedValue(null);
  mocks.prisma.styleProfile.upsert.mockClear();
});

describe('PATCH /profile { fitReferences }', () => {
  it('writes the references and the inferred range, read against the profile gender', async () => {
    mocks.prisma.styleProfile.findUnique.mockResolvedValue({ styleFor: 'male', currency: 'INR', measurements: null });
    await updateMyProfile({ user, body: { fitReferences: [{ category: 'top', brand: 'zara', size: 'M', feel: 'right' }, { category: 'bottom', brand: 'levis', size: '32' }] } } as never, res() as never);
    const m = lastUpsert().update.measurements as Record<string, unknown>;
    expect(m.unit).toBe('cm');
    expect(m.source).toBe('brand-fit');
    expect(m.confidence).toBe('high');
    expect(m.references).toHaveLength(2);
    expect(m.inferred).toMatchObject({ chest: { lo: 94, hi: 98 }, waist: { lo: 81, hi: 84 }, hips: { lo: 97, hi: 99 } });
  });

  it('rejects a brand off the table, a size off the chart for the gender, and two of one category', async () => {
    mocks.prisma.styleProfile.findUnique.mockResolvedValue({ styleFor: 'female', currency: null, measurements: null });
    await expect(updateMyProfile({ user, body: { fitReferences: [{ category: 'top', brand: 'myntra', size: 'M' }] } } as never, res() as never)).rejects.toMatchObject({ status: 400, message: "I don't have myntra's chart yet." });
    await expect(updateMyProfile({ user, body: { fitReferences: [{ category: 'top', brand: 'zara', size: 'XXL' }] } } as never, res() as never)).rejects.toBeInstanceOf(HttpError);
    await expect(updateMyProfile({ user, body: { fitReferences: [{ category: 'top', brand: 'zara', size: 'M' }, { category: 'top', brand: 'hm', size: 'S' }] } } as never, res() as never)).rejects.toMatchObject({ status: 400 });
    // The schema catches a bad category, feel or scale before the table does.
    await expect(updateMyProfile({ user, body: { fitReferences: [{ category: 'hat', brand: 'zara', size: 'M' }] } } as never, res() as never)).rejects.toThrow();
    await expect(updateMyProfile({ user, body: { fitReferences: [{ category: 'top', brand: 'zara', size: 'M', feel: 'baggy' }] } } as never, res() as never)).rejects.toThrow();
    expect(mocks.prisma.styleProfile.upsert).not.toHaveBeenCalled();
  });

  it('reads against the gender the same request sets', async () => {
    await updateMyProfile({ user, body: { styleFor: 'female', fitReferences: [{ category: 'top', brand: 'zara', size: 'M' }] } } as never, res() as never);
    const m = lastUpsert().update.measurements as { inferred: { chest: { lo: number; hi: number } } };
    expect(m.inferred.chest).toEqual({ lo: 88, hi: 92 });
  });

  it('keeps the typed numbers, which win, and clears references with []', async () => {
    mocks.prisma.styleProfile.findUnique.mockResolvedValue({ styleFor: 'male', currency: null, measurements: { unit: 'cm', chest: 101, preferredFit: 'slim' } });
    await updateMyProfile({ user, body: { fitReferences: [{ category: 'top', brand: 'zara', size: 'M' }] } } as never, res() as never);
    let m = lastUpsert().update.measurements as Record<string, unknown>;
    expect(m).toMatchObject({ unit: 'cm', chest: 101, preferredFit: 'slim', source: 'manual', confidence: 'medium' });
    expect(m.references).toHaveLength(1);

    mocks.prisma.styleProfile.findUnique.mockResolvedValue({ styleFor: 'male', currency: null, measurements: m });
    await updateMyProfile({ user, body: { fitReferences: [] } } as never, res() as never);
    m = lastUpsert().update.measurements as Record<string, unknown>;
    expect(m).toEqual({ unit: 'cm', chest: 101, preferredFit: 'slim', source: 'manual' });
  });

  it('a manual edit keeps the references on file, and clearing the numbers keeps them too', async () => {
    const onFile = { unit: 'cm', references: [{ category: 'top', brand: 'zara', size: 'M' }], inferred: { chest: { lo: 94, hi: 98 } }, confidence: 'medium', source: 'brand-fit' };
    mocks.prisma.styleProfile.findUnique.mockResolvedValue({ styleFor: 'male', currency: null, measurements: onFile });
    await updateMyProfile({ user, body: { measurements: { unit: 'in', waist: 32 } } } as never, res() as never);
    let m = lastUpsert().update.measurements as Record<string, unknown>;
    expect(m).toMatchObject({ unit: 'in', waist: 32, source: 'manual' });
    expect(m.references).toEqual(onFile.references);
    expect(m.inferred).toMatchObject({ chest: { lo: 94, hi: 98 } });

    await updateMyProfile({ user, body: { measurements: null } } as never, res() as never);
    m = lastUpsert().update.measurements as Record<string, unknown>;
    expect(m).toMatchObject({ unit: 'cm', source: 'brand-fit' });
    expect(m.references).toEqual(onFile.references);
  });

  it('with nothing on file, a plain manual write stays as it was', () => {
    expect(mergeMeasurements(null, { measurements: { unit: 'cm', waist: 80 } }, {})).toEqual({ unit: 'cm', waist: 80, source: 'manual' });
    expect(mergeMeasurements(null, { measurements: null }, {})).toBeNull();
    expect(mergeMeasurements(null, { fitReferences: [] }, {})).toBeNull();
    expect(mergeMeasurements({ unit: 'cm', preferredFit: 'slim' }, { fitReferences: null }, {})).toEqual({ unit: 'cm', preferredFit: 'slim' });
  });
});

describe('GET /profile/fit-brands', () => {
  it('lists the brands for the profile gender, or the one asked for', async () => {
    mocks.prisma.styleProfile.findUnique.mockResolvedValue({ styleFor: 'female', currency: 'INR' });
    const r = res();
    await getFitBrands({ user, query: {} } as never, r as never);
    const body = r.body as { gender: string; region: string; brands: { id: string; top?: { sizes: string[] }; shoes?: { scales: { UK: string[] } } }[] };
    expect(body.gender).toBe('women');
    expect(body.region).toBe('IN');
    expect(body.brands.find((b) => b.id === 'zara')?.top?.sizes).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(body.brands.find((b) => b.id === 'levis')?.shoes).toBeUndefined();

    const r2 = res();
    await getFitBrands({ user, query: { gender: 'men' } } as never, r2 as never);
    expect((r2.body as { gender: string }).gender).toBe('men');
    expect((r2.body as typeof body).brands.find((b) => b.id === 'zara')?.top?.sizes).toContain('XXL');

    await expect(getFitBrands({ user, query: { gender: 'kids' } } as never, res() as never)).rejects.toThrow();
  });
});
