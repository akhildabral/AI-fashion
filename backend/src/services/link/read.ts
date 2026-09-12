// The reading ladder. One shop link in; a LinkRead (or an honest failure)
// out. Registry → canonicalise → fetch → JSON-LD → Open Graph → the retailer's
// inline parser → the vendor extractor → give up with a reason. Rungs are
// merged first-non-null-wins; `method` names the rung that supplied both a
// name and an image (the two facts a card cannot do without).

import { canonicalUrlFor, prepare } from './canonical';
import { fetchPage, type FetchOptions } from './fetch';
import { parseAmazon } from './parsers/amazon';
import { parseJsonLd } from './parsers/jsonld';
import { parseOpenGraph } from './parsers/opengraph';
import { parseUniqlo } from './parsers/uniqlo';
import { isEnabled, isProductUrl, productIdOf, resolveRetailer, variantKeyOf, type Retailer } from './registry';
import { failure, LinkError, type LinkRead, type LinkReadResult, type PartialRead, type ReadContext, type ReadMethod } from './types';
import { vendorEnabled, vendorExtract } from './vendor';

export interface ReadOptions extends FetchOptions {
  now?: () => Date;
  /** The vendor call, injectable for tests. */
  vendor?: (url: string, ctx: ReadContext) => Promise<PartialRead | null>;
}

/** What a read produced beyond the contract: the merged raw facts, kept on the item as `extraction`. */
export interface ReadOutcome {
  result: LinkReadResult;
  extraction: Record<string, unknown> | null;
  retailer: Retailer | null;
  /** The URL after unwrapping and stripping — what we actually fetched. */
  preparedUrl: string | null;
}

const INLINE = { amazon: parseAmazon, uniqlo: parseUniqlo } as const;

function hasCard(p: PartialRead | null): boolean {
  return !!p && !!p.productName && (p.images?.length ?? 0) > 0;
}

/** First non-null wins, in ladder order; lists are unioned. */
export function mergeReads(parts: { method: ReadMethod; read: PartialRead }[]): { merged: PartialRead; method: ReadMethod | null } {
  const merged: PartialRead = { images: [], sizeOptions: [] };
  let method: ReadMethod | null = null;
  let named: ReadMethod | null = null;
  for (const { method: m, read } of parts) {
    for (const key of ['productName', 'brand', 'price', 'salePrice', 'currency', 'availability', 'chosenColour', 'chosenSize', 'canonicalUrl'] as const) {
      if (merged[key] == null && read[key] != null) (merged as Record<string, unknown>)[key] = read[key];
    }
    for (const u of read.images ?? []) if (!merged.images!.includes(u)) merged.images!.push(u);
    if ((merged.sizeOptions?.length ?? 0) === 0 && (read.sizeOptions?.length ?? 0) > 0) merged.sizeOptions = [...read.sizeOptions!];
    if (!method && hasCard(read)) method = m;
    if (!named && read.productName) named = m;
  }
  // A sale price only means something against a higher list price.
  if (merged.salePrice != null && merged.price != null && merged.salePrice >= merged.price) merged.salePrice = null;
  return { merged, method: method ?? named };
}

export async function readLink(input: string, opts: ReadOptions = {}): Promise<ReadOutcome> {
  const now = opts.now ?? (() => new Date());
  let retailer: Retailer | null = null;
  let preparedUrl: string | null = null;
  try {
    const shared = prepare(input);
    preparedUrl = shared.toString();
    retailer = resolveRetailer(shared);
    if (!retailer) return { result: failure('unsupported', null), extraction: null, retailer: null, preparedUrl };
    if (!isEnabled(retailer)) return { result: failure('disabled', retailer.id), extraction: null, retailer, preparedUrl };

    // Short links only tell us the shop; the product id shows up after the redirects.
    const page = await fetchPage(shared, retailer, opts);
    const landed = resolveRetailer(page.finalUrl);
    if (!landed) return { result: failure('unsupported', retailer.id), extraction: null, retailer, preparedUrl };
    if (landed.id !== retailer.id) {
      retailer = landed;
      if (!isEnabled(retailer)) return { result: failure('disabled', retailer.id), extraction: null, retailer, preparedUrl };
    }
    if (!isProductUrl(retailer, page.finalUrl) && !isProductUrl(retailer, shared)) {
      return { result: failure('not-product', retailer.id), extraction: null, retailer, preparedUrl };
    }

    const idSource = isProductUrl(retailer, shared) ? shared : page.finalUrl;
    const ctx: ReadContext = {
      retailerId: retailer.id,
      productId: productIdOf(retailer, idSource),
      variantKey: variantKeyOf(retailer, idSource) ?? variantKeyOf(retailer, page.finalUrl),
      finalUrl: page.finalUrl.toString(),
      sharedUrl: shared.toString(),
    };

    const parts: { method: ReadMethod; read: PartialRead }[] = [];
    const push = (method: ReadMethod, read: PartialRead | null) => {
      if (read) parts.push({ method, read });
    };
    push('jsonld', safe(() => parseJsonLd(page.html, ctx)));
    push('opengraph', safe(() => parseOpenGraph(page.html, ctx)));
    if (retailer.parser) push('inline', safe(() => INLINE[retailer!.parser!](page.html, ctx)));

    let { merged, method } = mergeReads(parts);
    if (!hasCard(merged) && (opts.vendor || vendorEnabled())) {
      const vendor = await (opts.vendor ?? vendorExtract)(page.finalUrl.toString(), ctx).catch(() => null);
      if (vendor) {
        push('vendor', vendor);
        ({ merged, method } = mergeReads(parts));
      }
    }

    if (!merged.productName || !method) {
      // The page opened but holds no product: a category, a search, a home page.
      return { result: failure('not-product', retailer.id), extraction: null, retailer, preparedUrl };
    }

    const canonicalUrl = canonicalUrlFor(retailer, page.finalUrl, idSource, page.html);
    const read: LinkRead = {
      ok: true,
      retailer: retailer.id,
      canonicalUrl,
      productName: merged.productName,
      brand: merged.brand ?? null,
      price: merged.price ?? null,
      salePrice: merged.salePrice ?? null,
      currency: merged.currency ?? null,
      availability: merged.availability ?? 'unknown',
      images: merged.images ?? [],
      chosenColour: merged.chosenColour ?? null,
      chosenSize: merged.chosenSize ?? null,
      sizeOptions: merged.sizeOptions ?? [],
      asOf: now().toISOString(),
      method,
    };
    const extraction: Record<string, unknown> = {
      finalUrl: ctx.finalUrl,
      productId: ctx.productId,
      variantKey: ctx.variantKey,
      truncated: page.truncated,
      rungs: Object.fromEntries(parts.map((p) => [p.method, p.read.raw ?? null])),
    };
    return { result: read, extraction, retailer, preparedUrl };
  } catch (err) {
    if (err instanceof LinkError) {
      return { result: failure(err.reason, retailer?.id ?? null), extraction: { detail: err.message }, retailer, preparedUrl };
    }
    throw err;
  }
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
