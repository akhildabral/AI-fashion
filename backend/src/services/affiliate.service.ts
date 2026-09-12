import { logger } from '../lib/logger';

// Affiliate link wrapping: configuration, not code. AFFILIATE_LINKS is a JSON
// object of retailer (or hostname fragment) → URL template; a retailer with
// no template gets the canonical link unchanged and is not labelled. The
// member sees "Affiliate" inline whenever the wrapped link is used (R11).
//
//   AFFILIATE_LINKS='{"amazon.in":"https://www.amazon.in/dp/{asin}?tag=zauq-21",
//                     "flipkart":"https://dl.flipkart.com/dl/{path}?affid=zauq"}'
//
// Placeholders: {url} (the canonical link, URL-encoded), {raw} (as is),
// {host}, {path} (path without the leading slash, plus the query), {query},
// {asin} (Amazon /dp/ or /gp/product/ id), {pid} (Flipkart pid), {id}
// (whichever of asin or pid matched, else the last path segment).

export interface OutboundLink {
  url: string;
  affiliate: boolean;
}

type Templates = Record<string, string>;

let cache: { raw: string | undefined; templates: Templates } | null = null;

/** The configured templates; a malformed env is logged once and treated as empty. */
export function affiliateTemplates(raw: string | undefined = process.env.AFFILIATE_LINKS): Templates {
  if (cache && cache.raw === raw) return cache.templates;
  let templates: Templates = {};
  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'string' && /^https?:\/\//.test(v)) templates[k.toLowerCase()] = v;
        }
      } else {
        logger.warn('AFFILIATE_LINKS is not a JSON object; no links will be wrapped');
      }
    } catch (err) {
      logger.warn({ err }, 'AFFILIATE_LINKS is not valid JSON; no links will be wrapped');
      templates = {};
    }
  }
  cache = { raw, templates };
  return templates;
}

function templateFor(templates: Templates, host: string, retailer: string | null): string | null {
  const r = retailer?.toLowerCase() ?? '';
  if (r && templates[r]) return templates[r];
  // Hostname match, most specific key first ("amazon.in" before "amazon").
  const keys = Object.keys(templates).sort((a, b) => b.length - a.length);
  for (const k of keys) if (host === k || host.endsWith(`.${k}`) || host.includes(k)) return templates[k];
  return null;
}

/**
 * Wrap a shop link in the retailer's affiliate template when one is
 * configured; the canonical URL, unlabelled, otherwise. Never throws: a bad
 * URL or a template that fails to fill comes back unchanged.
 */
export function wrapOutbound(url: string, retailer: string | null | undefined, raw: string | undefined = process.env.AFFILIATE_LINKS): OutboundLink {
  const plain: OutboundLink = { url, affiliate: false };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return plain;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return plain;
  const templates = affiliateTemplates(raw);
  const template = templateFor(templates, parsed.hostname.toLowerCase().replace(/^www\./, ''), retailer ?? null);
  if (!template) return plain;

  const asin = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?=[/?]|$)/i.exec(parsed.pathname)?.[1] ?? null;
  const pid = parsed.searchParams.get('pid') ?? /\/p\/(itm[a-z0-9]+)/i.exec(parsed.pathname)?.[1] ?? null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  const values: Record<string, string | null> = {
    url: encodeURIComponent(url),
    raw: url,
    host: parsed.hostname,
    path: `${parsed.pathname.replace(/^\//, '')}${parsed.search}`,
    query: parsed.search.replace(/^\?/, ''),
    asin,
    pid,
    id: asin ?? pid ?? segments[segments.length - 1] ?? null,
  };
  let missing = false;
  const filled = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = values[key];
    if (v == null) {
      missing = true;
      return '';
    }
    return v;
  });
  if (missing) return plain;
  try {
    new URL(filled);
  } catch {
    return plain;
  }
  return { url: filled, affiliate: true };
}
