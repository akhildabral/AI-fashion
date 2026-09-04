// Perceptual color handling for the cataloging pipeline. Palettes are stored
// in LAB space — pairing logic needs perceptual distance, and a single hex
// committed from a badly lit photo is the pipeline's largest silent error.

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface PaletteEntry {
  hex: string;
  lab: Lab;
  share: number;
}

export function srgbToLab(r: number, g: number, b: number): Lab {
  // sRGB → linear
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  // linear RGB → XYZ (D65)
  const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
  const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];

  return {
    L: Math.round((116 * fy - 16) * 10) / 10,
    a: Math.round(500 * (fx - fy) * 10) / 10,
    b: Math.round(200 * (fy - fz) * 10) / 10,
  };
}

export function deltaE(c1: Lab, c2: Lab): number {
  // CIE76 — adequate for dedupe and clustering thresholds.
  return Math.sqrt((c1.L - c2.L) ** 2 + (c1.a - c2.a) ** 2 + (c1.b - c2.b) ** 2);
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Extract a dominant-first palette from RGBA pixel data via k-means in RGB,
// converted to LAB for storage. Samples only confidently-opaque pixels
// (alpha ≥ threshold) so background bleed and matte edges are excluded —
// "sample from the garment interior, not edges".
export function extractPalette(
  rgba: Uint8Array | Buffer,
  width: number,
  height: number,
  k = 3,
  alphaThreshold = 250,
): PaletteEntry[] {
  const samples: Rgb[] = [];
  // Sample a grid of at most ~10k pixels for speed.
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 10000)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] >= alphaThreshold) {
        samples.push({ r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
      }
    }
  }
  if (samples.length < 10) return [];

  // k-means, deterministically seeded by spreading initial centroids across
  // the samples sorted by luminance.
  const byLuma = [...samples].sort(
    (p, q) => p.r * 0.299 + p.g * 0.587 + p.b * 0.114 - (q.r * 0.299 + q.g * 0.587 + q.b * 0.114),
  );
  const clusters = Math.min(k, samples.length);
  let centroids: Rgb[] = Array.from({ length: clusters }, (_, i) => ({
    ...byLuma[Math.floor(((i + 0.5) / clusters) * byLuma.length)],
  }));

  const assignment = new Array<number>(samples.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (let s = 0; s < samples.length; s++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d =
          (samples[s].r - centroids[c].r) ** 2 +
          (samples[s].g - centroids[c].g) ** 2 +
          (samples[s].b - centroids[c].b) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignment[s] !== best) {
        assignment[s] = best;
        moved = true;
      }
    }
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let s = 0; s < samples.length; s++) {
      const a = sums[assignment[s]];
      a.r += samples[s].r;
      a.g += samples[s].g;
      a.b += samples[s].b;
      a.n++;
    }
    centroids = sums.map((a, i) => (a.n ? { r: a.r / a.n, g: a.g / a.n, b: a.b / a.n } : centroids[i]));
    if (!moved) break;
  }

  const counts = centroids.map(() => 0);
  for (const a of assignment) counts[a]++;

  return centroids
    .map((c, i) => ({
      hex: toHex(c.r, c.g, c.b),
      lab: srgbToLab(c.r, c.g, c.b),
      share: Math.round((counts[i] / samples.length) * 100) / 100,
    }))
    .filter((e) => e.share > 0.05)
    .sort((a, b) => b.share - a.share);
}

// --- LCh: hue, chroma and the harmony vocabulary ---------------------------
// Pairing reasons about colour the way a stylist does — neutral or not, which
// hue family, how loud — not by raw ΔE. Hue angles here are CIELAB hue (h°),
// which is not HSL hue: pure red sits near 40°, yellow near 103°, green near
// 136°, teal near 196°, blue near 290–306°, violet beyond.

export interface Lch {
  L: number;
  C: number;
  /** Hue angle in degrees, 0–360. */
  h: number;
}

export function labToLch(lab: Lab): Lch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C: Math.round(C * 10) / 10, h: Math.round(h * 10) / 10 };
}

export const HUE_FAMILIES = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink', 'brown', 'neutral'] as const;
export type HueFamily = (typeof HUE_FAMILIES)[number];

export const SATURATION_BANDS = ['muted', 'mid', 'vivid'] as const;
export type SaturationBand = (typeof SATURATION_BANDS)[number];

// Chroma under this is grey, black or white whatever the hue says.
const NEUTRAL_CHROMA = 14;
// Lightness under this is black — or a navy so deep it dresses as black.
const BLACK_L = 18;
// Beige, cream, camel, sand, khaki: a warm hue at low chroma, light enough.
const BEIGE_HUE: [number, number] = [55, 115];
const BEIGE_CHROMA = 34;
const BEIGE_L = 55;

/** black / white / grey / beige / cream, by lightness and chroma. */
export function isNeutralLab(lab: Lab): boolean {
  const { L, C, h } = labToLch(lab);
  if (C < NEUTRAL_CHROMA) return true;
  if (L < BLACK_L) return true;
  return h >= BEIGE_HUE[0] && h < BEIGE_HUE[1] && C < BEIGE_CHROMA && L >= BEIGE_L;
}

/** The hue family a LAB colour dresses as; neutrals fold black, white, grey, beige and cream together. */
export function hueFamily(lab: Lab): HueFamily {
  if (isNeutralLab(lab)) return 'neutral';
  const { L, C, h } = labToLch(lab);
  if (h >= 335 || h < 22) return L >= 45 ? 'pink' : 'red';
  if (h >= 30 && h < 90 && L < 50 && C < 55) return 'brown';
  if (h < 45) return 'red';
  if (h < 80) return 'orange';
  if (h < 115) return L < 60 ? 'green' : 'yellow'; // olive is a green that lives at yellow's hue
  if (h < 175) return 'green';
  if (h < 225) return 'teal';
  if (h < 310) return 'blue';
  return 'violet';
}

/** How loud a colour is, by chroma alone: muted under 28, vivid from 60. */
export function saturationBand(C: number): SaturationBand {
  if (C < 28) return 'muted';
  if (C < 60) return 'mid';
  return 'vivid';
}

/** Red, orange, yellow and pink are warm; green, teal, blue and violet are cool. */
export function isWarm(hue: number): boolean {
  const h = ((hue % 360) + 360) % 360;
  return h < 115 || h >= 335;
}

/** The shortest way round the hue circle, 0–180. */
export function hueDelta(h1: number, h2: number): number {
  const d = Math.abs((((h1 - h2) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

// Where a family sits when only its name is known (an item catalogued with a
// family but read without its palette).
const FAMILY_HUE: Record<Exclude<HueFamily, 'neutral'>, number> = {
  red: 32,
  orange: 60,
  yellow: 95,
  green: 140,
  teal: 195,
  blue: 275,
  violet: 322,
  pink: 5,
  brown: 60,
};

export function familyHue(family: HueFamily): number | null {
  return family === 'neutral' ? null : FAMILY_HUE[family];
}

export interface ColourReading {
  family: HueFamily;
  band: SaturationBand;
  /** Hue angle; null for a neutral. */
  hue: number | null;
}

export function readColour(lab: Lab): ColourReading {
  const family = hueFamily(lab);
  const { C, h } = labToLch(lab);
  return { family, band: family === 'neutral' ? 'muted' : saturationBand(C), hue: family === 'neutral' ? null : h };
}

/** The dominant LAB of a stored palette, or null when there is none. */
export function dominantLab(palette: unknown): Lab | null {
  if (!Array.isArray(palette) || palette.length === 0) return null;
  const first = palette[0] as { lab?: Partial<Lab> } | null;
  const lab = first?.lab;
  if (!lab || typeof lab.L !== 'number' || typeof lab.a !== 'number' || typeof lab.b !== 'number') return null;
  return { L: lab.L, a: lab.a, b: lab.b };
}

/** What the catalogue stores next to the palette: the family and how loud it is. Null without a palette. */
export function deriveColourAttributes(palette: unknown): { colourFamily: HueFamily; colourVividness: SaturationBand } | null {
  const lab = dominantLab(palette);
  if (!lab) return null;
  const r = readColour(lab);
  return { colourFamily: r.family, colourVividness: r.band };
}
