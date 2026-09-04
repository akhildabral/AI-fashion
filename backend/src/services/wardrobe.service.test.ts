import { beforeEach, describe, expect, it, vi } from 'vitest';

// The wearability second pass: skipped when the first read is sure of
// patternScale, sheer, dressCode, needsLayer (and shoeType for footwear);
// run on the vision model, time-boxed, for exactly the questions it was not
// sure of; and never fatal — on a failure the first-pass values stand.

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  textModel: vi.fn(async () => ({ id: 'text' })),
  visionModel: vi.fn(async () => ({ id: 'vision' })),
  aiAbortSignal: vi.fn((ms?: number) => ({ ms })),
}));

vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('../lib/ai', () => ({
  textModel: mocks.textModel,
  visionModel: mocks.visionModel,
  aiAbortSignal: mocks.aiAbortSignal,
  aiErrorMessage: (_e: unknown, f: string) => f,
  AI_TIMEOUT_MS: 60_000,
}));

import { SECOND_PASS_TIMEOUT_MS, catalogLine, catalogTags, deriveReasoningAttributes, refineWearability, uncertainWearability, withColourAttributes, type GarmentTags } from './wardrobe.service';
import { srgbToLab } from '../lib/color';

const sure = 0.9;

function firstPass(overrides: Record<string, unknown> = {}, confidence: Record<string, number> = {}) {
  return {
    category: 'top',
    subtype: 'blouse',
    primaryColor: 'white',
    secondaryColor: '',
    pattern: 'solid',
    formality: 'smart-casual',
    season: ['spring', 'summer'],
    occasions: ['work'],
    material: 'silk',
    materialNote: '',
    cutFor: 'womens',
    fit: 'regular',
    length: 'regular',
    texture: 'smooth',
    weight: 'light',
    details: { neckline: 'v-neck', sleeve: 'long', rise: '', leg: '', heel: '', toe: '', closure: 'buttons' },
    description: 'A white silk blouse',
    renderNotes: 'white silk blouse, v-neck, long sleeves',
    patternScale: 'none',
    sheer: false,
    dressCode: 'business-casual',
    needsLayer: false,
    shoeType: 'other',
    ...overrides,
    confidence: {
      category: sure,
      subtype: sure,
      primaryColor: sure,
      secondaryColor: sure,
      pattern: sure,
      formality: sure,
      material: sure,
      cutFor: sure,
      fit: sure,
      length: sure,
      texture: sure,
      weight: sure,
      patternScale: sure,
      sheer: sure,
      dressCode: sure,
      needsLayer: sure,
      shoeType: sure,
      ...confidence,
    },
  };
}

const image = Buffer.from('png');

beforeEach(() => {
  mocks.generateObject.mockReset();
  mocks.visionModel.mockClear();
  mocks.textModel.mockClear();
  mocks.aiAbortSignal.mockClear();
});

describe('catalogTags', () => {
  it('reads the wearability fields in the first pass and skips the second when it is sure', async () => {
    mocks.generateObject.mockResolvedValueOnce({ object: firstPass() });
    const tags = await catalogTags(image, 'image/png');
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    expect(tags).toMatchObject({ patternScale: 'none', sheer: false, dressCode: 'business-casual', needsLayer: false, shoeType: null });
    expect(uncertainWearability(tags)).toEqual([]);
  });

  it('asks the vision model only the questions the first pass was unsure of, and takes its surer answers', async () => {
    mocks.generateObject
      .mockResolvedValueOnce({ object: firstPass({}, { sheer: 0.3, dressCode: 0.55 }) })
      .mockResolvedValueOnce({
        object: {
          patternScale: 'bold',
          sheer: true,
          dressCode: 'cocktail',
          needsLayer: true,
          shoeType: 'heel',
          confidence: { patternScale: 0.95, sheer: 0.85, dressCode: 0.8, needsLayer: 0.95, shoeType: 0.95 },
        },
      });
    const tags = await catalogTags(image, 'image/png');
    expect(mocks.generateObject).toHaveBeenCalledTimes(2);

    const second = mocks.generateObject.mock.calls[1][0];
    expect(second.model).toEqual({ id: 'vision' });
    expect(mocks.aiAbortSignal).toHaveBeenLastCalledWith(SECOND_PASS_TIMEOUT_MS);
    const text = second.messages[0].content.find((c: { type: string }) => c.type === 'text').text as string;
    expect(text).toContain('Answer only these wearability questions: sheer, dressCode.');
    expect(text).toContain('type: blouse');
    expect(second.messages[0].content.some((c: { type: string }) => c.type === 'file')).toBe(true);

    // Only what was asked moves; the first pass keeps the rest.
    expect(tags.sheer).toBe(true);
    expect(tags.dressCode).toBe('cocktail');
    expect(tags.patternScale).toBe('none');
    expect(tags.needsLayer).toBe(false);
    expect(tags.attrConfidence.sheer).toBe(0.85);
    expect(tags.attrConfidence.dressCode).toBe(0.8);
    expect(tags.attrConfidence.patternScale).toBe(sure);
  });

  it('runs the second pass when a wearability field is missing altogether', async () => {
    // Abstained on needsLayer (under the storage threshold): the field is null.
    mocks.generateObject
      .mockResolvedValueOnce({ object: firstPass({}, { needsLayer: 0.2 }) })
      .mockResolvedValueOnce({
        object: { patternScale: 'none', sheer: false, dressCode: 'business-casual', needsLayer: true, shoeType: 'other', confidence: { patternScale: 1, sheer: 1, dressCode: 1, needsLayer: 0.7, shoeType: 1 } },
      });
    const tags = await catalogTags(image, 'image/png');
    expect(mocks.generateObject).toHaveBeenCalledTimes(2);
    expect(tags.needsLayer).toBe(true);
    expect(tags.attrConfidence.needsLayer).toBe(0.7);
  });

  it('asks about the shoe type only for footwear', async () => {
    mocks.generateObject.mockResolvedValueOnce({ object: firstPass({ category: 'top' }, { shoeType: 0.1 }) });
    await catalogTags(image, 'image/png');
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);

    mocks.generateObject
      .mockResolvedValueOnce({ object: firstPass({ category: 'footwear', subtype: 'white pair', shoeType: 'sneaker' }, { shoeType: 0.4 }) })
      .mockResolvedValueOnce({ object: { patternScale: 'none', sheer: false, dressCode: 'casual', needsLayer: false, shoeType: 'sneaker', confidence: { patternScale: 1, sheer: 1, dressCode: 1, needsLayer: 1, shoeType: 0.9 } } });
    const shoe = await catalogTags(image, 'image/png');
    expect(mocks.generateObject).toHaveBeenCalledTimes(3);
    expect(shoe.shoeType).toBe('sneaker');
    // The shoe type feeds the formality ladder when the subtype says nothing.
    expect(deriveReasoningAttributes(shoe).formalityScore).toBe(2);
  });

  it('keeps the first-pass values when the second pass fails or is no surer', async () => {
    mocks.generateObject.mockResolvedValueOnce({ object: firstPass({}, { sheer: 0.3 }) }).mockRejectedValueOnce(new Error('timeout'));
    const failed = await catalogTags(image, 'image/png');
    expect(mocks.generateObject).toHaveBeenCalledTimes(2);
    expect(failed.sheer).toBe(null);
    expect(failed.attrConfidence.sheer).toBe(0.3);

    mocks.generateObject
      .mockResolvedValueOnce({ object: firstPass({ sheer: false }, { sheer: 0.55 }) })
      .mockResolvedValueOnce({ object: { patternScale: 'none', sheer: true, dressCode: 'casual', needsLayer: false, shoeType: 'other', confidence: { patternScale: 1, sheer: 0.5, dressCode: 1, needsLayer: 1, shoeType: 1 } } });
    const unsure = await catalogTags(image, 'image/png');
    expect(unsure.sheer).toBe(false);
    expect(unsure.attrConfidence.sheer).toBe(0.55);
  });

  it('falls back to the text model when there is no vision model', async () => {
    mocks.visionModel.mockRejectedValueOnce(new Error('no vision'));
    mocks.generateObject
      .mockResolvedValueOnce({ object: firstPass({}, { sheer: 0.3 }) })
      .mockResolvedValueOnce({ object: { patternScale: 'none', sheer: true, dressCode: 'casual', needsLayer: false, shoeType: 'other', confidence: { patternScale: 1, sheer: 0.9, dressCode: 1, needsLayer: 1, shoeType: 1 } } });
    const tags = await catalogTags(image, 'image/png');
    expect(mocks.generateObject.mock.calls[1][0].model).toEqual({ id: 'text' });
    expect(tags.sheer).toBe(true);
  });

  it('refineWearability is a no-op without a model call when nothing is uncertain', async () => {
    const tags: GarmentTags = {
      category: 'top',
      subtype: 'blouse',
      primaryColor: 'white',
      secondaryColor: null,
      pattern: 'solid',
      formality: 'smart-casual',
      season: [],
      occasions: [],
      material: null,
      cutFor: null,
      fit: null,
      length: null,
      texture: null,
      weight: null,
      details: null,
      description: null,
      renderNotes: null,
      patternScale: 'none',
      sheer: false,
      dressCode: 'business-casual',
      needsLayer: false,
      shoeType: null,
      attrConfidence: { patternScale: 0.8, sheer: 0.8, dressCode: 0.8, needsLayer: 0.8 },
    };
    expect(await refineWearability(image, 'image/png', tags)).toBe(tags);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});

describe('colour attributes on read', () => {
  const palette = [{ hex: '#ff0000', lab: srgbToLab(255, 0, 0), share: 0.9 }];

  it('derives family and vividness from the palette, and never overrides stored ones', () => {
    expect(withColourAttributes({ colorPalette: palette, colourFamily: null, colourVividness: null })).toMatchObject({ colourFamily: 'red', colourVividness: 'vivid' });
    const stored = { colorPalette: palette, colourFamily: 'neutral', colourVividness: 'muted' };
    expect(withColourAttributes(stored)).toBe(stored);
    const bare = { colorPalette: null, colourFamily: null, colourVividness: null };
    expect(withColourAttributes(bare)).toBe(bare);
  });

  it('deriveReasoningAttributes carries the colour columns only when given a palette', () => {
    const base = { category: 'top', subtype: 'blouse', material: null, formality: 'casual' };
    expect(deriveReasoningAttributes(base)).not.toHaveProperty('colourFamily');
    expect(deriveReasoningAttributes({ ...base, colorPalette: palette })).toMatchObject({ colourFamily: 'red', colourVividness: 'vivid' });
  });
});

describe('catalogLine', () => {
  const item = {
    id: 'x',
    category: 'top',
    subtype: 'blouse',
    primaryColor: 'red',
    secondaryColor: null,
    pattern: 'floral',
    patternScale: 'bold',
    sheer: true,
    dressCode: 'cocktail',
    needsLayer: true,
    shoeType: null,
    material: 'silk',
    fit: null,
    length: null,
    weight: null,
    texture: null,
    formality: 'smart-casual',
    formalityScore: 3,
    warmthValue: 1,
    layerRole: 'base',
    season: [],
    occasions: [],
    details: null,
    colorPalette: [{ hex: '#ff0000', lab: srgbToLab(255, 0, 0), share: 0.9 }],
    colourFamily: null,
    colourVividness: null,
  };

  it('names the colour family, pattern scale, sheerness, dress code and the layer it needs', () => {
    const line = catalogLine(item as never);
    expect(line).toContain('colour:red (vivid red)');
    expect(line).toContain('pattern:floral (bold)');
    expect(line).toContain('| sheer |');
    expect(line).toContain('dress code:cocktail');
    expect(line).toContain('needs a layer over it');
  });

  it('names the shoe type for footwear', () => {
    const line = catalogLine({ ...item, category: 'footwear', subtype: 'white pair', shoeType: 'sneaker', layerRole: 'footwear', sheer: null, needsLayer: null } as never);
    expect(line).toContain('shoe:sneaker');
    expect(line).toContain('shoe formality:2/5');
  });
});
