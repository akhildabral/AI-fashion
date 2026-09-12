// Canonicalising a shared link. A shop link arrives wrapped (a OneLink with
// the real URL in af_web_dp, an a.co short code, a dl.flipkart.com share),
// dressed in tracking parameters, and often pointing at a page whose own
// canonical tag drops the very thing that names the variant (Flipkart's pid,
// Amazon's child ASIN). This module:
//
//   prepare()          validate the scheme and host, unwrap app-link wrappers,
//                      strip tracking — before anything is fetched
//   resolveRedirects() follow up to 5 redirects with GET and a browser UA,
//                      unwrapping wrappers at each hop, never into a private host
//   canonicalUrlFor()  choose the final canonical URL: rel=canonical, then
//                      og:url, then the retailer's own pattern — always keeping
//                      the variant key from the shared URL

import { isIP } from 'node:net';
import * as cheerio from 'cheerio';
import { LinkError } from './types';
import { isProductUrl, productIdOf, resolveRetailer, safeUrl, type Retailer } from './registry';

export const MAX_HOPS = 5;
export const REDIRECT_TIMEOUT_MS = 10_000;

// Tracking parameters. Exact names and prefixes; the retailer's keepParams
// always win over this list (ClearURLs' `[cilp]id` rule would eat Flipkart's
// pid, which is the one param we must keep).
const STRIP_EXACT = new Set(
  [
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', '_gl', 'srsltid', 'dclid', 'yclid', 'igshid',
    // Amazon
    'ref', 'ref_', 'crid', 'sprefix', 'keywords', 'linkCode', 'ascsubtag', 'tag', 'qid', 'sr', 'th', 'psc', '_encoding',
    'dib', 'dib_tag', 'linkId', 'language', 'smid', 'm', 'pf_rd', 'content-id',
    // Flipkart
    'lid', 'marketplace', 'srno', 'ppn', 'ppt', 'fm', 'st', 'qH', 'ctx', 'nnc', 'cid', 'spm', 'ssid', 'cmpid', 'affid',
    'iid', 'otracker', 'otracker1', 'store', 'q', 'sattr',
    // Noon / others
    'o', 'mc', 'mkt', 'ncid', 'sc_src', 'sc_uid', 'sc_llid', 'sc_lid', 'sc_customer', 'sc_eh',
  ].map((s) => s.toLowerCase()),
);
const STRIP_PREFIX = ['utm_', 'af_', 'pf_rd_', 'pd_rd_', 'otracker', 'affextparam', 'dib', 'sc_', 'mkt_', 'ga_', '_hs', 'hsa_', 'pk_'];

function isTracking(name: string): boolean {
  const n = name.toLowerCase();
  return STRIP_EXACT.has(n) || STRIP_PREFIX.some((p) => n.startsWith(p));
}

/** Drop tracking params; the retailer's keepParams survive whatever the list says. */
export function stripTracking(url: URL, retailer: Retailer | null = resolveRetailer(url)): URL {
  const out = new URL(url.toString());
  const keep = new Set((retailer?.keepParams ?? []).map((k) => k.toLowerCase()));
  for (const name of Array.from(out.searchParams.keys())) {
    if (keep.has(name.toLowerCase())) continue;
    if (isTracking(name)) out.searchParams.delete(name);
  }
  out.hash = '';
  // Amazon's /ref=xyz path suffix is tracking too.
  if (retailer?.id === 'amazon') out.pathname = out.pathname.replace(/\/ref=[^/]*$/i, '');
  if (out.search === '?') out.search = '';
  return out;
}

// ---- Host safety ----------------------------------------------------------

function privateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function privateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80') || s.startsWith('::ffff:');
}

/** Loopback, link-local, RFC1918, metadata and bare-IP hosts never get fetched. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !isIP(h)) return true;
  const v = isIP(h);
  if (v === 4) return privateIPv4(h);
  if (v === 6) return privateIPv6(h);
  return false;
}

/** A URL we are willing to talk to: http(s), a public host, nothing embedded. */
export function assertFetchable(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new LinkError('not-product', 'Only http(s) links can be read.');
  if (url.username || url.password) throw new LinkError('not-product', 'Links with credentials are not read.');
  if (isPrivateHost(url.hostname)) throw new LinkError('not-product', 'That address is not a shop.');
}

// ---- Wrapper unwrapping ---------------------------------------------------

const WRAPPER_PARAMS = ['af_web_dp', 'deep_link_value', 'af_dp', 'url', 'link', 'u', 'redirect', 'redirect_url', 'target'];
const FIRST_LEVEL_ONLY = new Set(['url', 'link', 'u', 'redirect', 'redirect_url', 'target']);

/**
 * Pull the real product URL out of an app-link wrapper (AppsFlyer OneLink and
 * kin carry it in af_web_dp / deep_link_value; generic redirectors in url=).
 * A custom-scheme deep link (`myntra://…`) is searched for an embedded
 * https URL. Generic `url=` style params are only honoured when their value
 * points at a registered retailer, so a shop's own `url` param (if any ever
 * has one) is never mistaken for a wrapper.
 */
export function unwrap(url: URL, depth = 0): URL {
  if (depth >= 4) return url;
  for (const name of WRAPPER_PARAMS) {
    const raw = url.searchParams.get(name);
    if (!raw) continue;
    const candidate = embeddedHttpUrl(raw);
    if (!candidate) continue;
    if (FIRST_LEVEL_ONLY.has(name) && !resolveRetailer(candidate)) continue;
    return unwrap(candidate, depth + 1);
  }
  return url;
}

// Schemes that are real protocols, not an app's deep link: never rewritten to https.
const WEB_SCHEMES = new Set(['ftp:', 'ftps:', 'file:', 'javascript:', 'data:', 'mailto:', 'tel:', 'sms:', 'ws:', 'wss:', 'blob:', 'about:', 'chrome:']);

/** The first http(s) URL inside a string that may itself be a URL, a deep link, or URL-encoded. */
export function embeddedHttpUrl(raw: string): URL | null {
  const tries = [raw];
  try {
    tries.push(decodeURIComponent(raw));
  } catch {
    /* not encoded */
  }
  for (const s of tries) {
    const direct = safeUrl(s);
    if (direct && (direct.protocol === 'http:' || direct.protocol === 'https:')) return direct;
    const m = /https?:\/\/[^\s"'<>]+/i.exec(s);
    if (m) {
      const u = safeUrl(m[0]);
      if (u) return u;
    }
    if (direct && direct.protocol !== 'http:' && direct.protocol !== 'https:' && !WEB_SCHEMES.has(direct.protocol)) {
      // myntra://www.myntra.com/... → https://www.myntra.com/...
      const host = direct.hostname || direct.pathname.replace(/^\/+/, '').split('/')[0];
      if (host && resolveRetailer(`https://${host}`)) {
        const rest = direct.hostname ? direct.pathname + direct.search : '/' + direct.pathname.replace(/^\/+/, '').split('/').slice(1).join('/') + direct.search;
        const u = safeUrl(`https://${host}${rest}`);
        if (u) return u;
      }
      // Any wrapper param on the deep link itself.
      for (const name of WRAPPER_PARAMS) {
        const inner = direct?.searchParams.get(name);
        if (inner) {
          const u = embeddedHttpUrl(inner);
          if (u) return u;
        }
      }
    }
  }
  return null;
}

/** Validate, unwrap and strip a pasted link before any fetch. */
export function prepare(input: string): URL {
  const trimmed = input.trim();
  const found = /^https?:\/\//i.test(trimmed) ? safeUrl(trimmed) : embeddedHttpUrl(trimmed) ?? safeUrl(`https://${trimmed}`);
  if (!found) throw new LinkError('not-product', 'That is not a link I can read.');
  assertFetchable(found);
  const unwrapped = unwrap(found);
  assertFetchable(unwrapped);
  return stripTracking(unwrapped);
}

// ---- Redirects ------------------------------------------------------------

export interface RedirectResult {
  finalUrl: URL;
  response: Response;
  hops: number;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Follow redirects by hand (GET, not HEAD — Amazon answers HEAD with 405),
 * unwrapping wrapper URLs at each hop and refusing to be sent to a private
 * host. The final response is returned with its body unread so the fetcher
 * can apply its size cap.
 */
export async function resolveRedirects(
  start: URL,
  headers: Record<string, string>,
  fetchImpl: FetchLike = fetch,
  opts: { maxHops?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RedirectResult> {
  const maxHops = opts.maxHops ?? MAX_HOPS;
  let current = start;
  for (let hop = 0; ; hop++) {
    assertFetchable(current);
    const res = await fetchImpl(current.toString(), {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? REDIRECT_TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    const isRedirect = res.status >= 300 && res.status < 400 && !!location;
    if (!isRedirect) return { finalUrl: current, response: res, hops: hop };
    await res.body?.cancel().catch(() => undefined);
    if (hop >= maxHops) throw new LinkError('not-product', 'That link redirects too many times.');
    const next = safeUrl(new URL(location, current).toString());
    if (!next) throw new LinkError('not-product', 'That link redirects somewhere unreadable.');
    current = stripTracking(unwrap(next));
  }
}

// ---- The final canonical URL ---------------------------------------------

/** rel=canonical and og:url as the page declares them (absolute, or null). */
export function declaredCanonicals(html: string, base: URL): { canonical: string | null; ogUrl: string | null } {
  const $ = cheerio.load(html);
  const abs = (v: string | undefined): string | null => {
    if (!v) return null;
    try {
      return new URL(v.trim(), base).toString();
    } catch {
      return null;
    }
  };
  return {
    canonical: abs($('link[rel="canonical"]').first().attr('href')),
    ogUrl: abs($('meta[property="og:url"]').first().attr('content')),
  };
}

/**
 * The URL a candidate is stored under. Preference: the page's rel=canonical,
 * then og:url, then the URL we landed on — but the variant the member chose
 * always survives: Amazon is rebuilt as /dp/<child ASIN> from the shared URL
 * (its canonical points at the parent), and Flipkart pid / Zara v1 / ASOS
 * colourWayId are copied over when the declared canonical dropped them.
 */
export function canonicalUrlFor(retailer: Retailer, finalUrl: URL, sharedUrl: URL, html: string | null): string {
  if (retailer.id === 'amazon') {
    const asin = productIdOf(retailer, sharedUrl) ?? productIdOf(retailer, finalUrl);
    const host = /amazon\.[a-z.]+$/i.test(finalUrl.hostname) ? finalUrl.hostname : /amazon\.[a-z.]+$/i.test(sharedUrl.hostname) ? sharedUrl.hostname : 'www.amazon.in';
    if (asin) return `https://${host.replace(/^m\./, 'www.')}/dp/${asin.toUpperCase()}`;
  }
  const declared = html ? declaredCanonicals(html, finalUrl) : { canonical: null, ogUrl: null };
  let chosen: URL | null = null;
  for (const c of [declared.canonical, declared.ogUrl]) {
    const u = c ? safeUrl(c) : null;
    // A declared canonical must still be this shop's product page; anything
    // else (a home page, a category, another host) is ignored.
    if (u && resolveRetailer(u)?.id === retailer.id && isProductUrl(retailer, u)) {
      chosen = u;
      break;
    }
  }
  const out = stripTracking(chosen ?? finalUrl, retailer);
  out.protocol = 'https:';
  for (const p of retailer.keepParams) {
    const v = sharedUrl.searchParams.get(p) ?? finalUrl.searchParams.get(p);
    if (v && !out.searchParams.get(p)) out.searchParams.set(p, v);
  }
  return out.toString();
}
