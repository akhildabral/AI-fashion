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
