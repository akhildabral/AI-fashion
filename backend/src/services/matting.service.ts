import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { env } from '../config/env';

// Pixel-preserving background removal, run locally with onnxruntime. This
// replaces generative background cleanup: an image edit re-renders the garment
// and can change its color, pattern, and shape — catalog corruption — and
// costs ~5-10¢ per item. Matting preserves the user's actual pixels, runs in
// ~1s, and costs nothing.
//
// The result is post-processed for a catalog look: the alpha is sharpened to
// kill ghosting, and the cutout is auto-cropped to the garment and centered
// on a square transparent canvas. Quality gates reject uncertain masks, so
// every failure path returns null and callers keep the original photo.

interface ModelSpec {
  file: string;
  url: string;
  inputSize: number;
  mean: [number, number, number];
  std: [number, number, number];
}

const REMBG_RELEASE = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0';

// isnet-general-use (~170 MB) is the default: dramatically better than the
// tiny u2netp on real-world cluttered photos. u2netp stays available for
// low-resource setups via MATTING_MODEL=u2netp.
const MODELS: Record<string, ModelSpec> = {
  'isnet-general-use': {
    file: 'isnet-general-use.onnx',
    url: `${REMBG_RELEASE}/isnet-general-use.onnx`,
    inputSize: 1024,
    mean: [0.5, 0.5, 0.5],
    std: [1, 1, 1],
  },
  u2net: {
    file: 'u2net.onnx',
    url: `${REMBG_RELEASE}/u2net.onnx`,
    inputSize: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
  u2netp: {
    file: 'u2netp.onnx',
    url: `${REMBG_RELEASE}/u2netp.onnx`,
    inputSize: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
};

function modelSpec(): ModelSpec {
  const spec = MODELS[env.MATTING_MODEL] ?? MODELS['isnet-general-use'];
  return env.MATTING_MODEL_URL ? { ...spec, url: env.MATTING_MODEL_URL } : spec;
}

let sessionPromise: Promise<import('onnxruntime-node').InferenceSession | null> | null = null;

async function downloadModel(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Model download failed: HTTP ${res.status}`);
  }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.download`;
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(tmp));
  await fs.promises.rename(tmp, dest);
}

async function loadSession(): Promise<import('onnxruntime-node').InferenceSession | null> {
  if (!env.MATTING_ENABLED) return null;
  try {
    const spec = modelSpec();
    const modelPath = path.resolve(process.cwd(), env.MATTING_MODEL_DIR, spec.file);
    if (!fs.existsSync(modelPath)) {
      console.log(`Matting model not cached — downloading ${spec.file}…`);
      await downloadModel(spec.url, modelPath);
    }
    const ort = await import('onnxruntime-node');
    const session = await ort.InferenceSession.create(modelPath);
    console.log(`Matting model loaded (${spec.file})`);
    return session;
  } catch (err) {
    console.error(
      'Matting unavailable — wardrobe uploads will keep their original background:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function getSession() {
  if (!sessionPromise) sessionPromise = loadSession();
  return sessionPromise;
}

// Sharpen the alpha with a smoothstep ramp: confident background/foreground
// snaps to 0/255 and only a narrow band keeps soft edges — this is what kills
// the semi-transparent "ghosting" a weak mask produces.
function sharpenAlpha(a: number, lo = 96, hi = 168): number {
  if (a <= lo) return 0;
  if (a >= hi) return 255;
  const t = (a - lo) / (hi - lo);
  return Math.round(t * t * (3 - 2 * t) * 255);
}

// Garments are solid objects: a transparent region fully enclosed by the
// cutout is almost always a mask error (models lose confidence inside dark or
// low-contrast areas), so fill every background region that isn't connected
// to the image border. Flood fill from the borders over background pixels;
// whatever background remains unreached is a hole.
function fillEnclosedHoles(alpha: Buffer, width: number, height: number): void {
  const total = width * height;
  const reached = new Uint8Array(total);
  const stack: number[] = [];

  const push = (i: number) => {
    if (!reached[i] && alpha[i] < 128) {
      reached[i] = 1;
      stack.push(i);
    }
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < total - width) push(i + width);
  }

  for (let i = 0; i < total; i++) {
    if (alpha[i] < 128 && !reached[i]) alpha[i] = 255;
  }
}

// Stored cutouts are capped to this square size — plenty for catalog cards,
// and it keeps per-item storage in the hundreds of KB instead of tens of MB.
const MAX_OUTPUT_SIDE = 1024;

// Eat one pixel of fringe all round: the last ring of a mask is where the
// background's colour bleeds into the garment (a grey halo on a sheet).
function erodeOnce(alpha: Buffer, width: number, height: number): void {
  const src = Buffer.from(alpha);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (src[i] === 0) continue;
      const up = y > 0 ? src[i - width] : 0;
      const down = y < height - 1 ? src[i + width] : 0;
      const left = x > 0 ? src[i - 1] : 0;
      const right = x < width - 1 ? src[i + 1] : 0;
      const m = Math.min(up, down, left, right);
      if (m < alpha[i]) alpha[i] = Math.round((alpha[i] + m) / 2);
    }
  }
}

export interface MattingResult {
  // PNG with transparent background, cropped to the garment on a square canvas.
  png: Buffer;
  // Raw RGBA pixels of the uncropped cutout, for palette extraction.
  rgba: Buffer;
  width: number;
  height: number;
  // Fraction of the frame the mask kept. A garment photographed against a
  // background rarely fills most of the frame, so a high value usually means
  // the model segmented the whole scene — callers use this to escalate.
  coverage: number;
  /** How much of the mask the model was unsure about, relative to what it kept: 0 = crisp, 0.3+ = hazy. */
  softness: number;
}

export async function removeBackground(image: Buffer): Promise<MattingResult | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    const ort = await import('onnxruntime-node');
    const spec = modelSpec();
    const S = spec.inputSize;

    const meta = await sharp(image).rotate().metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return null;

    // Preprocess: resize, normalize, NCHW float32.
    const resized = await sharp(image)
      .rotate()
      .resize(S, S, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    const n = S * S;
    const input = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        input[c * n + i] = (resized[i * 3 + c] / 255 - spec.mean[c]) / spec.std[c];
      }
    }

    const feeds = {
      [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]),
    };
    const results = await session.run(feeds);
    // First output is the fused saliency/segmentation map.
    const mask = results[session.outputNames[0]].data as Float32Array;

    // Min-max normalize the mask to 0..255.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      if (mask[i] < min) min = mask[i];
      if (mask[i] > max) max = mask[i];
    }
    const range = max - min || 1;
    const maskBytes = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      maskBytes[i] = Math.round(((mask[i] - min) / range) * 255);
    }

    // Upscale the mask to the original size (single channel).
    const { data: alphaRaw, info: alphaInfo } = await sharp(maskBytes, {
      raw: { width: S, height: S, channels: 1 },
    })
      .resize(width, height, { fit: 'fill' })
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (alphaInfo.channels !== 1) return null;

    // Quality gates on the raw mask, before sharpening:
    //  - a mask that keeps almost nothing or almost everything failed;
    //  - a mask that is uncertain over a large area (mid-alpha) failed.
    const total = width * height;
    let kept = 0;
    let uncertain = 0;
    for (let i = 0; i < total; i++) {
      if (alphaRaw[i] > 128) kept++;
      if (alphaRaw[i] > 60 && alphaRaw[i] < 180) uncertain++;
    }
    const keptShare = kept / total;
    if (keptShare < 0.03 || keptShare > 0.95) return null;
    if (uncertain / total > 0.25) return null;
    const softness = kept > 0 ? uncertain / kept : 1;

    const alpha = Buffer.alloc(total);
    for (let i = 0; i < total; i++) alpha[i] = sharpenAlpha(alphaRaw[i]);
    erodeOnce(alpha, width, height);
    fillEnclosedHoles(alpha, width, height);

    // Two steps: sharp applies operations in a fixed internal order, so
    // removeAlpha and joinChannel cannot live in the same pipeline.
    const rgb = await sharp(image).rotate().removeAlpha().raw().toBuffer();
    const { data: rgba, info } = await sharp(rgb, { raw: { width, height, channels: 3 } })
      .joinChannel(alpha, { raw: { width, height, channels: 1 } })
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height || info.channels !== 4) return null;

    // Auto-crop TIGHT to the garment's bounding box (its true aspect). We do
    // NOT pad it out to a square: a square canvas adds big transparent margins
    // to tall or wide garments, and the UI's object-contain then shrinks the
    // garment into the middle of its tile. A tight crop lets the garment fill
    // its frame, so it fills the display niche at its real proportions.
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (rgba[(y * width + x) * 4 + 3] > 32) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    // A tiny even margin so the cutout's edge never touches the frame.
    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    const cropW = Math.min(width, maxX + pad + 1) - left;
    const cropH = Math.min(height, maxY + pad + 1) - top;

    // Tight crop at the garment's true aspect, capped to MAX_OUTPUT_SIDE on its
    // longer edge (fit:inside preserves aspect — never distorts, never pads).
    const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
      .extract({ left, top, width: cropW, height: cropH })
      .resize(MAX_OUTPUT_SIDE, MAX_OUTPUT_SIDE, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    return { png, rgba, width, height, coverage: keptShare, softness };
  } catch (err) {
    console.error('Matting failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
