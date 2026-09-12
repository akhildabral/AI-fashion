// Open Graph: the second rung. Every shop sets og:title and og:image; a few
// add the product:* extension (price, currency, availability, brand). The
// page <title> stands in when og:title is missing, and rel=canonical / og:url
// are reported so the canonicaliser can prefer them.

import * as cheerio from 'cheerio';
import type { PartialRead, ReadContext } from '../types';
import { absoluteUrl, availabilityOf, cleanText, normaliseCurrency, parsePrice, uniq } from './shared';

/** All og:/product: metas as a map, arrays for repeated keys. */
export function openGraphMap(html: string): Record<string, string[]> {
  const $ = cheerio.load(html);
  const map: Record<string, string[]> = {};
  $('meta[property], meta[name]').each((_, el) => {
    const key = ($(el).attr('property') ?? $(el).attr('name') ?? '').trim().toLowerCase();
    const value = $(el).attr('content');
    if (!key || value == null) return;
    if (!/^(og|product|twitter|article):/.test(key) && !['description', 'title'].includes(key)) return;
    (map[key] ??= []).push(value.trim());
  });
  const title = $('title').first().text();
  if (title) map['html:title'] = [title.trim()];
  const canonical = $('link[rel="canonical"]').first().attr('href');
  if (canonical) map['html:canonical'] = [canonical.trim()];
  return map;
}

const NOISE_TITLE = /^(amazon|flipkart|myntra|ajio|noon|namshi|next|zara|h&m|uniqlo|asos|shein)\b[^|:-]*$/i;

export function parseOpenGraph(html: string, ctx: ReadContext): PartialRead | null {
  const og = openGraphMap(html);
  const first = (k: string): string | null => og[k]?.[0] ?? null;
  const base = ctx.finalUrl;

  const images = uniq([...(og['og:image:secure_url'] ?? []), ...(og['og:image'] ?? []), ...(og['twitter:image'] ?? [])].map((u) => absoluteUrl(u, base)));
  // The page <title> only stands in for og:title when an og:image vouches
  // that this is a thing and not a listing.
  let name = cleanText(first('og:title')) ?? cleanText(first('twitter:title')) ?? (images.length ? cleanText(first('html:title')) : null);
  if (name && NOISE_TITLE.test(name)) name = null;
  // "Levi's Men's Slim Jeans | Myntra" — the shop's suffix is not the name.
  if (name) name = name.replace(/\s*[|–—-]\s*(Buy|Shop|Online|Amazon|Flipkart|Myntra|AJIO|noon|Namshi|Next|ZARA|H&M|UNIQLO|ASOS|SHEIN)[^|]*$/i, '').trim() || name;

  const amount = parsePrice(first('product:price:amount') ?? first('og:price:amount') ?? first('product:sale_price:amount'));
  const listAmount = parsePrice(first('product:original_price:amount'));
  const currency = normaliseCurrency(first('product:price:currency') ?? first('og:price:currency')) ?? amount.currency;

  if (!name && images.length === 0) return null;
  const price = listAmount.amount != null && amount.amount != null && listAmount.amount > amount.amount ? listAmount.amount : amount.amount;
  const salePrice = listAmount.amount != null && amount.amount != null && listAmount.amount > amount.amount ? amount.amount : null;
  return {
    productName: name,
    brand: cleanText(first('product:brand') ?? first('og:brand')),
    price,
    salePrice,
    currency,
    availability: availabilityOf(first('product:availability') ?? first('og:availability')),
    images,
    chosenColour: cleanText(first('product:color')),
    chosenSize: cleanText(first('product:size')),
    sizeOptions: [],
    canonicalUrl: absoluteUrl(first('html:canonical') ?? first('og:url'), base),
    raw: og,
  };
}
