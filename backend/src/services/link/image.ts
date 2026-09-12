// Downloading the product image for cataloguing and try-on. The bytes are
// transient: they go to the catalog job in memory, never to `originalUrl`,
// and the item keeps only the source URLs. image/* only, 6 MB cap, the
// shop's page as Referer (CDNs often insist), and anything sharp cannot
// re-encode as JPEG/PNG/WebP (AVIF, GIF) is converted to PNG so the rest of
// the pipeline only ever sees the three formats it knows.

import sharp from 'sharp';
import { assertFetchable } from './canonical';
import { browserHeaders, readCappedBytes } from './fetch';
import type { Region } from './registry';

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10_000;

export interface DownloadedImage {
  buffer: Buffer;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  sourceUrl: string;
}

function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'image/avif';
  return null;
}

/** Try each candidate URL in order; the first that yields a real image wins. */
export async function downloadImage(
  urls: string[],
  opts: { region: Region; referer?: string; fetchImpl?: (url: string, init: RequestInit) => Promise<Response> } ,
): Promise<DownloadedImage | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  for (const raw of urls.slice(0, 4)) {
    let url: URL;
    try {
      url = new URL(raw);
      assertFetchable(url);
    } catch {
      continue;
    }
    try {
      const res = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: browserHeaders(opts.region, 'image', opts.referer),
        redirect: 'follow',
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      if (type && !type.startsWith('image/')) continue;
      const { bytes, truncated } = await readCappedBytes(res, MAX_IMAGE_BYTES);
      if (truncated || bytes.length === 0) continue;
      const kind = sniff(bytes);
      if (!kind) continue;
      if (kind === 'image/jpeg' || kind === 'image/png' || kind === 'image/webp') {
        return { buffer: bytes, mime: kind, sourceUrl: url.toString() };
      }
      const png = await sharp(bytes).png().toBuffer();
      return { buffer: png, mime: 'image/png', sourceUrl: url.toString() };
    } catch {
      continue;
    }
  }
  return null;
}
