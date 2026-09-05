import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  editImage: vi.fn(),
  readStored: vi.fn(),
  saveImageBuffer: vi.fn(),
  checkPhotoFraming: vi.fn(),
  safeCheck: vi.fn(),
  composeReferenceBoard: vi.fn(),
  cropPersonFromBoard: vi.fn(),
}));

vi.mock('../lib/imagegen', () => ({
  editImage: mocks.editImage,
  imagesEnabled: () => true,
}));
vi.mock('../lib/storage', () => ({
  readStored: mocks.readStored,
  saveImageBuffer: mocks.saveImageBuffer,
  keyFromStored: (s: string) => s.split('/').pop() ?? s,
  mimeForKey: (k: string) => (k.endsWith('.png') ? 'image/png' : 'image/jpeg'),
}));
// The board is composed from whatever person bytes it is given, so the
// sources the edit receives reveal which bytes the board was made from.
vi.mock('../lib/reference-board', () => ({
  composeReferenceBoard: mocks.composeReferenceBoard,
  cropPersonFromBoard: mocks.cropPersonFromBoard,
}));
vi.mock('./fidelity.service', async (importActual) => {
  const actual = await importActual<typeof import('./fidelity.service')>();
  return { ...actual, checkPhotoFraming: mocks.checkPhotoFraming, safeCheck: mocks.safeCheck };
});

import type { FidelityVerdict } from './fidelity.service';
import { buildReferencesPrompt, defaultTryOnMode, garmentSpec, renderOutfit, type TryOnItem } from './tryon.service';

// The rail from the owner's report: a black half-sleeve One Piece logo tee,
// black trousers, grey New Balance sneakers, a Jordan cap, a beaded
// bracelet and a watch.
const tee: TryOnItem = {
  id: 'tee',
  imageUrl: '/api/uploads/tee.png',
  category: 'top',
  subtype: 't-shirt',
  primaryColor: 'black',
  pattern: 'graphic',
  material: 'cotton',
  details: { sleeve: 'short', neckline: 'crew' },
  renderNotes: 'Jet-black cotton jersey tee, half sleeves ending above the elbow, ribbed crew neck, a large One Piece straw-hat skull logo printed in white and yellow across the chest.',
};
const trousers: TryOnItem = { id: 'trousers', imageUrl: '/api/uploads/trousers.png', category: 'bottom', subtype: 'trousers', primaryColor: 'black', material: 'cotton', details: { rise: 'mid', leg: 'straight' }, length: 'regular', fit: 'relaxed' };
const sneakers: TryOnItem = { id: 'nb', imageUrl: '/api/uploads/nb.png', category: 'footwear', subtype: 'sneakers', primaryColor: 'grey', secondaryColor: 'white', material: 'suede', shoeType: 'sneaker', renderNotes: 'Grey suede and mesh New Balance 574 with a white N logo and a chunky white sole.' };
const cap: TryOnItem = { id: 'cap', imageUrl: '/api/uploads/cap.png', category: 'accessory', subtype: 'cap', primaryColor: 'black', renderNotes: 'Black Jordan cap with a white Jumpman logo.' };
const bracelet: TryOnItem = { id: 'bracelet', imageUrl: '/api/uploads/bracelet.png', category: 'accessory', subtype: 'beaded bracelet', primaryColor: 'brown' };
const watch: TryOnItem = { id: 'watch', imageUrl: '/api/uploads/watch.png', category: 'accessory', subtype: 'watch', primaryColor: 'silver' };
const rail = [tee, trousers, sneakers, cap, bracelet, watch];

describe('defaultTryOnMode', () => {
  const before = process.env.TRYON_MODE;
  afterEach(() => {
    if (before === undefined) delete process.env.TRYON_MODE;
    else process.env.TRYON_MODE = before;
  });
  it('is references unless TRYON_MODE=text', () => {
    delete process.env.TRYON_MODE;
    expect(defaultTryOnMode()).toBe('references');
    process.env.TRYON_MODE = 'references';
    expect(defaultTryOnMode()).toBe('references');
    process.env.TRYON_MODE = 'text';
    expect(defaultTryOnMode()).toBe('text');
  });
});

describe('garmentSpec', () => {
  it('reads the catalog fields into the phrases the prompt pins to the picture', () => {
    expect(garmentSpec(tee)).toBe(`black graphic cotton t-shirt, short sleeves, crew neckline — ${tee.renderNotes}`);
    expect(garmentSpec(trousers)).toBe('black cotton trousers, mid rise, straight leg, relaxed fit');
    expect(garmentSpec(sneakers)).toContain('grey with white suede sneakers, a sneaker');
    expect(garmentSpec(sneakers)).toContain('New Balance 574');
  });

  it('skips solid patterns, regular lengths and unknowns', () => {
    expect(garmentSpec({ imageUrl: '', category: 'bottom', subtype: 'jeans', primaryColor: 'black', pattern: 'solid', material: 'other', length: 'regular', fit: 'regular' })).toBe('black jeans');
  });
});

describe('buildReferencesPrompt', () => {
  it('lists every garment by slot with its attributes, in order, and labels each picture', () => {
    const { prompt, labels, specs } = buildReferencesPrompt(rail);
    expect(prompt).toContain('GARMENT 1 — the top: copy it exactly as pictured: black graphic cotton t-shirt, short sleeves, crew neck');
    expect(prompt).toContain('One Piece');
    expect(prompt).toContain('GARMENT 2 — the bottom: copy it exactly as pictured: black cotton trousers, mid rise, straight leg');
    expect(prompt).toContain('GARMENT 3 — the shoes: copy it exactly as pictured: grey with white suede sneakers');
    expect(prompt).toContain('GARMENT 4 — the accessory: copy it exactly as pictured: black cap');
    expect(prompt).toContain('GARMENT 5 — the accessory: copy it exactly as pictured: brown beaded bracelet');
    expect(prompt).toContain('GARMENT 6 — the accessory: copy it exactly as pictured: silver watch');
    expect(labels).toHaveLength(6);
    expect(labels[0]).toMatch(/^GARMENT 1 — the top,/);
    expect(labels[2]).toMatch(/^GARMENT 3 — the shoes,/);
    expect(specs.map((s) => s.itemId)).toEqual(['tee', 'trousers', 'nb', 'cap', 'bracelet', 'watch']);
  });

  it('states the count, pins sleeve length, trouser cut and the shoe model to the pictures, and forbids extras', () => {
    const { prompt } = buildReferencesPrompt(rail);
    expect(prompt).toContain('The finished outfit is exactly these 6 pieces and nothing else');
    expect(prompt).toContain('Sleeve length must match the picture exactly');
    expect(prompt).toContain('Trouser length, rise and leg cut must match the picture');
    expect(prompt).toContain('The shoes must be the pictured shoe model');
    expect(prompt).toContain('fully visible in the frame');
    expect(prompt).toContain('Do not add any garment, layer, bag, hat, jewellery or accessory that is not listed');
    expect(prompt).toContain('Keep everything else identical: the same face, identity');
    expect(prompt).not.toContain('CORRECTIONS');
  });

  it('keeps unlisted slots as they are, and says "piece" for one', () => {
    const { prompt } = buildReferencesPrompt([tee]);
    expect(prompt).toContain('exactly these 1 piece and nothing else');
    expect(prompt).toContain('No bottoms or shoes is listed: keep what the person already wears there unchanged');
    expect(prompt).not.toContain('The shoes must be the pictured shoe model');
  });

  it('keeps the crop instead of inventing shoes when the reflection stops above the feet', () => {
    const { prompt } = buildReferencesPrompt(rail, { shoesOutOfFrame: true });
    expect(prompt).toContain('cropped above the feet: keep that crop exactly');
    expect(prompt).not.toContain('fully visible in the frame');
  });

  it('describes the board layout when the garments ride inside the canvas', () => {
    const { prompt } = buildReferencesPrompt(rail, { board: { width: 1460, height: 1024, personWidth: 1024 } });
    expect(prompt).toContain('This 1460×1024 image has two parts side by side. LEFT, 1024 px wide: a photograph of a person');
    expect(prompt).toContain('picture 1 is GARMENT 1');
    expect(prompt).toContain('Leave the RIGHT panel exactly as it is');
    expect(prompt).toContain('The finished outfit is exactly these 6 pieces and nothing else');
    expect(prompt).toContain('never draw a flat-lay, a second person or a new scene');
    expect(prompt).toContain('Output the whole image, edited, at its original size.');
  });

  it('appends corrections as mandatory lines', () => {
    const { prompt } = buildReferencesPrompt(rail, { corrections: ['GARMENT 1 (the top): the sleeve or hem length was wrong. It MUST match its picture exactly: half sleeves.'] });
    expect(prompt).toContain('CORRECTIONS — a previous attempt got these wrong; they are mandatory this time:\n- GARMENT 1 (the top): the sleeve or hem length was wrong');
  });
});

describe('renderOutfit', () => {
  const original = Buffer.from('ORIGINAL-PHOTO-BYTES');
  const firstRender = Buffer.from('RENDER-ONE');
  const secondRender = Buffer.from('RENDER-TWO');
  const good = (index: number, slot: string) => ({ index, slot, present: true, matches: { colour: true, sleeveOrLength: true, silhouette: true, print: true }, note: '' });
  const wrongSleeves: FidelityVerdict = {
    garments: [{ ...good(1, 'top'), matches: { colour: true, sleeveOrLength: false, silhouette: true, print: true }, note: 'Long sleeves' }, good(2, 'bottom'), good(3, 'shoes')],
    personPreserved: true,
    shoesVisible: true,
  };
  const allGood: FidelityVerdict = { garments: [good(1, 'top'), good(2, 'bottom'), good(3, 'shoes')], personPreserved: true, shoesVisible: true };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readStored.mockImplementation(async (key: string) => (key === 'photo.jpg' ? Buffer.from(original) : Buffer.from(`cutout:${key}`)));
    let n = 0;
    mocks.saveImageBuffer.mockImplementation(async () => ({ key: `out-${++n}.png`, url: `/api/uploads/out-${n}.png` }));
    mocks.checkPhotoFraming.mockResolvedValue({ fullLength: true });
    mocks.composeReferenceBoard.mockImplementation(async (person: Buffer, garments: Buffer[]) => ({ data: person, mime: 'image/png', width: 1450, height: 1024, personWidth: 1024, cells: garments.length }));
    mocks.cropPersonFromBoard.mockImplementation(async (render: Buffer) => render);
  });

  it('re-renders once from the ORIGINAL photo — never from the render — with the misses as corrections', async () => {
    mocks.editImage.mockResolvedValueOnce(firstRender).mockResolvedValueOnce(secondRender);
    mocks.safeCheck.mockResolvedValueOnce({ verdict: wrongSleeves }).mockResolvedValueOnce({ verdict: allGood });

    const r = await renderOutfit('photo.jpg', [tee, trousers, sneakers], 'references');

    expect(mocks.editImage).toHaveBeenCalledTimes(2);
    expect(mocks.composeReferenceBoard).toHaveBeenCalledTimes(2);
    for (const call of mocks.composeReferenceBoard.mock.calls) {
      const [person, garments, labels] = call as [Buffer, Buffer[], string[]];
      expect(person.equals(original)).toBe(true);
      expect(garments).toHaveLength(3);
      expect(labels).toEqual(['1 · TOP', '2 · BOTTOM', '3 · SHOES']);
    }
    for (const call of mocks.editImage.mock.calls) {
      const sources = call[1] as { data: Buffer; kind?: string }[];
      expect(sources).toHaveLength(1);
      expect(sources[0].kind).toBe('photo');
      expect(sources[0].data.equals(original)).toBe(true);
      expect(sources[0].data.equals(firstRender) || sources[0].data.equals(secondRender)).toBe(false);
    }
    const [firstPrompt, secondPrompt] = mocks.editImage.mock.calls.map((c) => c[0] as string);
    expect(firstPrompt).not.toContain('CORRECTIONS');
    expect(secondPrompt).toContain('CORRECTIONS');
    expect(secondPrompt).toContain('GARMENT 1 (the top): the sleeve or hem length was wrong (Long sleeves)');
    expect(secondPrompt).toContain('short sleeves');

    expect(r.url).toBe('/api/uploads/out-2.png');
    expect(r.fidelity).toMatchObject({ checked: true, score: 100, firstScore: 92, attempts: 2, shoesOutOfFrame: false, personPreserved: true });
    expect(r.fidelity.retriedFor).toEqual([expect.stringContaining('GARMENT 1 (the top)')]);
    expect(r.fidelity.garments?.[0].matches.sleeveOrLength).toBe(true);
    expect(r.photoFullLength).toBe(true);
  });

  it('renders once when the verdict is clean', async () => {
    mocks.editImage.mockResolvedValueOnce(firstRender);
    mocks.safeCheck.mockResolvedValueOnce({ verdict: allGood });
    const r = await renderOutfit('photo.jpg', [tee, trousers, sneakers], 'references', { fullLength: true });
    expect(mocks.editImage).toHaveBeenCalledTimes(1);
    expect(mocks.checkPhotoFraming).not.toHaveBeenCalled();
    expect(r.fidelity).toMatchObject({ checked: true, score: 100, attempts: 1 });
    expect(r.photoFullLength).toBeUndefined();
  });

  it('keeps the first render when the retry scores no better', async () => {
    mocks.editImage.mockResolvedValueOnce(firstRender).mockResolvedValueOnce(secondRender);
    const worse: FidelityVerdict = { ...wrongSleeves, garments: [{ ...wrongSleeves.garments[0] }, { ...good(2, 'bottom'), present: false }, good(3, 'shoes')] };
    mocks.safeCheck.mockResolvedValueOnce({ verdict: wrongSleeves }).mockResolvedValueOnce({ verdict: worse });
    const r = await renderOutfit('photo.jpg', [tee, trousers, sneakers], 'references', { fullLength: true });
    expect(r.url).toBe('/api/uploads/out-1.png');
    expect(r.fidelity).toMatchObject({ score: 92, firstScore: 92, attempts: 2 });
  });

  it('never fails the render because the check failed', async () => {
    mocks.editImage.mockResolvedValueOnce(firstRender);
    mocks.safeCheck.mockResolvedValueOnce({ verdict: null, error: 'fidelity check timed out' });
    const r = await renderOutfit('photo.jpg', [tee, trousers, sneakers], 'references', { fullLength: true });
    expect(mocks.editImage).toHaveBeenCalledTimes(1);
    expect(r.url).toBe('/api/uploads/out-1.png');
    expect(r.fidelity).toEqual({ checked: false, score: null, shoesOutOfFrame: false, attempts: 1, error: 'fidelity check timed out' });
  });

  it('a cropped reflection keeps its crop and excuses the shoes', async () => {
    mocks.checkPhotoFraming.mockResolvedValueOnce({ fullLength: false });
    mocks.editImage.mockResolvedValueOnce(firstRender);
    const cropped: FidelityVerdict = { ...allGood, garments: [good(1, 'top'), good(2, 'bottom'), { ...good(3, 'shoes'), present: false, note: 'Feet out of frame' }], shoesVisible: false };
    mocks.safeCheck.mockResolvedValueOnce({ verdict: cropped });
    const r = await renderOutfit('photo.jpg', [tee, trousers, sneakers], 'references');
    expect(mocks.editImage).toHaveBeenCalledTimes(1);
    expect(mocks.editImage.mock.calls[0][0]).toContain('cropped above the feet');
    expect(r.fidelity).toMatchObject({ checked: true, score: 100, attempts: 1, shoesOutOfFrame: true });
    expect(r.photoFullLength).toBe(false);
  });

  it('the multi-image transport sends the person first and every cut-out with alpha, all from the original', async () => {
    process.env.TRYON_REFERENCES = 'multi';
    try {
      mocks.editImage.mockResolvedValueOnce(firstRender).mockResolvedValueOnce(secondRender);
      mocks.safeCheck.mockResolvedValueOnce({ verdict: wrongSleeves }).mockResolvedValueOnce({ verdict: allGood });
      await renderOutfit('photo.jpg', [tee, trousers, sneakers], 'references', { fullLength: true });
      expect(mocks.composeReferenceBoard).not.toHaveBeenCalled();
      for (const call of mocks.editImage.mock.calls) {
        const sources = call[1] as { data: Buffer; kind?: string }[];
        expect(sources[0].kind).toBe('photo');
        expect(sources[0].data.equals(original)).toBe(true);
        expect(sources.slice(1).map((s) => s.kind)).toEqual(['cutout', 'cutout', 'cutout']);
        expect(sources.some((s) => s.data.equals(firstRender) || s.data.equals(secondRender))).toBe(false);
      }
    } finally {
      delete process.env.TRYON_REFERENCES;
    }
  });

  it('text mode still sends the person alone, and the retry still starts from the original', async () => {
    mocks.editImage.mockResolvedValueOnce(firstRender).mockResolvedValueOnce(secondRender);
    mocks.safeCheck.mockResolvedValueOnce({ verdict: wrongSleeves }).mockResolvedValueOnce({ verdict: allGood });
    await renderOutfit('photo.jpg', [tee, trousers, sneakers], 'text', { fullLength: true });
    expect(mocks.editImage).toHaveBeenCalledTimes(2);
    for (const call of mocks.editImage.mock.calls) {
      const sources = call[1] as { data: Buffer }[];
      expect(sources).toHaveLength(1);
      expect(sources[0].data.equals(original)).toBe(true);
    }
    expect(mocks.editImage.mock.calls[1][0]).toContain('CORRECTIONS');
  });
});
