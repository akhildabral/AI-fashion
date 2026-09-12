// Amazon (.in and .ae): no JSON-LD for a browser UA, so the page's own
// pieces are read — #productTitle, the byline brand, the landing image's
// data-a-dynamic-image map (largest rendition wins), the core price block
// (and the struck-through list price), #availability, and the twister block
// whose dimensionValuesDisplayData maps every child ASIN to its
// [size, colour] so the shared child ASIN names the exact variant.

import * as cheerio from 'cheerio';
import type { PartialRead, ReadContext } from '../types';
import { availabilityOf, cleanText, normaliseCurrency, parsePrice, uniq } from './shared';

function currencyForHost(url: string): string | null {
  try {
    const h = new URL(url).hostname;
    if (h.endsWith('.in')) return 'INR';
    if (h.endsWith('.ae')) return 'AED';
    if (h.endsWith('.co.uk')) return 'GBP';
    if (h.endsWith('.com')) return 'USD';
  } catch {
    /* fall through */
  }
  return null;
}

/** `"key":<json value>` inside inline scripts — the twister and price blobs are not standalone JSON. */
function inlineJson<T>(html: string, key: string): T | null {
  const re = new RegExp(`["']${key}["']\\s*:\\s*`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const start = m.index + m[0].length;
    const open = html[start];
    if (open !== '{' && open !== '[') {
      const scalar = /^("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null)/.exec(html.slice(start, start + 200));
      if (scalar) {
        try {
          return JSON.parse(scalar[1]) as T;
        } catch {
          continue;
        }
      }
      continue;
    }
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    for (let i = start; i < html.length && i < start + 500_000; i++) {
      const c = html[i];
      if (inStr) {
        if (c === '\\') i++;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1)) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

interface Twister {
  dimensions: string[];
  values: Record<string, string[]>;
}

export function parseTwister(html: string): Twister | null {
  const values = inlineJson<Record<string, string[]>>(html, 'dimensionValuesDisplayData');
  if (!values || typeof values !== 'object') return null;
  const dimensions =
    inlineJson<string[]>(html, 'dimensionsDisplay') ??
    inlineJson<string[]>(html, 'dimensions')?.map((d) => String(d)) ??
    [];
  return { dimensions: dimensions.map((d) => String(d)), values };
}

function dimIndex(dimensions: string[], kind: 'size' | 'colour'): number {
  const re = kind === 'size' ? /size|fit|length|waist/i : /colou?r|shade|pattern|style/i;
  return dimensions.findIndex((d) => re.test(d));
}

export function parseAmazon(html: string, ctx: ReadContext): PartialRead | null {
  const $ = cheerio.load(html);
  const title = cleanText($('#productTitle').first().text()) ?? cleanText($('#title').first().text());

  let brand = cleanText($('#bylineInfo').first().text()) ?? cleanText($('a#brand').first().text());
  if (brand) brand = brand.replace(/^(visit the|brand:)\s*/i, '').replace(/\s*store$/i, '').trim() || null;

  // Images: the dynamic map is { url: [w, h] }; largest area wins.
  const images: string[] = [];
  const dyn = $('#landingImage').attr('data-a-dynamic-image') ?? $('#imgBlkFront').attr('data-a-dynamic-image');
  if (dyn) {
    try {
      const map = JSON.parse(dyn) as Record<string, [number, number]>;
      const sorted = Object.entries(map).sort((a, b) => (b[1]?.[0] ?? 0) * (b[1]?.[1] ?? 0) - (a[1]?.[0] ?? 0) * (a[1]?.[1] ?? 0));
      images.push(...sorted.map(([u]) => u));
    } catch {
      /* fall through to src */
    }
  }
  for (const attr of ['data-old-hires', 'src']) {
    const v = $('#landingImage').attr(attr) ?? $('#imgBlkFront').attr(attr);
    if (v && /^https?:/.test(v)) images.push(v);
  }
  for (const m of html.matchAll(/"hiRes"\s*:\s*"(https:[^"]+)"/g)) images.push(m[1]);

  // Price: the buy box's offscreen text, else the inline priceAmount.
  const priceText =
    $('#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #corePrice_feature_div .a-price .a-offscreen, #price_inside_buybox, #priceblock_ourprice, #priceblock_dealprice, .priceToPay .a-offscreen')
      .first()
      .text() || null;
  const listText = $('#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen, .basisPrice .a-offscreen, #listPrice, #priceblock_saleprice ~ .a-text-strike, span.a-text-price[data-a-strike="true"] .a-offscreen').first().text() || null;
  let selling = parsePrice(priceText);
  if (selling.amount == null) {
    const amt = inlineJson<number | string>(html, 'priceAmount');
    if (amt != null) selling = { amount: parsePrice(amt).amount, currency: null };
  }
  const list = parsePrice(listText);
  const currency = selling.currency ?? list.currency ?? normaliseCurrency(inlineJson<string>(html, 'currencyCode') ?? inlineJson<string>(html, 'priceCurrency')) ?? currencyForHost(ctx.finalUrl);

  let price = selling.amount;
  let salePrice: number | null = null;
  if (list.amount != null && selling.amount != null && list.amount > selling.amount) {
    price = list.amount;
    salePrice = selling.amount;
  }

  const availability =
    availabilityOf(cleanText($('#availability').first().text())) ??
    (/#outOfStock|id="outOfStock"/.test(html) ? 'out_of_stock' : null);

  // Twister: the child ASIN → [dimension values].
  const twister = parseTwister(html);
  let chosenSize: string | null = null;
  let chosenColour: string | null = null;
  let sizeOptions: string[] = [];
  if (twister) {
    const si = dimIndex(twister.dimensions, 'size');
    const ci = dimIndex(twister.dimensions, 'colour');
    const mine = ctx.productId ? twister.values[ctx.productId] ?? twister.values[ctx.productId.toUpperCase()] : undefined;
    if (mine) {
      if (si >= 0) chosenSize = cleanText(mine[si]);
      if (ci >= 0) chosenColour = cleanText(mine[ci]);
      // A one-dimension twister with no label still tells us something.
      if (si < 0 && ci < 0 && mine.length === 1) chosenSize = cleanText(mine[0]);
    }
    if (si >= 0) {
      const colourOfMine = ci >= 0 && mine ? mine[ci] : null;
      sizeOptions = uniq(
        Object.values(twister.values)
          .filter((v) => colourOfMine == null || v[ci] === colourOfMine)
          .map((v) => cleanText(v[si])),
      );
    }
  }
  if (!chosenColour) {
    const sel = cleanText($('#variation_color_name .selection').first().text());
    if (sel) chosenColour = sel;
  }
  if (!chosenSize) {
    const sel = cleanText($('#native_dropdown_selected_size_name option[selected], #variation_size_name .selection').first().text());
    if (sel && !/^select/i.test(sel)) chosenSize = sel;
  }

  if (!title && images.length === 0) return null;
  return {
    productName: title,
    brand,
    price,
    salePrice,
    currency,
    availability,
    images: uniq(images),
    chosenColour,
    chosenSize,
    sizeOptions,
    canonicalUrl: null,
    raw: { title, brand, priceText, listText, twister: twister ? { dimensions: twister.dimensions, children: Object.keys(twister.values).length, mine: twister.values[ctx.productId ?? ''] ?? null } : null },
  };
}
