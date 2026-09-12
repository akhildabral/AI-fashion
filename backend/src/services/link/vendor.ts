// The optional vendor rung. Off by default (LINK_EXTRACTOR=none); with
// LINK_EXTRACTOR=zyte and LINK_EXTRACTOR_KEY set, a page our own fetch could
// not read (or could not find a name and image on) is handed to Zyte's
// product extraction, which fetches through its own browser pool.
//
// Zyte API request (https://docs.zyte.com/zyte-api/usage/reference.html):
//   POST https://api.zyte.com/v1/extract
//   Authorization: Basic base64("<key>:")
//   { "url": "<product url>", "product": true,
//     "productOptions": { "extractFrom": "browserHtml" } }
// Response (relevant part):
//   { "url": "...", "statusCode": 200,
//     "product": { "name", "price", "regularPrice", "currency", "currencyRaw",
//                  "availability": "InStock" | "OutOfStock",
//                  "mainImage": { "url" }, "images": [{ "url" }],
//                  "brand": { "name" }, "color", "size", "sku",
//                  "variants": [{ "color", "size", "url", "sku", "price" }] } }
// Billed per extraction ($0.0004–0.0016, research §1) so it only runs when
// the free rungs came back empty.

import type { PartialRead, ReadContext } from './types';
import { availabilityOf, cleanText, normaliseCurrency, parsePrice, uniq } from './parsers/shared';

export type VendorName = 'none' | 'zyte';

export function vendorConfig(): { name: VendorName; key: string | null } {
  const name = (process.env.LINK_EXTRACTOR ?? 'none').trim().toLowerCase();
  const key = process.env.LINK_EXTRACTOR_KEY?.trim() || null;
  if (name === 'zyte' && key) return { name: 'zyte', key };
  return { name: 'none', key: null };
}

export function vendorEnabled(): boolean {
  return vendorConfig().name !== 'none';
}

type Node = Record<string, unknown>;

export async function vendorExtract(
  url: string,
  ctx: ReadContext,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<PartialRead | null> {
  const cfg = vendorConfig();
  if (cfg.name !== 'zyte' || !cfg.key) return null;
  const res = await fetchImpl('https://api.zyte.com/v1/extract', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${cfg.key}:`).toString('base64')}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ url, product: true, productOptions: { extractFrom: 'browserHtml' } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as Node | null;
  const product = body?.product as Node | undefined;
  if (!product) return null;

  const variants = Array.isArray(product.variants) ? (product.variants as Node[]) : [];
  const keys = [ctx.variantKey, ctx.productId].filter((k): k is string => !!k).map((k) => k.toLowerCase());
  const mine =
    variants.find((v) => [v.sku, v.url].some((x) => typeof x === 'string' && keys.some((k) => x.toLowerCase().includes(k)))) ?? null;

  const selling = parsePrice(mine?.price ?? product.price);
  const regular = parsePrice(product.regularPrice);
  const currency = normaliseCurrency(product.currency) ?? normaliseCurrency(product.currencyRaw) ?? selling.currency;
  const images = uniq([
    (product.mainImage as Node | undefined)?.url as string | undefined,
    ...((product.images as Node[] | undefined) ?? []).map((i) => i?.url as string | undefined),
  ]);
  return {
    productName: cleanText(product.name),
    brand: cleanText((product.brand as Node | undefined)?.name ?? product.brand),
    price: regular.amount != null && selling.amount != null && regular.amount > selling.amount ? regular.amount : selling.amount,
    salePrice: regular.amount != null && selling.amount != null && regular.amount > selling.amount ? selling.amount : null,
    currency,
    availability: availabilityOf(product.availability),
    images,
    chosenColour: cleanText(mine?.color ?? product.color),
    chosenSize: cleanText(mine?.size ?? product.size),
    sizeOptions: uniq(variants.map((v) => cleanText(v.size))),
    canonicalUrl: typeof product.canonicalUrl === 'string' ? product.canonicalUrl : null,
    raw: { ...product, images: undefined, variants: variants.length },
  };
}
