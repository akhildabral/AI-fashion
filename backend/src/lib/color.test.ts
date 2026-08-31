import { describe, expect, it } from 'vitest';
import { deltaE, extractPalette, srgbToLab } from './color';

describe('srgbToLab', () => {
  it('maps reference colors correctly', () => {
    const white = srgbToLab(255, 255, 255);
    expect(white.L).toBeCloseTo(100, 0);
    expect(Math.abs(white.a)).toBeLessThan(1);
    expect(Math.abs(white.b)).toBeLessThan(1);

    const black = srgbToLab(0, 0, 0);
    expect(black.L).toBeCloseTo(0, 0);

    const red = srgbToLab(255, 0, 0);
    expect(red.L).toBeGreaterThan(50);
    expect(red.a).toBeGreaterThan(60); // strongly red
  });
});

describe('deltaE', () => {
  it('is zero for identical colors and grows with difference', () => {
    const navy = srgbToLab(20, 30, 80);
    const midnight = srgbToLab(15, 25, 70);
    const orange = srgbToLab(240, 140, 20);
    expect(deltaE(navy, navy)).toBe(0);
    expect(deltaE(navy, midnight)).toBeLessThan(deltaE(navy, orange));
  });
});

function solidImage(width: number, height: number, rgba: [number, number, number, number]) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = rgba[0];
    buf[i * 4 + 1] = rgba[1];
    buf[i * 4 + 2] = rgba[2];
    buf[i * 4 + 3] = rgba[3];
  }
  return buf;
}

describe('extractPalette', () => {
  it('finds the dominant color of a solid garment cutout', () => {
    const img = solidImage(100, 100, [200, 30, 40, 255]);
    const palette = extractPalette(img, 100, 100);
    expect(palette.length).toBeGreaterThan(0);
    expect(palette[0].share).toBeGreaterThan(0.9);
    expect(palette[0].lab.a).toBeGreaterThan(40); // clearly red
  });

  it('ignores transparent (background) pixels entirely', () => {
    const width = 100;
    const height = 100;
    const img = solidImage(width, height, [0, 255, 0, 0]); // transparent green
    // Opaque blue square in the middle third.
    for (let y = 33; y < 66; y++) {
      for (let x = 33; x < 66; x++) {
        const i = (y * width + x) * 4;
        img[i] = 30;
        img[i + 1] = 40;
        img[i + 2] = 200;
        img[i + 3] = 255;
      }
    }
    const palette = extractPalette(img, width, height);
    expect(palette.length).toBeGreaterThan(0);
    // Dominant color must be the blue interior, never the transparent green.
    expect(palette[0].lab.b).toBeLessThan(0); // negative b* = blue
  });

  it('returns an empty palette when almost nothing is opaque', () => {
    const img = solidImage(50, 50, [10, 10, 10, 0]);
    expect(extractPalette(img, 50, 50)).toEqual([]);
  });
});
