import { describe, expect, it } from 'vitest';
import { bandFor, effectiveBody, fitBrandOptions, genderFor, inferMeasurements, preferredFitFrom, regionFor, sizeInBrand, validReference } from './fit.service';
import { BRANDS, chartFor, findBrand } from '../lib/size-charts';

// Fit references: a size in a brand the member knows, read against that
// brand's chart, becomes a body range. Two references that agree narrow it;
// two that disagree widen it and say so; snug and roomy nudge it.

const zaraM = { category: 'top' as const, brand: 'zara', size: 'M' };
const levis32 = { category: 'bottom' as const, brand: 'levis', size: '32' };

describe('the brand table', () => {
  it('has every v1 brand, a source and a check date, and marks charts it could not read off the brand', () => {
    const ids = BRANDS.map((b) => b.id).sort();
    expect(ids).toEqual(['adidas', 'allen-solly', 'hm', 'levis', 'marks-spencer', 'massimo-dutti', 'next', 'nike', 'uniqlo', 'van-heusen', 'zara']);
    for (const b of BRANDS) {
      expect(b.source).toMatch(/^https?:\/\//);
      expect(b.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const c of b.charts) {
        expect(c.rows.length).toBeGreaterThan(2);
        for (const r of c.rows) for (const k of ['chest', 'waist', 'hips', 'foot'] as const) if (r[k]) expect(r[k]![0]).toBeLessThan(r[k]![1]);
      }
    }
    // M&S women's bust and waist came off the page; everything else is a published range.
    expect(chartFor('marks-spencer', 'top', 'women', null)?.approx).toBeFalsy();
    expect(chartFor('zara', 'top', 'women', null)?.approx).toBe(true);
  });

  it('finds a brand by name, alias or shop hostname', () => {
    expect(findBrand('Zara')?.id).toBe('zara');
    expect(findBrand('zara.com/in')?.id).toBe('zara');
    expect(findBrand('H&M')?.id).toBe('hm');
    expect(findBrand("Levi's")?.id).toBe('levis');
    expect(findBrand('M&S')?.id).toBe('marks-spencer');
    expect(findBrand('Myntra')).toBeNull();
    expect(findBrand(null)).toBeNull();
  });

  it('reads a regional chart where the brand differs, and the global one elsewhere', () => {
    expect(chartFor('uniqlo', 'top', 'men', 'IN')?.region).toBe('IN');
    expect(chartFor('uniqlo', 'top', 'men', 'AE')?.region).toBe('global');
    expect(chartFor('zara', 'top', 'men', 'IN')?.region).toBe('global');
    // A unisex ask falls back to men's, and shoes with only a unisex chart serve both.
    expect(chartFor('zara', 'top', 'unisex', null)?.gender).toBe('men');
    expect(chartFor('hm', 'shoes', 'women', null)?.gender).toBe('unisex');
    expect(chartFor('uniqlo', 'shoes', 'men', null)).toBeNull();
  });
});

describe('inferMeasurements', () => {
  it('intersects the references per measure and keeps what only one says', () => {
    const inf = inferMeasurements([zaraM, levis32], { gender: 'men' });
    expect(inf.chest).toEqual({ lo: 94, hi: 98 });
    // Zara M waist 80–84 ∩ Levi's 32 waist 81–84.
    expect(inf.waist).toEqual({ lo: 81, hi: 84 });
    expect(inf.hips).toEqual({ lo: 97, hi: 99 });
    expect(inf.inseam).toBeUndefined();
    expect(inf.confidence).toBe('high');
    expect(inf.source).toBe('brand-fit');
    expect(inf.unit).toBe('cm');
    expect(inf.read).toBe(2);
  });

  it('widens to the union and lowers confidence when the references disagree', () => {
    const inf = inferMeasurements([zaraM, { ...levis32, size: '28' }], { gender: 'men' });
    expect(inf.waist).toEqual({ lo: 71, hi: 84 });
    expect(inf.confidence).toBe('low');
  });

  it('a single reference is medium confidence; nothing readable is low', () => {
    expect(inferMeasurements([zaraM], { gender: 'men' }).confidence).toBe('medium');
    const none = inferMeasurements([{ category: 'top', brand: 'myntra', size: 'M' }], { gender: 'men' });
    expect(none.confidence).toBe('low');
    expect(none.read).toBe(0);
    expect(none.chest).toBeUndefined();
  });

  it('snug moves the band up half a size, roomy moves it down', () => {
    const chart = chartFor('zara', 'top', 'men', null)!;
    expect(bandFor(chart, 2, 'right', 'chest')).toEqual({ lo: 94, hi: 98 });
    expect(bandFor(chart, 2, 'snug', 'chest')).toEqual({ lo: 96, hi: 100.5 });
    expect(bandFor(chart, 2, 'roomy', 'chest')).toEqual({ lo: 91.5, hi: 96 });
    // At the ends of a chart the step is a default, never zero.
    expect(bandFor(chart, 5, 'snug', 'chest')).toEqual({ lo: 111.5, hi: 116 });
    expect(bandFor(chart, 0, 'roomy', 'chest')).toEqual({ lo: 82, hi: 86 });
    expect(bandFor(chart, 2, 'snug', 'hips')).toBeNull();
  });

  it('feel adjustments carry into the intersection', () => {
    const snug = inferMeasurements([{ ...zaraM, feel: 'snug' }, { ...levis32, feel: 'right' }], { gender: 'men' });
    expect(snug.waist).toEqual({ lo: 82, hi: 84 });
    const roomy = inferMeasurements([{ ...zaraM, feel: 'roomy' }, { ...levis32, feel: 'roomy' }], { gender: 'men' });
    expect(roomy.waist?.hi).toBeLessThan(82.5);
  });

  it('reads shoes on the reference scale into a foot length, and shoes never vote on fit', () => {
    const inf = inferMeasurements([{ category: 'shoes', brand: 'nike', size: '9', scale: 'UK' }], { gender: 'men' });
    expect(inf.foot).toEqual({ lo: 27.7, hi: 28.3 });
    expect(inf.chest).toBeUndefined();
    expect(inf.preferredFit).toBeNull();
    expect(inferMeasurements([{ category: 'shoes', brand: 'nike', size: '10', scale: 'US' }], { gender: 'men' }).foot).toEqual({ lo: 27.7, hi: 28.3 });
    expect(inferMeasurements([{ category: 'shoes', brand: 'nike', size: '99', scale: 'US' }], { gender: 'men' }).read).toBe(0);
  });

  it('reads women against the women\'s charts, and Uniqlo India against the Asia chart', () => {
    const her = inferMeasurements([{ category: 'top', brand: 'zara', size: 'M' }], { gender: 'women' });
    expect(her.chest).toEqual({ lo: 88, hi: 92 });
    expect(her.hips).toEqual({ lo: 96, hi: 100 });
    const inM = inferMeasurements([{ category: 'top', brand: 'uniqlo', size: 'M' }], { gender: 'men', region: 'IN' });
    const ukM = inferMeasurements([{ category: 'top', brand: 'uniqlo', size: 'M' }], { gender: 'men', region: 'UK' });
    expect(inM.chest!.hi).toBeLessThan(ukM.chest!.lo + 1);
  });

  it('derives the preferred fit from the feels: mostly roomy is relaxed, mostly snug is slim', () => {
    expect(preferredFitFrom([{ ...zaraM, feel: 'roomy' }, { ...levis32, feel: 'roomy' }])).toBe('relaxed');
    expect(preferredFitFrom([{ ...zaraM, feel: 'snug' }, { ...levis32, feel: 'right' }])).toBe('regular');
    expect(preferredFitFrom([{ ...zaraM, feel: 'snug' }])).toBe('slim');
    expect(preferredFitFrom([{ ...zaraM, feel: 'snug' }, { ...levis32, feel: 'roomy' }])).toBe('regular');
    expect(preferredFitFrom([zaraM, { category: 'shoes', brand: 'nike', size: '42', feel: 'snug' }])).toBeNull();
    expect(inferMeasurements([{ ...zaraM, feel: 'roomy' }], { gender: 'men' }).preferredFit).toBe('relaxed');
  });
});

describe('sizeInBrand', () => {
  it('names the size whose range contains the numbers', () => {
    const m = sizeInBrand({ unit: 'cm', chest: 96, waist: 82 }, 'zara', 'top', 'men');
    expect(m?.size).toBe('M');
    expect(m?.inside).toBe(true);
    expect(m?.sizes).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    expect(sizeInBrand({ unit: 'cm', chest: 90 }, 'zara', 'top', 'women')?.size).toBe('M');
  });

  it("reads Levi's in inches on the label and in either unit on the body", () => {
    expect(sizeInBrand({ unit: 'in', waist: 32 }, "Levi's", 'bottom', 'men')?.size).toBe('32');
    expect(sizeInBrand({ unit: 'cm', waist: 82 }, 'levis', 'bottom', 'men')?.size).toBe('32');
    expect(sizeInBrand({ unit: 'cm', waist: 67, hips: 93 }, 'levis', 'bottom', 'women')?.size).toBe('26');
  });

  it('picks the nearest size between sizes and says it is not a clean fit', () => {
    const m = sizeInBrand({ unit: 'cm', chest: 98.4 }, 'zara', 'top', 'men');
    expect(m?.size).toBe('M');
    expect(m?.inside).toBe(false);
  });

  it('is null for an unknown brand, a missing chart, or numbers the chart does not measure', () => {
    expect(sizeInBrand({ unit: 'cm', chest: 96 }, 'myntra', 'top', 'men')).toBeNull();
    expect(sizeInBrand({ unit: 'cm', foot: 27 }, 'uniqlo', 'shoes', 'men')).toBeNull();
    expect(sizeInBrand({ unit: 'cm', inseam: 81 }, 'zara', 'top', 'men')).toBeNull();
    expect(sizeInBrand({ unit: 'cm' }, 'zara', 'top', 'men')).toBeNull();
  });

  it('sizes shoes by foot length, with the EU label', () => {
    expect(sizeInBrand({ unit: 'cm', foot: 28 }, 'nike', 'shoes', 'men')?.size).toBe('44');
    expect(sizeInBrand({ unit: 'cm', foot: 24.4 }, 'zara', 'shoes', 'women')?.size).toBe('38');
  });
});

describe('effectiveBody and the options', () => {
  it('prefers typed numbers, fills the rest from the inferred middle, converts inches', () => {
    expect(effectiveBody({ unit: 'in', chest: 38, inferred: { waist: { lo: 81, hi: 84 } } })).toEqual({ unit: 'cm', chest: 96.5, waist: 82.5 });
    expect(effectiveBody({ unit: 'cm' })).toBeNull();
    expect(effectiveBody(null)).toBeNull();
    expect(effectiveBody({ unit: 'cm', inferred: { foot: { lo: 27.7, hi: 28.3 } } })).toEqual({ unit: 'cm', foot: 28 });
  });

  it('lists the brands with their sizes per category for a gender, and the shoe scales', () => {
    const women = fitBrandOptions('women', 'IN');
    const zara = women.find((b) => b.id === 'zara')!;
    expect(zara.top?.sizes).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(zara.bottom?.sizes[0]).toBe('32');
    expect(zara.shoes?.scales.UK).toContain('5');
    expect(zara.top?.approx).toBe(true);
    const men = fitBrandOptions('men', null);
    expect(men.find((b) => b.id === 'levis')?.bottom?.sizes).toContain('32');
    expect(men.find((b) => b.id === 'uniqlo')?.shoes).toBeUndefined();
    expect(men.find((b) => b.id === 'van-heusen')?.top?.sizes).toEqual(['38', '39', '40', '42', '44', '46']);
  });

  it('validates a reference against the table and maps the profile to a gender and region', () => {
    expect(validReference(zaraM, { gender: 'men' })).toBe(true);
    expect(validReference({ ...zaraM, size: 'XXXL' }, { gender: 'men' })).toBe(false);
    expect(validReference({ ...zaraM, size: 'XXL' }, { gender: 'women' })).toBe(false);
    expect(validReference({ category: 'shoes', brand: 'nike', size: '9', scale: 'UK' }, { gender: 'men' })).toBe(true);
    expect(validReference({ category: 'shoes', brand: 'nike', size: '9', scale: 'EU' }, { gender: 'men' })).toBe(false);
    expect(genderFor('female')).toBe('women');
    expect(genderFor('male')).toBe('men');
    expect(genderFor(null)).toBe('unisex');
    expect(regionFor('INR')).toBe('IN');
    expect(regionFor('AED')).toBe('AE');
    expect(regionFor('JPY')).toBeNull();
  });
});
