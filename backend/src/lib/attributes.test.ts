import { describe, expect, it } from 'vitest';
import {
  currentSeason,
  deriveLayerRole,
  deriveNeedsLayer,
  deriveShoeFormality,
  formalityScoreFor,
  hasUnresolvedTwin,
  isOpenToe,
  isStyleable,
  isWeatherproof,
  layerRoleFor,
  midStandsAlone,
  normalizeColorName,
  seasonAllows,
  warmthFor,
} from './attributes';

describe('layerRoleFor', () => {
  it('maps categories to layer roles', () => {
    expect(layerRoleFor('outerwear', 'denim jacket')).toBe('outer');
    expect(layerRoleFor('bottom', 'jeans')).toBe('bottom');
    expect(layerRoleFor('footwear', 'sneakers')).toBe('footwear');
    expect(layerRoleFor('dress', 'sundress')).toBe('one-piece');
    expect(layerRoleFor('accessory', 'belt')).toBe('accessory');
  });

  it('splits tops into base and mid layers by subtype', () => {
    expect(layerRoleFor('top', 't-shirt')).toBe('base');
    expect(layerRoleFor('top', 'oxford shirt')).toBe('base');
    expect(layerRoleFor('top', 'wool sweater')).toBe('mid');
    expect(layerRoleFor('top', 'zip hoodie')).toBe('mid');
  });

  it('returns null for unknown categories', () => {
    expect(layerRoleFor('other', 'thing')).toBeNull();
  });
});

describe('deriveLayerRole', () => {
  it('lets the subtype keyword win over the category', () => {
    expect(deriveLayerRole('top', 'blazer')).toBe('mid');
    expect(deriveLayerRole('top', 'denim jacket')).toBe('outer');
    expect(deriveLayerRole('top', 'wool coat')).toBe('outer');
    expect(deriveLayerRole('top', 'cardigan')).toBe('mid');
    expect(deriveLayerRole('top', 'waistcoat')).toBe('mid');
    expect(deriveLayerRole('top', 'overshirt')).toBe('mid');
    expect(deriveLayerRole('outerwear', 'trench coat')).toBe('outer');
    expect(deriveLayerRole('outerwear', 'parka')).toBe('outer');
    expect(deriveLayerRole('top', 'gilet')).toBe('mid');
    expect(deriveLayerRole('outerwear', 'wool blazer')).toBe('mid');
  });

  it('reads one-pieces from the keyword', () => {
    expect(deriveLayerRole('top', 'jumpsuit')).toBe('one-piece');
    expect(deriveLayerRole('bottom', 'dungarees')).toBe('one-piece');
    expect(deriveLayerRole('top', 'shirt dress')).toBe('one-piece');
    expect(deriveLayerRole('dress', 'gown')).toBe('one-piece');
  });

  it('keeps "dress" as an adjective where it is one', () => {
    expect(deriveLayerRole('top', 'dress shirt')).toBe('base');
    expect(deriveLayerRole('bottom', 'dress trousers')).toBe('bottom');
    expect(deriveLayerRole('footwear', 'dress shoes')).toBe('footwear');
  });

  it('keeps tanks and vest tops as base', () => {
    expect(deriveLayerRole('top', 'tank top')).toBe('base');
    expect(deriveLayerRole('top', 'vest top')).toBe('base');
    expect(deriveLayerRole('top', 'sweater vest')).toBe('mid');
  });

  it('knows which mids stand alone', () => {
    expect(midStandsAlone('wool sweater')).toBe(true);
    expect(midStandsAlone('hoodie')).toBe(true);
    expect(midStandsAlone('blazer')).toBe(false);
    expect(midStandsAlone('waistcoat')).toBe(false);
  });
});

describe('deriveNeedsLayer', () => {
  it('flags underlayers and sheer fabrics', () => {
    expect(deriveNeedsLayer('camisole')).toBe(true);
    expect(deriveNeedsLayer('tank top')).toBe(true);
    expect(deriveNeedsLayer('slip top')).toBe(true);
    expect(deriveNeedsLayer('bralette')).toBe(true);
    expect(deriveNeedsLayer('bandeau')).toBe(true);
    expect(deriveNeedsLayer('tube top')).toBe(true);
    expect(deriveNeedsLayer('blouse', null, 'sheer silk')).toBe(true);
    expect(deriveNeedsLayer('mesh top')).toBe(true);
    expect(deriveNeedsLayer('lace top')).toBe(true);
  });

  it('flags a sleeveless crop only when the setting is business or above', () => {
    expect(deriveNeedsLayer('crop top', { sleeve: 'sleeveless' }, 'cotton', 4)).toBe(true);
    expect(deriveNeedsLayer('crop top', { sleeve: 'sleeveless' }, 'cotton', 2)).toBe(false);
    expect(deriveNeedsLayer('crop top', { sleeve: 'long' }, 'cotton', 4)).toBe(false);
  });

  it('leaves ordinary tops alone', () => {
    expect(deriveNeedsLayer('oxford shirt')).toBe(false);
    expect(deriveNeedsLayer('t-shirt')).toBe(false);
    expect(deriveNeedsLayer('polo shirt')).toBe(false);
  });
});

describe('deriveShoeFormality', () => {
  it('walks the ladder', () => {
    expect(deriveShoeFormality('flip-flops')).toBe(1);
    expect(deriveShoeFormality('pool slides')).toBe(1);
    expect(deriveShoeFormality('running shoes')).toBe(1);
    expect(deriveShoeFormality('gym shoe')).toBe(1);
    expect(deriveShoeFormality('white sneakers')).toBe(2);
    expect(deriveShoeFormality('canvas trainers')).toBe(2);
    expect(deriveShoeFormality('leather sandals')).toBe(2);
    expect(deriveShoeFormality('heeled sandals')).toBe(3);
    expect(deriveShoeFormality('combat boots')).toBe(2);
    expect(deriveShoeFormality('chelsea boots')).toBe(3);
    expect(deriveShoeFormality('ankle boots')).toBe(3);
    expect(deriveShoeFormality('leather boots')).toBe(3);
    expect(deriveShoeFormality('penny loafers')).toBe(3);
    expect(deriveShoeFormality('mules')).toBe(3);
    expect(deriveShoeFormality('derby shoes')).toBe(4);
    expect(deriveShoeFormality('brogues')).toBe(4);
    expect(deriveShoeFormality('monk straps')).toBe(4);
    expect(deriveShoeFormality('oxford shoes')).toBe(4);
    expect(deriveShoeFormality('black pumps')).toBe(4);
    expect(deriveShoeFormality('kitten heels')).toBe(4);
    expect(deriveShoeFormality('stilettos')).toBe(5);
    expect(deriveShoeFormality('high heels')).toBe(5);
  });

  it('returns null for an unknown subtype so the garment formality can stand in', () => {
    expect(deriveShoeFormality('footwear thing')).toBeNull();
    expect(deriveShoeFormality(null)).toBeNull();
  });
});

describe('footwear weather helpers', () => {
  it('knows open toes', () => {
    expect(isOpenToe('sandals')).toBe(true);
    expect(isOpenToe('flip flops')).toBe(true);
    expect(isOpenToe('peep-toe heels')).toBe(true);
    expect(isOpenToe('pumps', { toe: 'open' })).toBe(true);
    expect(isOpenToe('pumps', { toe: 'pointed' })).toBe(false);
    expect(isOpenToe('sneakers')).toBe(false);
  });

  it('knows weatherproof shoes', () => {
    expect(isWeatherproof('wellington boots')).toBe(true);
    expect(isWeatherproof('chelsea boots', 'leather')).toBe(true);
    expect(isWeatherproof('leather boots', 'leather')).toBe(true);
    expect(isWeatherproof('suede boots', 'suede')).toBe(false);
    expect(isWeatherproof('canvas sneakers', 'cotton')).toBe(false);
    expect(isWeatherproof('sandals', 'leather')).toBe(false);
  });
});

describe('seasons', () => {
  it('derives the season from the date and hemisphere', () => {
    expect(currentSeason(new Date('2026-01-15'))).toBe('winter');
    expect(currentSeason(new Date('2026-04-15'))).toBe('spring');
    expect(currentSeason(new Date('2026-07-15'))).toBe('summer');
    expect(currentSeason(new Date('2026-10-15'))).toBe('fall');
    expect(currentSeason(new Date('2026-07-15'), 'south')).toBe('winter');
    expect(currentSeason(new Date('2026-01-15'), 'south')).toBe('summer');
  });

  it('allows an empty list, accepts autumn, and checks the current season', () => {
    expect(seasonAllows([], 7)).toBe(true);
    expect(seasonAllows(null, 7)).toBe(true);
    expect(seasonAllows(['summer'], 7)).toBe(true);
    expect(seasonAllows(['winter'], 7)).toBe(false);
    expect(seasonAllows(['autumn'], 10)).toBe(true);
    expect(seasonAllows(['all'], 1)).toBe(true);
    expect(seasonAllows(['year-round'], 7)).toBe(true);
    expect(seasonAllows(['winter'], { month: 7, hemisphere: 'south' })).toBe(true);
    expect(seasonAllows(['winter'], { season: 'summer' })).toBe(false);
    expect(seasonAllows(['winter'], new Date('2026-12-20'))).toBe(true);
  });
});

describe('isStyleable', () => {
  const base = { category: 'top', status: 'ready', state: 'clean', suppressed: false, owned: true, twinOfId: null, twinResolvedAt: null };

  it('accepts a clean, catalogued, wearable piece', () => {
    expect(isStyleable(base)).toBe(true);
  });

  it('rejects swatches, the wash, suppressed pieces, unanswered twins and wishlist pieces', () => {
    expect(isStyleable({ ...base, category: 'other' })).toBe(false);
    expect(isStyleable({ ...base, state: 'in-wash' })).toBe(false);
    expect(isStyleable({ ...base, status: 'processing' })).toBe(false);
    expect(isStyleable({ ...base, suppressed: true })).toBe(false);
    expect(isStyleable({ ...base, twinOfId: 'x' })).toBe(false);
    expect(isStyleable({ ...base, twinOfId: 'x', twinResolvedAt: new Date() })).toBe(true);
    expect(isStyleable({ ...base, owned: false })).toBe(false);
  });

  it('can widen the available states', () => {
    expect(isStyleable({ ...base, state: 'packed' }, { states: ['clean', 'packed'] })).toBe(true);
  });

  it('knows an unresolved twin', () => {
    expect(hasUnresolvedTwin({ twinOfId: 'a', twinResolvedAt: null })).toBe(true);
    expect(hasUnresolvedTwin({ twinOfId: null })).toBe(false);
  });
});

describe('warmthFor', () => {
  it('is deterministic and keyword-driven', () => {
    expect(warmthFor('outerwear', 'parka')).toBe(9);
    expect(warmthFor('top', 't-shirt')).toBe(1);
    expect(warmthFor('bottom', 'shorts')).toBe(0);
  });

  it('applies material modifiers within 0-10 bounds', () => {
    expect(warmthFor('top', 'sweater', 'wool')).toBe(7);
    expect(warmthFor('top', 'shirt', 'linen')).toBe(1);
    expect(warmthFor('bottom', 'shorts', 'linen')).toBe(0); // clamped at 0
  });

  it('falls back to category defaults', () => {
    expect(warmthFor('top', 'unrecognized garment')).toBe(2);
    expect(warmthFor('other', 'unknown')).toBeNull();
  });
});

describe('formalityScoreFor', () => {
  it('maps the tag vocabulary to 1-5', () => {
    expect(formalityScoreFor('athletic')).toBe(1);
    expect(formalityScoreFor('casual')).toBe(2);
    expect(formalityScoreFor('smart-casual')).toBe(3);
    expect(formalityScoreFor('business')).toBe(4);
    expect(formalityScoreFor('formal')).toBe(5);
    expect(formalityScoreFor(null)).toBeNull();
    expect(formalityScoreFor('unheard-of')).toBeNull();
  });
});

describe('normalizeColorName', () => {
  it('collapses synonyms into the controlled vocabulary', () => {
    expect(normalizeColorName('Navy Blue')).toBe('navy');
    expect(normalizeColorName('midnight blue')).toBe('navy');
    expect(normalizeColorName('dark blue')).toBe('navy');
    expect(normalizeColorName('Off-White')).toBe('cream');
    expect(normalizeColorName('gray')).toBe('grey');
  });

  it('passes through canonical values and handles empties', () => {
    expect(normalizeColorName('navy')).toBe('navy');
    expect(normalizeColorName('chartreuse')).toBe('chartreuse');
    expect(normalizeColorName('')).toBeNull();
    expect(normalizeColorName(null)).toBeNull();
  });
});
