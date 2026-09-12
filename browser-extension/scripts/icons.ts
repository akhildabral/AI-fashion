// Renders the extension icons: the outlined gold arch on the ink ground, the
// same mark as the web favicon (owner decision: the favicon arch stays
// outlined, never filled). Each size is drawn natively so the hairline stays
// crisp. Run from backend/ so `sharp` resolves:
//   cd backend && npx tsx ../browser-extension/scripts/icons.ts
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromBackend = createRequire(path.resolve(here, '../../backend/package.json'));
const sharp = requireFromBackend('sharp') as typeof import('sharp');

const OUT = path.resolve(here, '../icons');
const INK = '#0B0A09';
const GOLD = '#D8B26A';

// The favicon geometry from backend/scripts/brand-icons.ts, unchanged.
function darkArch(size: number, stroke: number): string {
  const w = size * 0.44, h = (w * 4) / 3, x = (size - w) / 2, y = (size - h) / 2;
  const r = w / 2, foot = Math.max(1, size * 0.03), spring = y + r, bot = y + h;
  const d = `M${x} ${bot - foot}V${spring}A${r} ${r} 0 0 1 ${x + w} ${spring}V${bot - foot}A${foot} ${foot} 0 0 1 ${x + w - foot} ${bot}H${x + foot}A${foot} ${foot} 0 0 1 ${x} ${bot - foot}Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" rx="${Math.max(1, size * 0.09)}" fill="${INK}"/>`
    + `<path d="${d}" fill="none" stroke="${GOLD}" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

async function png(svg: string, out: string, width: number) {
  await sharp(Buffer.from(svg), { density: 384 }).resize({ width }).png().toFile(out);
  console.log('•', path.relative(process.cwd(), out));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // Stroke per size: the same calibration as the favicon, extended to 128.
  const sizes: [number, number][] = [[16, 1.15], [32, 1.7], [48, 2.4], [128, 6]];
  for (const [size, stroke] of sizes) {
    await png(darkArch(size, stroke), path.join(OUT, `icon-${size}.png`), size);
  }
  fs.writeFileSync(path.join(OUT, 'icon.svg'), darkArch(128, 6));
  console.log('•', path.relative(process.cwd(), path.join(OUT, 'icon.svg')));
  console.log('done');
}
void main();
