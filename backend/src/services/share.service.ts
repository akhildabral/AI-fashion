import sharp, { type OverlayOptions } from 'sharp';
import { composeLook, dressingOrder } from '../lib/flatlay';
import { readStored } from '../lib/storage';
import { CARD_FONTS } from '../lib/fonts';

// Share cards: one image per thing (an outfit, a piece, a look you wore) in
// our frame — the arch, the brass line, the wordmark — so what leaves the
// app still looks like us. 1080×1350 (4:5), the size every feed accepts.

const W = 1080;
const H = 1350;
const NIGHT = { bg: '#0E0D0B', ink: '#ECE5D8', muted: '#A79E8A', brass: '#C8A45E', brassHi: '#E4CB94', brassLo: '#8F6E32', niche0: '#fdfbf6', niche1: '#efe7d7' };

export interface CardItem {
  id: string;
  imageUrl: string;
  category: string;
  subtype: string | null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A brass-bezelled arch with a lit niche, drawn as SVG.
function archSvg(x: number, y: number, w: number, h: number): string {
  const r = w * 0.46;
  const ry = h * 0.28;
  const path = (dx: number, dy: number, ww: number, hh: number, rx: number, ryy: number) =>
    `M${dx},${dy + ryy} A${rx},${ryy} 0 0 1 ${dx + ww},${dy + ryy} L${dx + ww},${dy + hh - 5} Q${dx + ww},${dy + hh} ${dx + ww - 5},${dy + hh} L${dx + 5},${dy + hh} Q${dx},${dy + hh} ${dx},${dy + hh - 5} Z`;
  return `
  <defs>
    <linearGradient id="bezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NIGHT.brassHi}"/><stop offset=".62" stop-color="${NIGHT.brassLo}"/><stop offset="1" stop-color="${NIGHT.brassLo}"/></linearGradient>
    <radialGradient id="niche" cx="50%" cy="30%" r="78%"><stop offset="0" stop-color="${NIGHT.niche0}"/><stop offset=".96" stop-color="${NIGHT.niche1}"/></radialGradient>
    <clipPath id="clip"><path d="${path(x + 3, y + 3, w - 6, h - 6, r - 3, ry - 3)}"/></clipPath>
  </defs>
  <path d="${path(x, y, w, h, r, ry)}" fill="url(#bezel)"/>
  <path d="${path(x + 3, y + 3, w - 6, h - 6, r - 3, ry - 3)}" fill="url(#niche)"/>`;
}

async function trimmed(imageUrl: string, boxW: number, boxH: number): Promise<{ buf: Buffer; w: number; h: number } | null> {
  try {
    const raw = await readStored(imageUrl);
    const img = sharp(raw).ensureAlpha().trim({ threshold: 8 });
    const meta = await img.metadata();
    const iw = meta.width ?? 1;
    const ih = meta.height ?? 1;
    const s = Math.min(boxW / iw, boxH / ih);
    const w = Math.max(1, Math.round(iw * s));
    const h = Math.max(1, Math.round(ih * s));
    const buf = await img.resize(w, h, { fit: 'fill' }).png().toBuffer();
    return { buf, w, h };
  } catch {
    return null;
  }
}

/** The look on its board: items laid out by the same engine as the app. */
export async function renderLookCard(items: CardItem[], opts: { title: string; line?: string; who?: string }): Promise<Buffer> {
  const ordered = dressingOrder(items);
  // Board: an arch 920 wide, 5:4, centred; text under it.
  const bx = 80;
  const by = 120;
  const bw = 920;
  const bh = 736;
  // Measure real aspects first so proportions are honest.
  const measured = await Promise.all(
    ordered.map(async (it) => {
      try {
        const meta = await sharp(await readStored(it.imageUrl)).trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
        return { ...it, aspect: (meta.info.height || 1) / (meta.info.width || 1) };
      } catch {
        return { ...it, aspect: undefined };
      }
    }),
  );
  const placed = composeLook(measured, bw / bh, 0.07);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${NIGHT.bg}"/>
    ${archSvg(bx, by, bw, bh)}
    <text x="80" y="82" font-family="${CARD_FONTS.display}, Georgia, serif" font-weight="600" font-size="34" fill="${NIGHT.ink}">ZAUQ</text>
    <text x="1000" y="82" text-anchor="end" font-family="${CARD_FONTS.text}, sans-serif" font-weight="600" font-size="20" letter-spacing="5" fill="${NIGHT.muted}">${esc((opts.who ? `@${opts.who}` : 'MY STYLIST').toUpperCase())}</text>
    <text x="80" y="960" font-family="${CARD_FONTS.display}, Georgia, serif" font-weight="500" font-size="64" fill="${NIGHT.ink}">${esc(opts.title)}</text>
    ${opts.line ? `<text x="80" y="1020" font-family="${CARD_FONTS.display}, Georgia, serif" font-style="italic" font-size="34" fill="${NIGHT.muted}">${esc(opts.line)}</text>` : ''}
    <rect x="80" y="1250" width="920" height="2" fill="${NIGHT.brassLo}"/>
    <text x="80" y="1300" font-family="${CARD_FONTS.text}, sans-serif" font-size="22" letter-spacing="4" fill="${NIGHT.muted}">${esc(ordered.map((i) => (i.subtype ?? i.category).toUpperCase()).join('  ·  ')).slice(0, 90)}</text>
  </svg>`;

  const layers: OverlayOptions[] = [];
  for (const p of placed) {
    const it = measured[p.index];
    const boxW = Math.round((p.w / 100) * bw);
    const boxH = Math.round((p.h / 100) * bh);
    const t = await trimmed(it.imageUrl, boxW, boxH);
    if (!t) continue;
    const rotated = await sharp(t.buf).rotate(p.rot, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const rm = await sharp(rotated).metadata();
    const left = Math.round(bx + (p.left / 100) * bw + (boxW - (rm.width ?? boxW)) / 2);
    const top = Math.round(by + (p.top / 100) * bh + (boxH - (rm.height ?? boxH)) / 2);
    layers.push({ input: rotated, left, top });
  }
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}

/**
 * An outfit as a picture: the pieces laid out on the lit board, portrait,
 * no text — what a verdict option or a look needs when it isn't a photo.
 */
export async function renderBoard(items: CardItem[], size = 900): Promise<Buffer> {
  const ordered = dressingOrder(items);
  const bw = size;
  const bh = Math.round(size * (4 / 3));
  const measured = await Promise.all(
    ordered.map(async (it) => {
      try {
        const meta = await sharp(await readStored(it.imageUrl)).trim({ threshold: 8 }).toBuffer({ resolveWithObject: true });
        return { ...it, aspect: (meta.info.height || 1) / (meta.info.width || 1) };
      } catch {
        return { ...it, aspect: undefined };
      }
    }),
  );
  const placed = composeLook(measured, bw / bh, 0.08);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}">
    <defs><radialGradient id="n" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#fdfbf6"/><stop offset="1" stop-color="#efe7d7"/></radialGradient></defs>
    <rect width="${bw}" height="${bh}" fill="url(#n)"/>
  </svg>`;
  const layers: OverlayOptions[] = [];
  for (const p of placed) {
    const it = measured[p.index];
    const boxW = Math.round((p.w / 100) * bw);
    const boxH = Math.round((p.h / 100) * bh);
    const t = await trimmed(it.imageUrl, boxW, boxH);
    if (!t) continue;
    const rotated = await sharp(t.buf).rotate(p.rot, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const rm = await sharp(rotated).metadata();
    layers.push({ input: rotated, left: Math.round((p.left / 100) * bw + (boxW - (rm.width ?? boxW)) / 2), top: Math.round((p.top / 100) * bh + (boxH - (rm.height ?? boxH)) / 2) });
  }
  return sharp(Buffer.from(svg)).composite(layers).jpeg({ quality: 86 }).toBuffer();
}

/** One piece in its niche, with its story line. */
export async function renderPieceCard(item: CardItem, opts: { title: string; line?: string; who?: string }): Promise<Buffer> {
  const bx = 190;
  const by = 120;
  const bw = 700;
  const bh = 840;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${NIGHT.bg}"/>
    ${archSvg(bx, by, bw, bh)}
    <text x="80" y="82" font-family="${CARD_FONTS.display}, Georgia, serif" font-weight="600" font-size="34" fill="${NIGHT.ink}">ZAUQ</text>
    <text x="1000" y="82" text-anchor="end" font-family="${CARD_FONTS.text}, sans-serif" font-weight="600" font-size="20" letter-spacing="5" fill="${NIGHT.muted}">${esc((opts.who ? `@${opts.who}` : 'MY CLOSET').toUpperCase())}</text>
    <text x="540" y="1060" text-anchor="middle" font-family="${CARD_FONTS.display}, Georgia, serif" font-weight="500" font-size="64" fill="${NIGHT.ink}">${esc(opts.title)}</text>
    ${opts.line ? `<text x="540" y="1120" text-anchor="middle" font-family="${CARD_FONTS.display}, Georgia, serif" font-style="italic" font-size="34" fill="${NIGHT.muted}">${esc(opts.line)}</text>` : ''}
    <rect x="80" y="1250" width="920" height="2" fill="${NIGHT.brassLo}"/>
  </svg>`;
  const t = await trimmed(item.imageUrl, bw - 140, bh - 160);
  const layers: OverlayOptions[] = [];
  if (t) layers.push({ input: t.buf, left: Math.round(bx + (bw - t.w) / 2), top: Math.round(by + (bh - t.h) / 2) });
  return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
}

/** A photo (a Mirror render, or a photo of you in the look) in the tall arch. */
export async function renderPhotoCard(imageUrl: string, opts: { title: string; line?: string; who?: string }): Promise<Buffer> {
  const bx = 190;
  const by = 120;
  const bw = 700;
  const bh = 920;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${NIGHT.bg}"/>
    ${archSvg(bx, by, bw, bh)}
    <text x="80" y="82" font-family="${CARD_FONTS.display}, Georgia, serif" font-weight="600" font-size="34" fill="${NIGHT.ink}">ZAUQ</text>
    <text x="1000" y="82" text-anchor="end" font-family="${CARD_FONTS.text}, sans-serif" font-weight="600" font-size="20" letter-spacing="5" fill="${NIGHT.muted}">${esc((opts.who ? `@${opts.who}` : 'THE MIRROR').toUpperCase())}</text>
    <text x="540" y="1120" text-anchor="middle" font-family="${CARD_FONTS.display}, Georgia, serif" font-weight="500" font-size="60" fill="${NIGHT.ink}">${esc(opts.title)}</text>
    ${opts.line ? `<text x="540" y="1178" text-anchor="middle" font-family="${CARD_FONTS.display}, Georgia, serif" font-style="italic" font-size="32" fill="${NIGHT.muted}">${esc(opts.line)}</text>` : ''}
    <rect x="80" y="1250" width="920" height="2" fill="${NIGHT.brassLo}"/>
  </svg>`;
  const base = sharp(Buffer.from(svg));
  try {
    const raw = await readStored(imageUrl);
    const photo = await sharp(raw).resize(bw - 6, bh - 6, { fit: 'cover', position: 'attention' }).png().toBuffer();
    // Clip the photo to the arch with a mask.
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bw - 6}" height="${bh - 6}"><path d="M0,${(bh - 6) * 0.28} A${(bw - 6) * 0.46},${(bh - 6) * 0.28} 0 0 1 ${bw - 6},${(bh - 6) * 0.28} L${bw - 6},${bh - 11} Q${bw - 6},${bh - 6} ${bw - 11},${bh - 6} L5,${bh - 6} Q0,${bh - 6} 0,${bh - 11} Z" fill="#fff"/></svg>`,
    );
    const clipped = await sharp(photo).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    return base.composite([{ input: clipped, left: bx + 3, top: by + 3 }]).png().toBuffer();
  } catch {
    return base.png().toBuffer();
  }
}
