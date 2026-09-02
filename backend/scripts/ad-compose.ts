// Composes finished ZAUQ social ads from the raw backgrounds: a legibility
// scrim, the ZAUQ wordmark, a serif headline, a subline, and a CTA — at the
// three Instagram/Facebook sizes. Run: npx tsx scripts/ad-compose.ts
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BASEDIR = process.env.ADS_OUT || require('node:path').resolve(process.cwd(), 'marketing/ads');
const RAW = BASEDIR + '/raw';
const OUT = BASEDIR + '/final';
require('node:fs').mkdirSync(OUT, { recursive: true });
const GOLD = '#D8B26A', CREAM = '#F2EDE3', INK = '#0B0A09', MUTED = '#B9AE97';
const SERIF = 'Bodoni Moda', WORD = 'Playfair Display', SANS = 'Archivo';

type Size = 'sq' | 'pt' | 'st';
const DIM: Record<Size, [number, number]> = { sq: [1080, 1080], pt: [1080, 1350], st: [1080, 1920] };

interface Ad {
  key: string; bg: string; size: Size;
  head: string[];          // hand-broken headline lines
  sub?: string;
  cta?: string;
  pos?: 'bottom' | 'top';  // where the copy block sits
  headSize?: number;
  accent?: number;         // index of a headline line to set in gold italic
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The ZAUQ wordmark as kerned Playfair (guide: ZA .24em, AU .20em, UQ .16em).
function wordmark(cx: number, y: number, size: number, fill: string): string {
  const k = (em: number) => (size * em).toFixed(1);
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${WORD}" font-weight="400" font-size="${size}" fill="${fill}" letter-spacing="0"><tspan>Z</tspan><tspan dx="${k(0.24)}">A</tspan><tspan dx="${k(0.2)}">U</tspan><tspan dx="${k(0.16)}">Q</tspan></text>`;
}
// The small arch mark, centred at (cx, topY), height h.
function archMark(cx: number, topY: number, h: number, stroke: string, ink: string): string {
  const w = (h * 3) / 4, s = h / 400, x = cx - w / 2;
  return `<g transform="translate(${x} ${topY}) scale(${s})"><path d="M4 392V150A146 146 0 0 1 296 150V392A4 4 0 0 1 292 396H8A4 4 0 0 1 4 392Z" fill="none" stroke="${stroke}" stroke-width="${6 / s}"/><text x="150" y="316" text-anchor="middle" font-family="Noto Nastaliq Urdu" font-weight="600" font-size="52" fill="${ink}" direction="rtl">ذوق</text><rect x="119" y="333" width="62" height="4" fill="${stroke}"/></g>`;
}

const ADS: Ad[] = [
  { key: 'nothing-to-wear', bg: 'mirror-empty', size: 'st', pos: 'bottom', head: ['A full closet.', 'Nothing to wear.'], accent: 1, sub: 'ZAUQ styles what you already own. Every morning, an outfit — already waiting.', cta: 'Join the waitlist · myzauq.com' },
  { key: 'see-it-on-you', bg: 'woman-mirror', size: 'pt', pos: 'bottom', head: ['See it on you', 'before you wear it.'], accent: 1, sub: 'The Mirror renders any outfit on your own photo.', cta: 'myzauq.com' },
  { key: 'the-math', bg: 'flatlay-outfit', size: 'sq', pos: 'top', head: ['43 pieces.', '1,200 outfits.', 'Nothing bought.'], accent: 1, sub: 'ZAUQ does the math on the wardrobe you already have.', cta: 'myzauq.com' },
  { key: 'already-in-your-closet', bg: 'rail-garments', size: 'pt', pos: 'bottom', head: ['Your next favourite', 'outfit is already', 'in your closet.'], accent: 1, sub: 'ZAUQ finds it. No shopping required.', cta: 'Join the waitlist' },
  { key: 'wear-what-you-own', bg: 'vitrine-single', size: 'st', pos: 'bottom', head: ['Wear what', 'you own.', 'Beautifully.'], accent: 2, sub: 'Style, without the endless shopping.', cta: 'myzauq.com' },
  { key: 'taste', bg: 'arch-portrait', size: 'pt', pos: 'bottom', head: ['ZAUQ', 'noun — taste.'], accent: 1, headSize: 132, sub: 'ذوق · your personal stylist, for the clothes you own.', cta: 'myzauq.com', },
  { key: 'coffee-outfit-done', bg: 'coffee-morning', size: 'sq', pos: 'bottom', head: ['Coffee.', 'Outfit.', 'Done.'], accent: 1, sub: 'ZAUQ lays out your look while you sleep.', cta: 'myzauq.com' },
  { key: 'same-shirt-thrice', bg: 'closet-chaos-calm', size: 'pt', pos: 'bottom', head: ['You’ve bought the', 'same white shirt', 'three times.'], accent: 1, sub: 'ZAUQ knows your closet better than you do.', cta: 'Meet ZAUQ · myzauq.com' },
  { key: 'already-waiting', bg: 'wardrobe-light', size: 'st', pos: 'bottom', head: ['Every morning,', 'an outfit —', 'already waiting.'], accent: 2, sub: 'Your wardrobe, styled for you before you wake.', cta: 'Join the waitlist' },
  { key: 'stylist-in-pocket', bg: 'hands-lapel', size: 'sq', pos: 'top', head: ['A personal stylist,', 'in your pocket.'], accent: 1, sub: 'ZAUQ dresses you from the clothes you already own.', cta: 'myzauq.com' },
  { key: 'blazer-twice', bg: 'shoes-pair', size: 'pt', pos: 'bottom', head: ['That blazer you', 'wore twice?', 'Let’s fix that.'], accent: 2, sub: 'ZAUQ turns a tired closet into hundreds of outfits.', cta: 'myzauq.com' },
  { key: 'like-a-stylist', bg: 'silhouette-window', size: 'st', pos: 'bottom', head: ['Get dressed like', 'you have a stylist.', 'You do now.'], accent: 2, sub: 'ZAUQ — your daily stylist.', cta: 'Join the waitlist · myzauq.com' },
  { key: 'restyled-daily', bg: 'collar-jewellery', size: 'sq', pos: 'bottom', head: ['The clothes you own,', 'restyled every day.'], accent: 1, sub: 'Outfits, try-on, and a wear journal. One app.', cta: 'myzauq.com' },
  { key: 'pure-brand', bg: 'brass-texture-bg', size: 'sq', pos: 'bottom', head: ['taste,', 'styled daily.'], accent: 0, sub: 'ZAUQ (ذوق) — your personal AI stylist.', cta: 'myzauq.com' },
  { key: 'dressing-ritual', bg: 'dressing-scene', size: 'pt', pos: 'bottom', head: ['Make getting', 'dressed the best', 'part of your day.'], accent: 1, sub: 'ZAUQ lays out the look; you just wear it.', cta: 'myzauq.com' },
  { key: 'pack-a-week', bg: 'packing-travel', size: 'pt', pos: 'bottom', head: ['Pack for a week', 'in ten minutes.'], accent: 1, sub: 'ZAUQ builds a capsule from your own closet for any trip.', cta: 'myzauq.com' },
  { key: 'works-for-him', bg: 'mens-tailoring', size: 'sq', pos: 'bottom', head: ['Get dressed', 'like you mean it.'], accent: 1, sub: 'ZAUQ styles your wardrobe into a sharp look a day.', cta: 'myzauq.com' },
  { key: 'delete-shopping-apps', bg: 'phone-in-scene', size: 'sq', pos: 'bottom', head: ['Delete three', 'shopping apps.', 'Keep this one.'], accent: 2, sub: 'ZAUQ makes you love the clothes you already own.', cta: 'myzauq.com' },
  { key: 'one-coat-fifty-ways', bg: 'coat-on-hook', size: 'st', pos: 'bottom', head: ['One coat.', 'Fifty ways', 'to wear it.'], accent: 2, sub: 'ZAUQ finds every outfit hiding in your closet.', cta: 'myzauq.com' },
  { key: 'tonight-laid-out', bg: 'window-chair', size: 'pt', pos: 'bottom', head: ['Tomorrow\u2019s outfit,', 'laid out tonight.'], accent: 1, sub: 'Wake up to a look that\u2019s ready \u2014 by ZAUQ.', cta: 'Join the waitlist' },
  { key: 'which-shoes', bg: 'shoe-shelf', size: 'sq', pos: 'top', head: ['Which shoes?', 'ZAUQ already', 'knows.'], accent: 1, sub: 'It finishes every outfit from your own closet.', cta: 'myzauq.com' },
  { key: 'finishing-touch', bg: 'jewellery-flatlay', size: 'sq', pos: 'top', head: ['The finishing', 'touch, chosen', 'for you.'], accent: 0, sub: 'ZAUQ styles the whole look — down to the jewellery.', cta: 'myzauq.com' },
  { key: 'closet-lookbook', bg: 'lookbook-spread', size: 'pt', pos: 'bottom', head: ['Your closet,', 'as a lookbook.'], accent: 1, sub: 'A look a day from the clothes you already own.', cta: 'myzauq.com' },
];

function overlay(ad: Ad, W: number, H: number): Buffer {
  const M = Math.round(W * 0.09);        // side margin
  const hs = ad.headSize ?? (ad.size === 'sq' ? 88 : 104);
  const lh = hs * 1.06;
  const bottom = ad.pos !== 'top';
  const blockH = ad.head.length * lh + (ad.sub ? 120 : 40) + (ad.cta ? 70 : 0);
  // Baseline of the first headline line.
  const startY = bottom ? H - Math.round(H * 0.11) - blockH + hs : Math.round(H * 0.16) + hs;

  const heads = ad.head.map((line, i) => {
    const gold = i === ad.accent;
    const style = gold ? `font-style="italic" fill="${GOLD}"` : `fill="${CREAM}"`;
    return `<text x="${M}" y="${(startY + i * lh).toFixed(0)}" font-family="${SERIF}" font-weight="500" font-size="${hs}" ${style} letter-spacing="-1">${esc(line)}</text>`;
  }).join('');

  let y = startY + ad.head.length * lh + 6;
  const sub = ad.sub ? `<text x="${M}" y="${(y + 46).toFixed(0)}" font-family="${SANS}" font-weight="400" font-size="30" fill="${MUTED}">${wrapTspans(ad.sub, M, 30, W - 2 * M)}</text>` : '';
  if (ad.sub) y += 46 + subLines(ad.sub, 30, W - 2 * M) * 40 + 30;

  const cta = ad.cta ? `<g transform="translate(${M} ${(y + 4).toFixed(0)})"><rect x="0" y="0" rx="4" width="${Math.min(W - 2 * M, 30 + ad.cta.length * 15)}" height="54" fill="${GOLD}"/><text x="${(30 + ad.cta.length * 15) / 2}" y="35" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="21" letter-spacing="2" fill="${INK}">${esc(ad.cta.toUpperCase())}</text></g>` : '';

  // A feathered ink panel anchored to the copy block itself, so the text
  // reads even over a bright, busy subject. Solid over the words, fading out
  // toward the image. Tracks the block's real extent (y just advanced past it).
  const feather = 190;
  const blockTop = startY - hs - 34;   // a little above the first cap
  const blockBot = y + (ad.cta ? 70 : 8);
  let scrim: string;
  if (bottom) {
    const t0 = Math.max(0, blockTop);
    const stop = Math.min(1, feather / Math.max(1, H - t0));
    scrim = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B0A09" stop-opacity="0"/><stop offset="${stop.toFixed(3)}" stop-color="#0B0A09" stop-opacity="0.86"/><stop offset="1" stop-color="#0B0A09" stop-opacity="0.86"/></linearGradient></defs><rect x="0" y="${t0}" width="${W}" height="${H - t0}" fill="url(#g)"/>`;
  } else {
    const b1 = Math.min(H, blockBot);
    const solid = Math.max(0, 1 - feather / Math.max(1, b1));
    scrim = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B0A09" stop-opacity="0.86"/><stop offset="${solid.toFixed(3)}" stop-color="#0B0A09" stop-opacity="0.86"/><stop offset="1" stop-color="#0B0A09" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="${W}" height="${b1}" fill="url(#g)"/>`;
  }

  // Wordmark: small, opposite the copy block.
  const wmY = bottom ? Math.round(H * 0.085) : H - Math.round(H * 0.06);
  const wm = `${archMark(W / 2, wmY - 44, 52, GOLD, CREAM)}${wordmark(W / 2, wmY + 40, 40, CREAM)}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${scrim}${wm}${heads}${sub}${cta}</svg>`;
  return Buffer.from(svg);
}

// Very rough word-wrap into <tspan> rows (Archivo ~0.52 advance).
function subLines(text: string, fs: number, maxW: number): number {
  const per = Math.max(10, Math.floor(maxW / (fs * 0.5)));
  const words = text.split(' '); let n = 1, len = 0;
  for (const w of words) { if (len + w.length + 1 > per) { n++; len = w.length; } else len += w.length + 1; }
  return n;
}
function wrapTspans(text: string, x: number, fs: number, maxW: number): string {
  const per = Math.max(10, Math.floor(maxW / (fs * 0.5)));
  const words = text.split(' '); const rows: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > per) { rows.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) rows.push(cur.trim());
  return rows.map((r, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : 40}">${esc(r)}</tspan>`).join('');
}

async function main() {
  let ok = 0;
  const manifest: { key: string; size: Size; head: string; file: string }[] = [];
  for (const ad of ADS) {
    const src = path.join(RAW, `${ad.bg}.png`);
    if (!fs.existsSync(src)) { console.log('skip (no bg):', ad.key, '←', ad.bg); continue; }
    const [W, H] = DIM[ad.size];
    const base = await sharp(src).resize(W, H, { fit: 'cover', position: 'attention' }).modulate({ brightness: 0.9 }).toBuffer();
    const out = path.join(OUT, `${ad.key}-${ad.size}.jpg`);
    await sharp(base).composite([{ input: overlay(ad, W, H), top: 0, left: 0 }]).jpeg({ quality: 88 }).toFile(out);
    manifest.push({ key: ad.key, size: ad.size, head: ad.head.join(' '), file: path.basename(out) });
    console.log('✓', path.basename(out));
    ok++;
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n${ok} ads → ${OUT}`);
}
void main();
