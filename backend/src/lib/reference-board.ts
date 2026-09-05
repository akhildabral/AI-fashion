import sharp, { type OverlayOptions } from 'sharp';
import './fonts';

// The reference board: the person's photograph on the left, a light panel of
// numbered garment pictures on the right, as ONE image. A single-image edit
// is the only mode the image model reliably treats as "change this photo"
// — handed the person and the garments as separate images it re-composes
// the scene and loses the person — so the references ride along inside the
// canvas, and the person's region is cropped back out of the result.

export interface ReferenceBoard {
  data: Buffer;
  mime: 'image/png';
  width: number;
  height: number;
  /** The person's photograph occupies x ∈ [0, personWidth) at full height. */
  personWidth: number;
  /** The panel's cells, in garment order: "1 · TOP", … */
  cells: number;
}

export const BOARD_MAX_HEIGHT = 1024;
const PANEL_BG = '#e9e7e2';
const DIVIDER = '#8c8a86';
const DIVIDER_W = 6;
const CELL_PAD = 14;
const LABEL_H = 30;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function labelSvg(text: string, w: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${LABEL_H}">` +
      `<text x="${CELL_PAD}" y="${LABEL_H - 9}" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="1.5" fill="#1a1a1a">${escapeXml(text)}</text>` +
      `</svg>`,
  );
}

/**
 * Compose the board. `labels` are one per garment, numbered by the caller
 * in the same order the prompt lists them ("1 · TOP").
 */
export async function composeReferenceBoard(person: Buffer, garments: Buffer[], labels: string[]): Promise<ReferenceBoard> {
  const personImg = sharp(person).rotate().flatten({ background: '#ffffff' });
  const meta = await personImg.metadata();
  const srcW = meta.width ?? BOARD_MAX_HEIGHT;
  const srcH = meta.height ?? BOARD_MAX_HEIGHT;
  const scale = Math.min(1, BOARD_MAX_HEIGHT / srcH);
  const H = Math.round(srcH * scale);
  const personW = Math.round(srcW * scale);
  const personPng = await personImg.resize(personW, H, { fit: 'fill' }).png().toBuffer();

  const n = Math.max(1, garments.length);
  const cols = n > 3 ? 2 : 1;
  const rows = Math.ceil(n / cols);
  const cellW = Math.max(220, Math.min(420, Math.round(H * 0.42)));
  const panelW = cellW * cols;
  const cellH = Math.floor(H / rows);
  const width = personW + DIVIDER_W + panelW;

  const composites: OverlayOptions[] = [{ input: personPng, left: 0, top: 0 }];
  composites.push({
    input: { create: { width: DIVIDER_W, height: H, channels: 3, background: DIVIDER } },
    left: personW,
    top: 0,
  });
  for (let i = 0; i < garments.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = personW + DIVIDER_W + col * cellW;
    const y0 = row * cellH;
    const innerW = cellW - CELL_PAD * 2;
    const innerH = cellH - CELL_PAD * 2 - LABEL_H;
    const g = await sharp(garments[i])
      .rotate()
      .flatten({ background: PANEL_BG })
      .resize(innerW, innerH, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    const gm = await sharp(g).metadata();
    const gw = gm.width ?? innerW;
    const gh = gm.height ?? innerH;
    composites.push({ input: g, left: x0 + CELL_PAD + Math.round((innerW - gw) / 2), top: y0 + LABEL_H + CELL_PAD + Math.round((innerH - gh) / 2) });
    composites.push({ input: labelSvg(labels[i] ?? `${i + 1}`, cellW), left: x0, top: y0 });
    if (row > 0) {
      composites.push({ input: { create: { width: cellW, height: 2, channels: 3, background: DIVIDER } }, left: x0, top: y0 });
    }
  }

  const data = await sharp({ create: { width, height: H, channels: 3, background: PANEL_BG } })
    .composite(composites)
    .png()
    .toBuffer();
  return { data, mime: 'image/png', width, height: H, personWidth: personW, cells: n };
}

/**
 * Crop the person's region back out of an edited board. The model usually
 * returns the whole board at its size (or a scaled copy); sometimes it
 * returns the photograph alone. Whichever aspect the result is closer to
 * decides, so a person-only result is kept whole.
 */
export async function cropPersonFromBoard(render: Buffer, board: ReferenceBoard): Promise<Buffer> {
  const meta = await sharp(render).metadata();
  const ow = meta.width ?? board.width;
  const oh = meta.height ?? board.height;
  const aspect = ow / oh;
  const boardAspect = board.width / board.height;
  const personAspect = board.personWidth / board.height;
  if (Math.abs(aspect - personAspect) <= Math.abs(aspect - boardAspect)) return render;
  const cropW = Math.max(1, Math.min(ow, Math.round((board.personWidth / board.width) * ow)));
  // The model answers at its own size (often smaller than the board); the
  // person's region goes back to the size it went in at.
  return sharp(render).extract({ left: 0, top: 0, width: cropW, height: oh }).resize(board.personWidth, board.height, { fit: 'fill' }).png().toBuffer();
}
