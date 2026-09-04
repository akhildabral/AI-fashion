// Regenerates favicon + app icons from the OFFICIAL updated ZAUQ assets
// (brand/). Per the V1.0 guide: the English icon (arch + ZAUQ + gold rule)
// is the primary app icon everywhere. The favicon stays the OUTLINED gold arch
// by owner decision (overrides design-system readme §4b #23, which says solid).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const BRAND = path.resolve(process.cwd(), '../brand');
const PUB = path.resolve(process.cwd(), '../frontend/public');
const MOB = path.resolve(process.cwd(), '../mobile/assets');
const INK = '#0B0A09', GOLD = '#D8B26A';
const EN = path.join(BRAND, 'zauq-icon-en-dark.png');      // English app icon 1024
const FAV = path.join(BRAND, 'zauq-favicon-solid.png');    // solid arch 256
const ROUND = path.join(BRAND, 'zauq-favicon-round.png');  // social avatar

async function resize(src: string, out: string, width: number) {
  await sharp(src).resize(width, width, { fit: 'cover', kernel: 'lanczos3' }).png().toFile(out);
  console.log('•', path.relative(process.cwd(), out));
}
// The mark scaled to `scale` of the box, centred, on `ground` (null=transparent).
async function inset(src: string, out: string, box: number, scale: number, ground: string | null) {
  const m = Math.round(box * scale);
  const mark = await sharp(src).resize(m, m, { fit: 'cover' }).png().toBuffer();
  const base = ground
    ? sharp({ create: { width: box, height: box, channels: 4, background: ground } })
    : sharp({ create: { width: box, height: box, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  await base.composite([{ input: mark, gravity: 'centre' }]).png().toFile(out);
  console.log('•', path.relative(process.cwd(), out));
}
// The favicon: the gold arch outline on a solid black ground. Rendered
// natively per size (never downscaled from a big master) so it stays sharp,
// with a stroke calibrated for the target so the hairline doesn't grey out.
function darkArch(size: number, stroke: number, ground: string | null = INK): string {
  const w = size * 0.44, h = (w * 4) / 3, x = (size - w) / 2, y = (size - h) / 2;
  const r = w / 2, foot = Math.max(1, size * 0.03), spring = y + r, bot = y + h;
  const d = `M${x} ${bot - foot}V${spring}A${r} ${r} 0 0 1 ${x + w} ${spring}V${bot - foot}A${foot} ${foot} 0 0 1 ${x + w - foot} ${bot}H${x + foot}A${foot} ${foot} 0 0 1 ${x} ${bot - foot}Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + (ground ? `<rect width="${size}" height="${size}" fill="${ground}"/>` : '')
    + `<path d="${d}" fill="none" stroke="${GOLD}" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// Render an SVG string to a PNG at an optional width.
async function png(svg: string, out: string, width?: number) {
  let img = sharp(Buffer.from(svg), { density: 384 });
  if (width) img = img.resize({ width });
  await img.png().toFile(out);
  console.log('•', path.relative(process.cwd(), out));
}


async function main() {
  // Favicon — the gold arch outline on black. An SVG for modern browsers
  // (crisp at any size), and native PNG fallbacks per size.
  fs.writeFileSync(path.join(PUB, 'favicon.svg'), darkArch(48, 2));
  console.log('•', 'frontend/public/favicon.svg');
  await png(darkArch(16, 1.15), path.join(PUB, 'favicon-16.png'), 16);
  await png(darkArch(32, 1.7), path.join(PUB, 'favicon-32.png'), 32);
  await png(darkArch(48, 2.4), path.join(PUB, 'favicon-48.png'), 48);
  // Web app icons — the English icon on the dark ground.
  await resize(EN, path.join(PUB, 'icon-512.png'), 512);
  await resize(EN, path.join(PUB, 'icon-192.png'), 192);
  await resize(EN, path.join(PUB, 'apple-touch-icon.png'), 180);
  // Maskable — the icon pulled inside the 80% safe zone, full-bleed ink.
  await inset(EN, path.join(PUB, 'icon-maskable-512.png'), 512, 0.78, INK);
  // Mobile.
  await resize(EN, path.join(MOB, 'icon.png'), 1024);
  await inset(EN, path.join(MOB, 'android-icon-foreground.png'), 1024, 0.66, null);
  await inset(EN, path.join(MOB, 'splash-icon.png'), 1024, 0.6, null);
  await png(darkArch(48, 2.4), path.join(MOB, 'favicon.png'), 48);
  console.log('done');
}
void main();
