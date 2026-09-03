// Regenerates favicon + app icons from the OFFICIAL updated ZAUQ assets
// (brand/). Per the V1.0 guide: the English icon (arch + ZAUQ + gold rule)
// is the primary app icon everywhere; the favicon is the SOLID gold arch.
import path from 'node:path';
import sharp from 'sharp';
const BRAND = path.resolve(process.cwd(), '../brand');
const PUB = path.resolve(process.cwd(), '../frontend/public');
const MOB = path.resolve(process.cwd(), '../mobile/assets');
const INK = '#0B0A09';
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
async function main() {
  // Favicon — the solid gold arch, downsampled per size.
  await resize(FAV, path.join(PUB, 'favicon-16.png'), 16);
  await resize(FAV, path.join(PUB, 'favicon-32.png'), 32);
  await resize(FAV, path.join(PUB, 'favicon-48.png'), 48);
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
  await resize(FAV, path.join(MOB, 'favicon.png'), 48);
  console.log('done');
}
void main();
