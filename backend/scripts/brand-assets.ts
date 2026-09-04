// Renders the ZAUQ raster assets from the brand geometry and faces:
// the social image, the transparent wordmarks for email, and the Android
// adaptive-icon background/monochrome layers. Favicons and app icons come from
// brand-icons.ts. Run: npx tsx scripts/brand-assets.ts && npx tsx scripts/brand-icons.ts
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

process.env.FONTCONFIG_FILE = path.resolve(process.cwd(), 'assets/fonts/fonts.conf');
const GOLD = '#D8B26A', INK = '#0B0A09', CREAM = '#F2EDE3';
const PUB = path.resolve(process.cwd(), '../frontend/public');
const MOB = path.resolve(process.cwd(), '../mobile/assets');
const ARCH = 'M4 392V150A146 146 0 0 1 296 150V392A4 4 0 0 1 292 396H8A4 4 0 0 1 4 392Z';

function wordmark(size: number, fill: string): string {
  // Kerning from the guide: ZA .24em, AU .20em, UQ .16em.
  const k = (em: number) => (size * em).toFixed(1);
  // As offsets between the letters: the renderer ignores letter-spacing on spans.
  return `<text text-anchor="middle" font-family="Playfair Display" font-weight="400" font-size="${size}" fill="${fill}"><tspan>Z</tspan><tspan dx="${k(0.24)}">A</tspan><tspan dx="${k(0.2)}">U</tspan><tspan dx="${k(0.16)}">Q</tspan></text>`;
}
function mark(variant: 'script' | 'mirror' | 'bare', stroke: string, ink: string, strokeWidth = 4): string {
  const script = variant === 'script'
    ? `<text x="150" y="316" text-anchor="middle" font-family="Noto Nastaliq Urdu" font-weight="600" font-size="50" fill="${ink}" direction="rtl">ذوق</text><rect x="119" y="333" width="62" height="3" fill="${stroke}"/>`
    : '';
  return `<path d="${ARCH}" fill="none" stroke="${stroke}" stroke-width="${variant === 'bare' ? 6 : strokeWidth}"/>${script}`;
}
/** The mark centred in a square of `box`, arch height = `share` of the box. */
function squareIcon(box: number, ground: string | null, variant: 'script' | 'mirror' | 'bare', stroke: string, ink: string, share = 0.54): string {
  const h = box * share, w = (h * 3) / 4, x = (box - w) / 2, y = (box - h) / 2, s = h / 400;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">${ground ? `<rect width="${box}" height="${box}" fill="${ground}"/>` : ''}<g transform="translate(${x} ${y}) scale(${s})">${mark(variant, stroke, ink, 4 / Math.sqrt(s) * 0.9)}</g></svg>`;
}
async function png(svg: string, out: string, opts: { width?: number } = {}) {
  let img = sharp(Buffer.from(svg), { density: 192 });
  if (opts.width) img = img.resize({ width: opts.width });
  await img.png().toFile(out);
  console.log('wrote', path.relative(process.cwd(), out));
}
async function main() {
  // Favicons and app icons are owned by brand-icons.ts (solid favicon, English
  // icon primary — design system readme §4b #23). This script keeps the social
  // image and the transparent email wordmarks.
  // The social image: the mark above the wordmark, on the dark ground.
  // Construction (readme §4b #24, brand-guidelines §4 and §12): the wordmark
  // stands alone — no rule and no tagline locked to it. The rule belongs to the
  // ceremonial lockup; the tagline is a separate layout element in tracked
  // Archivo, set well outside the wordmark's clear space (one cap height) and
  // never at wordmark scale.
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${INK}"/><g transform="translate(548 150) scale(0.26)">${mark('script', GOLD, CREAM)}</g><g transform="translate(600 355)">${wordmark(84, CREAM)}</g><text x="600" y="548" text-anchor="middle" font-family="Archivo" font-weight="600" font-size="16" letter-spacing="5" fill="#A79E8A">YOUR PERSONAL STYLIST · MYZAUQ.COM</text></svg>`;
  await sharp(Buffer.from(og), { density: 192 }).resize({ width: 1200 }).jpeg({ quality: 90 }).toFile(path.join(PUB, 'landing/og.jpg'));
  console.log('wrote landing/og.jpg');
  // Transparent wordmarks for email (ink on light mail, cream on dark).
  for (const [fill, name] of [[INK, 'zauq-wordmark-ink.png'], [CREAM, 'zauq-wordmark-cream.png'], [GOLD, 'zauq-wordmark-gold.png']] as const) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="150" viewBox="0 0 600 150"><g transform="translate(300 100)">${wordmark(64, fill)}</g></svg>`;
    await png(svg, path.join(PUB, 'brand', name), { width: 600 });
  }
  // The mark alone, transparent, for pages and the mobile foreground.
  await png(squareIcon(1024, null, 'script', GOLD, CREAM, 0.54), path.join(PUB, 'brand', 'zauq-mark-cream.png'), { width: 512 });
  await png(squareIcon(1024, null, 'script', GOLD, INK, 0.54), path.join(PUB, 'brand', 'zauq-mark-ink.png'), { width: 512 });
  // Mobile: only the adaptive background and monochrome layers live here. The
  // icon, foreground, splash and favicon are the English icon / solid arch and
  // are written by brand-icons.ts, which must run after this script.
  if (fs.existsSync(MOB)) {
    await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${INK}"/></svg>`, path.join(MOB, 'android-icon-background.png'));
    await png(squareIcon(1024, null, 'script', '#FFFFFF', '#FFFFFF', 0.42), path.join(MOB, 'android-icon-monochrome.png'));
  }
}
void main();
