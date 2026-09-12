// Fetching a product page as the member's browser would: browser-like
// headers, the member's market language, a 10 s ceiling, one retry on a
// network error, one request per retailer per second, and a 3 MB cap on the
// body (JSON-LD and Open Graph live in the head; anything past 3 MB is
// scripts we do not need). Bot walls are recognised and reported as
// `blocked` rather than parsed as an empty product.
//
// The user agent is a Chrome string by default (LINK_USER_AGENT overrides):
// every fetch here is a single, member-initiated read of one page — the same
// request the member's own browser would make — and the research shows nine
// of twelve shops refuse anything that looks like a bot outright.

import { resolveRedirects, type FetchLike } from './canonical';
import { regionOf, type Region, type Retailer } from './registry';
import { LinkError } from './types';

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 3 * 1024 * 1024;
const BUCKET_INTERVAL_MS = 1_000;

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const ACCEPT_LANGUAGE: Record<Region, string> = {
  IN: 'en-IN,en;q=0.9,hi;q=0.7',
  AE: 'en-AE,en;q=0.9,ar;q=0.7',
  UK: 'en-GB,en;q=0.9',
  GLOBAL: 'en-US,en;q=0.9',
};

export function browserHeaders(region: Region, kind: 'page' | 'image' = 'page', referer?: string): Record<string, string> {
  const h: Record<string, string> = {
    'user-agent': process.env.LINK_USER_AGENT || DEFAULT_UA,
    accept:
      kind === 'page'
        ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        : 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'accept-language': ACCEPT_LANGUAGE[region],
    'accept-encoding': 'gzip, deflate, br',
    'upgrade-insecure-requests': '1',
    'sec-fetch-dest': kind === 'page' ? 'document' : 'image',
    'sec-fetch-mode': kind === 'page' ? 'navigate' : 'no-cors',
    'sec-fetch-site': kind === 'page' ? 'none' : 'same-origin',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
  };
  if (referer) h.referer = referer;
  return h;
}

// ---- Per-retailer token bucket (1 req/s, in-process) ----------------------

const nextSlot = new Map<string, number>();

export async function throttle(retailerId: string, now = Date.now(), sleep = delay): Promise<void> {
  const at = Math.max(now, nextSlot.get(retailerId) ?? 0);
  nextSlot.set(retailerId, at + BUCKET_INTERVAL_MS);
  if (at > now) await sleep(at - now);
}

export function resetThrottle(): void {
  nextSlot.clear();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Wall detection -------------------------------------------------------

export type Wall = 'akamai' | 'flipkart-captcha' | 'amazon-wall' | 'shein-challenge' | 'http' | null;

/** Recognise the bot walls the research catalogued; null means the page looks real. */
export function detectWall(status: number, finalUrl: string, html: string, headers?: Headers): Wall {
  const head = html.slice(0, 200_000);
  if (/\/risk\/challenge|captcha_type=/i.test(finalUrl)) return 'shein-challenge';
  if (headers?.get('x-captcha-validate') || /<title>[^<]*Flipkart reCAPTCHA|flipkart.*recaptcha|please verify you are a human/i.test(head)) return 'flipkart-captcha';
  if (/api-services-support@amazon\.com|To discuss automated access to Amazon data|Robot Check|<title>\s*Sorry! Something went wrong/i.test(head)) return 'amazon-wall';
  if (/<title>\s*Access Denied\s*<\/title>|errors\.edgesuite\.net|bm-verify|_abck|<title>\s*Request Rejected/i.test(head) && !/application\/ld\+json/i.test(head)) return 'akamai';
  if (status === 403 || status === 429 || status === 503 || status === 502 || status === 500) return 'http';
  return null;
}

// ---- The page fetch -------------------------------------------------------

export interface PageFetch {
  finalUrl: URL;
  status: number;
  html: string;
  truncated: boolean;
  contentType: string | null;
}

export interface FetchOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Skip the per-retailer bucket (tests). */
  noThrottle?: boolean;
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof LinkError) return false;
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'AbortError' || name === 'TimeoutError') return false;
  return true;
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  return name === 'AbortError' || name === 'TimeoutError';
}

/** Read a body up to the cap as bytes; anything past it is dropped and flagged. */
export async function readCappedBytes(res: Response, cap: number): Promise<{ bytes: Buffer; truncated: boolean }> {
  if (!res.body) {
    const ab = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    const buf = Buffer.from(ab);
    return { bytes: buf.subarray(0, cap), truncated: buf.length > cap };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > cap) {
      chunks.push(value.subarray(0, cap - total));
      total = cap;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return { bytes: Buffer.concat(chunks), truncated };
}

/** The page body as text, capped. */
export async function readCapped(res: Response, cap = MAX_BODY_BYTES): Promise<{ text: string; truncated: boolean }> {
  const { bytes, truncated } = await readCappedBytes(res, cap);
  return { text: bytes.toString('utf8'), truncated };
}

/**
 * GET a product page for a retailer. Throws LinkError('blocked' | 'timeout' |
 * 'not-product'); network errors are retried once.
 */
export async function fetchPage(url: URL, retailer: Retailer, opts: FetchOptions = {}): Promise<PageFetch> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const headers = browserHeaders(regionOf(retailer, url));
  if (!opts.noThrottle) await throttle(retailer.id, Date.now(), opts.sleep);

  const attempt = async (): Promise<PageFetch> => {
    const { finalUrl, response } = await resolveRedirects(url, headers, fetchImpl, { timeoutMs });
    const contentType = response.headers.get('content-type');
    const { text, truncated } = await readCapped(response);
    const wall = detectWall(response.status, finalUrl.toString(), text, response.headers);
    if (wall) throw new LinkError('blocked', `wall:${wall}`);
    if (response.status === 404 || response.status === 410) throw new LinkError('not-product', 'That page is gone.');
    if (response.status < 200 || response.status >= 300) throw new LinkError('blocked', `http:${response.status}`);
    if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml|text\/xml/i.test(contentType)) {
      throw new LinkError('not-product', 'That link is not a page.');
    }
    return { finalUrl, status: response.status, html: text, truncated, contentType };
  };

  try {
    return await attempt();
  } catch (err) {
    if (isTimeout(err)) throw new LinkError('timeout', 'The shop took too long to answer.');
    if (!isNetworkError(err)) throw err;
    // One retry, on a fresh socket, after a short breath.
    await (opts.sleep ?? delay)(250);
    try {
      return await attempt();
    } catch (err2) {
      if (isTimeout(err2)) throw new LinkError('timeout', 'The shop took too long to answer.');
      if (err2 instanceof LinkError) throw err2;
      throw new LinkError('blocked', `network:${(err2 as Error)?.message ?? 'unknown'}`);
    }
  }
}
