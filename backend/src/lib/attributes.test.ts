import { describe, expect, it } from 'vitest';
import {
  formalityScoreFor,
  layerRoleFor,
  normalizeColorName,
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
