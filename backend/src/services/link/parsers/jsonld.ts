// schema.org JSON-LD: the first and widest rung. Nine of the twelve shops
// embed a Product or a ProductGroup (with hasVariant[] Products carrying
// colour, size and their own offers). When the URL names a variant (an ASIN,
// a Flipkart pid, a Zara colour code) the matching variant is preferred;
// otherwise the first in-stock one.

import * as cheerio from 'cheerio';
import type { PartialRead, ReadContext } from '../types';
import { absoluteUrl, availabilityOf, cleanText, normaliseCurrency, parsePrice, uniq, variantValue } from './shared';

type Node = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function typesOf(node: Node): string[] {
  return asArray(node['@type'] as string | string[] | undefined).map((t) => String(t).replace(/^.*[/#]/, '').toLowerCase());
}

/** Every JSON-LD node on the page, flattened out of arrays and @graph, recursively. */
export function jsonLdNodes(html: string): Node[] {
  const $ = cheerio.load(html);
  const nodes: Node[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).text();
    if (!text?.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Shops sometimes leave a trailing comment or HTML entity; one repair attempt.
      try {
        parsed = JSON.parse(text.replace(/<!--.*?-->/gs, '').replace(/&quot;/g, '"').trim());
      } catch {
        return;
      }
    }
    const walk = (v: unknown, depth: number): void => {
      if (depth > 6 || v == null) return;
      if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
      if (typeof v !== 'object') return;
      const n = v as Node;
      if (n['@type']) nodes.push(n);
      if (n['@graph']) walk(n['@graph'], depth + 1);
      if (n.mainEntity) walk(n.mainEntity, depth + 1);
    };
    walk(parsed, 0);
  });
  return nodes;
}

function nameOf(v: unknown): string | null {
  if (typeof v === 'string') return cleanText(v);
  if (v && typeof v === 'object') return cleanText((v as Node).name);
  return null;
}

function imagesOf(v: unknown, base: string): string[] {
  return uniq(
    asArray(v as unknown).map((x) => {
      if (typeof x === 'string') return absoluteUrl(x, base);
      if (x && typeof x === 'object') return absoluteUrl((x as Node).url ?? (x as Node).contentUrl, base);
      return null;
    }),
  );
}

interface OfferFacts {
  price: number | null;
  salePrice: number | null;
  currency: string | null;
  availability: PartialRead['availability'];
  sku: string | null;
  url: string | null;
}

/** One Offer, an array of them, or an AggregateOffer: the price the shop sells at, plus any list price. */
function offersOf(raw: unknown): OfferFacts {
  const out: OfferFacts = { price: null, salePrice: null, currency: null, availability: null, sku: null, url: null };
  const offers = asArray(raw as Node | Node[] | undefined).filter((o) => o && typeof o === 'object');
  if (offers.length === 0) return out;
  // Prefer an in-stock offer; else the first.
  const pick = offers.find((o) => availabilityOf(o.availability) === 'in_stock') ?? offers[0];
  const currency = normaliseCurrency(pick.priceCurrency) ?? normaliseCurrency((pick.priceSpecification as Node | undefined)?.priceCurrency);
  const current = parsePrice(pick.price ?? pick.lowPrice);
  let list: number | null = null;
  let selling: number | null = current.amount;
  for (const spec of asArray(pick.priceSpecification as Node | Node[] | undefined)) {
    if (!spec || typeof spec !== 'object') continue;
    const type = String(spec.priceType ?? '').toLowerCase();
    const p = parsePrice(spec.price).amount;
    if (p == null) continue;
    if (/listprice|strikethrough|regular|msrp|mrp/.test(type)) list = p;
    else if (/saleprice|sale/.test(type) || selling == null) selling = p;
  }
  if (list != null && selling != null && list > selling) {
    out.price = list;
    out.salePrice = selling;
  } else {
    out.price = selling ?? list;
  }
  out.currency = currency ?? current.currency;
  out.availability = availabilityOf(pick.availability);
  out.sku = cleanText(pick.sku) ?? null;
  out.url = typeof pick.url === 'string' ? pick.url : null;
  return out;
}

function matchesVariant(node: Node, ctx: ReadContext): boolean {
  const keys = [ctx.variantKey, ctx.productId].filter((k): k is string => !!k).map((k) => k.toLowerCase());
  if (keys.length === 0) return false;
  const hay = [node.sku, node['@id'], node.url, node.productID, node.mpn, node.gtin, node.gtin13, (node.offers as Node | undefined)?.sku, (node.offers as Node | undefined)?.url]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.toLowerCase());
  return hay.some((h) => keys.some((k) => h === k || h.includes(k)));
}

/** Reads a Product or a ProductGroup (choosing its variant) into a PartialRead. */
export function parseJsonLd(html: string, ctx: ReadContext): PartialRead | null {
  const nodes = jsonLdNodes(html);
  const products = nodes.filter((n) => typesOf(n).some((t) => t === 'product' || t === 'productgroup' || t === 'productmodel'));
  if (products.length === 0) return null;

  // A page can hold a ProductGroup and its Products as separate nodes; the
  // group wins as the root, then a matching Product is the chosen variant.
  const group = products.find((n) => typesOf(n).includes('productgroup')) ?? null;
  const root = group ?? products.find((n) => matchesVariant(n, ctx)) ?? products[0];
  const variants: Node[] = [
    ...asArray(root.hasVariant as Node | Node[] | undefined).filter((v) => v && typeof v === 'object'),
    ...(group ? products.filter((n) => n !== group && !typesOf(n).includes('productgroup')) : []),
  ];
  // The variants the URL names (an H&M article id is a colour: every size of
  // it matches). Among them, the in-stock one carries the price and images;
  // a size or colour is only "chosen" when the match leaves no doubt.
  const inStock = (v: Node) => availabilityOf((asArray(v.offers as Node | Node[] | undefined)[0] as Node | undefined)?.availability) === 'in_stock';
  const matching = variants.filter((v) => matchesVariant(v, ctx));
  const pool = matching.length > 0 ? matching : variants;
  const chosen = pool.find(inStock) ?? pool[0] ?? null;
  const unanimous = (key: 'size' | 'color'): string | null => {
    const values = uniq(pool.map((v) => variantValue(v[key])));
    return values.length === 1 ? values[0] : null;
  };

  const base = ctx.finalUrl;
  const offers = offersOf(chosen?.offers ?? root.offers);
  const rootOffers = chosen ? offersOf(root.offers) : offers;
  const sizeOptions = uniq(variants.map((v) => variantValue(v.size)));
  const images = uniq([...imagesOf(chosen?.image, base), ...imagesOf(root.image, base)]);

  const raw = { root: { ...root, hasVariant: undefined }, chosen: chosen ?? undefined };
  return {
    productName: cleanText(chosen?.name) ?? cleanText(root.name),
    brand: nameOf(chosen?.brand) ?? nameOf(root.brand) ?? null,
    price: offers.price ?? rootOffers.price,
    salePrice: offers.salePrice ?? rootOffers.salePrice,
    currency: offers.currency ?? rootOffers.currency,
    availability: offers.availability ?? rootOffers.availability,
    images,
    chosenColour: (variants.length ? unanimous('color') ?? variantValue(chosen?.color) : null) ?? variantValue(root.color),
    chosenSize: variants.length ? unanimous('size') : variantValue(root.size),
    sizeOptions,
    canonicalUrl: absoluteUrl(chosen?.url ?? root.url, base),
    raw,
  };
}
