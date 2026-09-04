import { describe, expect, it } from 'vitest';
import { deltaE, deriveColourAttributes, dominantLab, extractPalette, familyHue, hueDelta, hueFamily, isNeutralLab, isWarm, labToLch, readColour, saturationBand, srgbToLab } from './color';

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

describe('labToLch', () => {
  it('reads chroma and a 0–360 hue off LAB', () => {
    const grey = labToLch(srgbToLab(128, 128, 128));
    expect(grey.C).toBeLessThan(1);
    const red = labToLch(srgbToLab(255, 0, 0));
    expect(red.C).toBeGreaterThan(100);
    expect(red.h).toBeGreaterThan(30);
    expect(red.h).toBeLessThan(50);
    const blue = labToLch(srgbToLab(0, 0, 255));
    expect(blue.h).toBeGreaterThan(290);
    expect(blue.h).toBeLessThan(320);
  });
});

describe('hueFamily', () => {
  const fam = (r: number, g: number, b: number) => hueFamily(srgbToLab(r, g, b));

  it('folds black, white, grey, beige and cream into neutral', () => {
    expect(fam(0, 0, 0)).toBe('neutral');
    expect(fam(255, 255, 255)).toBe('neutral');
    expect(fam(128, 128, 128)).toBe('neutral');
    expect(fam(54, 69, 79)).toBe('neutral'); // charcoal
    expect(fam(245, 245, 220)).toBe('neutral'); // beige
    expect(fam(255, 253, 208)).toBe('neutral'); // cream
    expect(fam(193, 154, 107)).toBe('neutral'); // camel
    expect(fam(195, 176, 145)).toBe('neutral'); // khaki
    expect(isNeutralLab(srgbToLab(20, 30, 80))).toBe(true); // a navy so deep it dresses as black
  });

  it('names the hue families', () => {
    expect(fam(255, 0, 0)).toBe('red');
    expect(fam(128, 0, 32)).toBe('red'); // burgundy
    expect(fam(255, 165, 0)).toBe('orange');
    expect(fam(183, 65, 14)).toBe('orange'); // rust
    expect(fam(255, 219, 88)).toBe('yellow'); // mustard
    expect(fam(0, 128, 0)).toBe('green');
    expect(fam(128, 128, 0)).toBe('green'); // olive lives at yellow's hue, dark
    expect(fam(158, 178, 141)).toBe('green'); // sage
    expect(fam(0, 128, 128)).toBe('teal');
    expect(fam(135, 206, 235)).toBe('blue'); // sky
    expect(fam(65, 105, 225)).toBe('blue'); // royal
    expect(fam(0, 0, 255)).toBe('blue');
    expect(fam(128, 0, 128)).toBe('violet');
    expect(fam(200, 162, 200)).toBe('violet'); // lilac
    expect(fam(255, 192, 203)).toBe('pink');
    expect(fam(255, 105, 180)).toBe('pink'); // hot pink
    expect(fam(139, 69, 19)).toBe('brown');
    expect(fam(123, 63, 0)).toBe('brown'); // chocolate
  });
});

describe('saturationBand and isWarm', () => {
  it('bands chroma into muted, mid and vivid', () => {
    expect(saturationBand(labToLch(srgbToLab(158, 178, 141)).C)).toBe('muted'); // sage
    expect(saturationBand(labToLch(srgbToLab(0, 128, 128)).C)).toBe('mid'); // teal
    expect(saturationBand(labToLch(srgbToLab(128, 0, 32)).C)).toBe('mid'); // burgundy
    expect(saturationBand(labToLch(srgbToLab(255, 0, 0)).C)).toBe('vivid');
    expect(saturationBand(labToLch(srgbToLab(255, 165, 0)).C)).toBe('vivid');
    expect(saturationBand(0)).toBe('muted');
  });

  it('calls red, orange, yellow and pink warm; green, teal, blue and violet cool', () => {
    expect(isWarm(labToLch(srgbToLab(255, 0, 0)).h)).toBe(true);
    expect(isWarm(labToLch(srgbToLab(255, 165, 0)).h)).toBe(true);
    expect(isWarm(labToLch(srgbToLab(255, 105, 180)).h)).toBe(true);
    expect(isWarm(labToLch(srgbToLab(0, 128, 0)).h)).toBe(false);
    expect(isWarm(labToLch(srgbToLab(0, 0, 255)).h)).toBe(false);
    expect(isWarm(labToLch(srgbToLab(128, 0, 128)).h)).toBe(false);
    expect(isWarm(-10)).toBe(true);
  });

  it('measures hue distance the short way round', () => {
    expect(hueDelta(10, 350)).toBe(20);
    expect(hueDelta(0, 180)).toBe(180);
    expect(hueDelta(40, 136)).toBe(96);
  });
});

describe('readColour and the stored attributes', () => {
  it('reads a palette into a family and a vividness, hue-less for a neutral', () => {
    const red = readColour(srgbToLab(255, 0, 0));
    expect(red).toMatchObject({ family: 'red', band: 'vivid' });
    expect(red.hue).not.toBeNull();
    const black = readColour(srgbToLab(0, 0, 0));
    expect(black).toEqual({ family: 'neutral', band: 'muted', hue: null });
  });

  it('derives the columns from a stored palette and abstains without one', () => {
    const palette = [{ hex: '#ff0000', lab: srgbToLab(255, 0, 0), share: 0.9 }];
    expect(deriveColourAttributes(palette)).toEqual({ colourFamily: 'red', colourVividness: 'vivid' });
    expect(dominantLab(palette)).toEqual(srgbToLab(255, 0, 0));
    expect(deriveColourAttributes(null)).toBeNull();
    expect(deriveColourAttributes([])).toBeNull();
    expect(deriveColourAttributes([{ hex: '#000' }])).toBeNull();
    expect(dominantLab('nope')).toBeNull();
  });

  it('places a family on the wheel when only its name is known', () => {
    expect(familyHue('neutral')).toBeNull();
    expect(hueDelta(familyHue('red')!, familyHue('orange')!)).toBeLessThan(40);
    expect(hueDelta(familyHue('red')!, familyHue('green')!)).toBeGreaterThan(60);
  });
});
