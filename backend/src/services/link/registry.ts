// The retailer registry: which shops the reader knows, how to recognise a
// product page, which inline parser (if any) reads the page's own state, and
// the kill switch. Hostnames are matched on the registrable domain, so
// www./m./dl. subdomains all land on the same entry.
//
// Kill switch: LINK_DISABLED_RETAILERS=comma,separated,ids (read at call time,
// so a restart is not needed for tests and a redeploy is enough in production).

export type Region = 'IN' | 'AE' | 'UK' | 'GLOBAL';

export type InlineParser = 'amazon' | 'uniqlo';

export interface Retailer {
  id: string;
  name: string;
  /** Fixed, or worked out from the URL (Amazon/Next by TLD, global shops by market path). */
  region: Region | ((url: URL) => Region);
  /** Registrable domains (and short-link domains) that belong to this shop. */
  domains: string[];
  /** Matches a product page's path (+ search); group 1 is the product id. */
  idPattern: RegExp;
  /** Query params that identify the variant and must survive canonicalisation. */
  keepParams: string[];
  /** A page-state parser that runs after JSON-LD and Open Graph. */
  parser: InlineParser | null;
  enabled: boolean;
  /** The shop photographs garments flat or on a ghost mannequin, so the studio
   *  re-render can be skipped. Shops that shoot on-model need it to become a
   *  cut-out. Default: on-model. */
  flatShots?: boolean;
}

const marketRegion = (url: URL): Region => {
  const p = url.pathname.toLowerCase();
  if (/^\/(in|en-in|en_in)(\/|$)/.test(p)) return 'IN';
  if (/^\/(ae|en-ae|en_ae|uae-en|uae-ar)(\/|$)/.test(p)) return 'AE';
  if (/^\/(uk|en-gb|en_gb)(\/|$)/.test(p)) return 'UK';
  return 'GLOBAL';
};

const tldRegion = (url: URL): Region => {
  const h = url.hostname.toLowerCase();
  if (h.endsWith('.in')) return 'IN';
  if (h.endsWith('.ae')) return 'AE';
  if (h.endsWith('.co.uk')) return 'UK';
  return 'GLOBAL';
};

export const RETAILERS: Retailer[] = [
  {
    id: 'amazon',
    name: 'Amazon',
    region: tldRegion,
    domains: ['amazon.in', 'amazon.ae', 'a.co', 'amzn.in', 'amzn.to', 'amzn.eu'],
    // /dp/ASIN, /gp/product/ASIN, /gp/aw/d/ASIN, /<slug>/dp/ASIN
    idPattern: /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?=[/?#]|$)/i,
    keepParams: [],
    parser: 'amazon',
    enabled: true,
  },
  {
    id: 'myntra',
    name: 'Myntra',
    region: 'IN',
    domains: ['myntra.com', 'myntra.onelink.me'],
    idPattern: /\/(\d{5,})\/buy(?=[/?#]|$)/,
    keepParams: [],
    parser: null,
    enabled: true,
  },
  {
    id: 'flipkart',
    name: 'Flipkart',
    region: 'IN',
    domains: ['flipkart.com', 'dl.flipkart.com', 'fkrt.it', 'fkrt.cc', 'fkrt.co'],
    idPattern: /\/p\/(itm[0-9a-z]+)(?=[/?#]|$)/i,
    keepParams: ['pid'],
    parser: null,
    enabled: true,
  },
  {
    id: 'ajio',
    name: 'AJIO',
    region: 'IN',
    domains: ['ajio.com'],
    idPattern: /\/p\/(\d{6,})(?=[/?#]|$)/,
    keepParams: [],
    parser: null,
    enabled: true,
  },
  {
    id: 'namshi',
    name: 'Namshi',
    region: 'AE',
    domains: ['namshi.com'],
    idPattern: /\/([A-Z0-9]{6,})\/p(?=[/?#]|$)/i,
    keepParams: [],
    parser: null,
    enabled: true,
  },
  {
    id: 'noon',
    name: 'noon',
    region: 'AE',
    domains: ['noon.com'],
    idPattern: /\/([NZ][A-Z0-9]{6,})\/p(?=[/?#]|$)/i,
    keepParams: [],
    parser: null,
    enabled: true,
  },
  {
    id: 'next',
    name: 'Next',
    region: tldRegion,
    domains: ['next.co.uk', 'next.ae'],
    idPattern: /\/style\/(st\d{5,})\/\w+(?=[/?#]|$)/i,
    keepParams: [],
    parser: null,
    enabled: true,
  },
  {
    id: 'zara',
    name: 'Zara',
    region: marketRegion,
    domains: ['zara.com'],
    idPattern: /-p(\d{8})\.html(?=[/?#]|$)/i,
    keepParams: ['v1'],
    parser: null,
    enabled: true,
  },
  {
    id: 'hm',
    name: 'H&M',
    region: marketRegion,
    domains: ['hm.com', 'www2.hm.com'],
    idPattern: /productpage\.(\d{7,})\.html(?=[/?#]|$)/i,
    keepParams: [],
    parser: null,
    enabled: true,
  },
  {
    id: 'uniqlo',
    name: 'UNIQLO',
    region: marketRegion,
    domains: ['uniqlo.com'],
    idPattern: /\/products\/(E\d{6}-\d{3})(?=[/?#]|$)/i,
    keepParams: [],
    parser: 'uniqlo',
    enabled: true,
    flatShots: true,
  },
  {
    id: 'asos',
    name: 'ASOS',
    region: marketRegion,
    domains: ['asos.com'],
    idPattern: /\/prd\/(\d{6,})(?=[/?#]|$)/i,
    keepParams: ['colourWayId'],
    parser: null,
    enabled: true,
  },
  {
    // CAPTCHA-walled even for a real browser (research §1): registered so the
    // member is sent straight to the screenshot door instead of a dead fetch.
    id: 'shein',
    name: 'SHEIN',
    region: marketRegion,
    domains: ['shein.com', 'shein.in', 'shein.ae', 'shein.co.uk'],
    idPattern: /-p-(\d{6,})(?:-cat-\d+)?\.html(?=[/?#]|$)/i,
    keepParams: [],
    parser: null,
    enabled: false,
  },
];

/** Registrable-domain match: `www.amazon.in` and `amazon.in` both belong to Amazon. */
function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function resolveRetailer(url: URL | string): Retailer | null {
  const u = typeof url === 'string' ? safeUrl(url) : url;
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  return RETAILERS.find((r) => r.domains.some((d) => domainMatches(host, d))) ?? null;
}

export function retailerById(id: string): Retailer | null {
  return RETAILERS.find((r) => r.id === id) ?? null;
}

function disabledIds(): Set<string> {
  return new Set(
    (process.env.LINK_DISABLED_RETAILERS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** The registry flag, overridden by the LINK_DISABLED_RETAILERS kill switch. */
export function isEnabled(retailer: Retailer): boolean {
  return retailer.enabled && !disabledIds().has(retailer.id);
}

export function regionOf(retailer: Retailer, url: URL): Region {
  return typeof retailer.region === 'function' ? retailer.region(url) : retailer.region;
}

/** Group 1 of the id pattern against path+search, or null when this is not a product page. */
export function productIdOf(retailer: Retailer, url: URL): string | null {
  const m = retailer.idPattern.exec(`${url.pathname}${url.search}`);
  return m?.[1] ?? null;
}

export function isProductUrl(retailer: Retailer, url: URL): boolean {
  return retailer.idPattern.test(`${url.pathname}${url.search}`);
}

/**
 * The key that names the exact variant the member shared: the kept query
 * param when the retailer has one (Flipkart pid, Zara v1, ASOS colourWayId),
 * else the product id itself (an Amazon child ASIN is its own variant).
 */
export function variantKeyOf(retailer: Retailer, url: URL): string | null {
  for (const p of retailer.keepParams) {
    const v = url.searchParams.get(p);
    if (v) return v;
  }
  return productIdOf(retailer, url);
}

export function safeUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

/** The registry as a table — for the admin view and the report. */
export function registryTable(): { id: string; name: string; domains: string[]; parser: string; enabled: boolean }[] {
  return RETAILERS.map((r) => ({ id: r.id, name: r.name, domains: r.domains, parser: r.parser ?? 'jsonld/og', enabled: isEnabled(r) }));
}
