import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { composeReferenceBoard, cropPersonFromBoard } from './reference-board';

// The board: the person on the left at full height, a panel of numbered
// cut-outs on the right, and the person cropped back out of whatever size
// the model answers in.

async function solid(w: number, h: number, rgb: { r: number; g: number; b: number }, alpha = 255): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { ...rgb, alpha } } })
    .png()
    .toBuffer();
}

describe('composeReferenceBoard', () => {
  it('keeps the person at the left edge, full height, and adds one cell per garment', async () => {
    const person = await solid(600, 900, { r: 10, g: 20, b: 30 });
    const garments = [await solid(300, 300, { r: 200, g: 0, b: 0 }), await solid(300, 500, { r: 0, g: 200, b: 0 }), await solid(200, 200, { r: 0, g: 0, b: 200 })];
    const board = await composeReferenceBoard(person, garments, ['1 · TOP', '2 · BOTTOM', '3 · SHOES']);
    expect(board.height).toBe(900);
    expect(board.personWidth).toBe(600);
    expect(board.width).toBeGreaterThan(600 + 200);
    expect(board.cells).toBe(3);
    const meta = await sharp(board.data).metadata();
    expect([meta.width, meta.height]).toEqual([board.width, board.height]);
    // The person's pixels are untouched at the left; the panel is light to the right.
    const { data, info } = await sharp(board.data).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => Array.from(data.subarray((y * board.width + x) * info.channels, (y * board.width + x) * info.channels + 3));
    expect(px(10, 10)).toEqual([10, 20, 30]);
    expect(px(board.width - 5, board.height - 5)[0]).toBeGreaterThan(200);
  });

  it('scales a tall photo down to the board height and keeps its aspect', async () => {
    const person = await solid(1000, 2000, { r: 1, g: 2, b: 3 });
    const board = await composeReferenceBoard(person, [await solid(100, 100, { r: 9, g: 9, b: 9 })], ['1 · TOP']);
    expect(board.height).toBe(1024);
    expect(board.personWidth).toBe(512);
  });
});

describe('cropPersonFromBoard', () => {
  it('crops the person’s share of a full-board answer, whatever its size, back to the size it went in at', async () => {
    const board = { data: Buffer.alloc(0), mime: 'image/png' as const, width: 1000, height: 800, personWidth: 600, cells: 2 };
    const answer = await solid(500, 400, { r: 5, g: 5, b: 5 });
    const out = await cropPersonFromBoard(answer, board);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([600, 800]);
  });

  it('keeps a person-only answer whole', async () => {
    const board = { data: Buffer.alloc(0), mime: 'image/png' as const, width: 1000, height: 800, personWidth: 600, cells: 2 };
    const answer = await solid(600, 800, { r: 5, g: 5, b: 5 });
    const out = await cropPersonFromBoard(answer, board);
    expect(out.equals(answer)).toBe(true);
  });
});
