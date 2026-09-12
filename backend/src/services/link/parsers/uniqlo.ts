// UNIQLO: Open Graph carries the name and image; the server's
// __PRELOADED_STATE__ is usually an empty shell (research §1) but, when it is
// populated, holds prices, colours and sizes — so it is searched defensively
// for the shapes we know rather than trusted as a schema. The URL's trailing
// colour code (/products/E123456-000/00) names the chosen colour.

import type { PartialRead, ReadContext } from '../types';
import { parseOpenGraph } from './opengraph';
import { availabilityOf, cleanText, normaliseCurrency, parsePrice, uniq } from './shared';

type Node = Record<string, unknown>;

export function preloadedState(html: string): Node | null {
  const m = /window\.__PRELOADED_STATE__\s*=\s*/.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  if (html[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < html.length && i < start + 2_000_000; i++) {
    const c = html[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as Node;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Depth-first search for the first object holding a given key. */
function findWith(node: unknown, key: string, depth = 0): Node | null {
  if (depth > 8 || node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const hit = findWith(x, key, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const n = node as Node;
  if (key in n) return n;
  for (const v of Object.values(n)) {
    const hit = findWith(v, key, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export function parseUniqlo(html: string, ctx: ReadContext): PartialRead | null {
  const og = parseOpenGraph(html, ctx) ?? {};
  const state = preloadedState(html);
  const out: PartialRead = { ...og, sizeOptions: og.sizeOptions ?? [], raw: { og: og.raw, state: null } };

  // The colour code the member chose, from the URL tail.
  const tail = /\/products\/E\d{6}-\d{3}\/(\d{2})(?=[/?#]|$)/i.exec(ctx.finalUrl)?.[1] ?? null;

  if (state) {
    const priced = findWith(state, 'prices');
    const prices = priced?.prices as Node | undefined;
    if (prices) {
      const base = parsePrice((prices.base as Node | undefined)?.value ?? prices.base);
      const promo = parsePrice((prices.promo as Node | undefined)?.value ?? prices.promo);
      const currency = normaliseCurrency((prices.base as Node | undefined)?.currency ?? (prices.base as Node | undefined)?.currencyCode) ?? base.currency;
      if (promo.amount != null && base.amount != null && base.amount > promo.amount) {
        out.price = base.amount;
        out.salePrice = promo.amount;
      } else out.price = promo.amount ?? base.amount ?? out.price;
      if (currency) out.currency = currency;
    }
    const named = findWith(state, 'colors');
    const colors = (named?.colors as Node[] | undefined) ?? [];
    if (Array.isArray(colors) && colors.length) {
      const mine = colors.find((c) => String(c.code ?? c.displayCode ?? '').padStart(2, '0') === tail) ?? null;
      const label = cleanText(mine?.name ?? mine?.displayName);
      if (label) out.chosenColour = label;
    }
    const sized = findWith(state, 'sizes');
    const sizes = (sized?.sizes as Node[] | undefined) ?? [];
    if (Array.isArray(sizes) && sizes.length) out.sizeOptions = uniq(sizes.map((s) => cleanText(s.name ?? s.displayName ?? s.code)));
    const stock = findWith(state, 'stock') ?? findWith(state, 'availability');
    const avail = availabilityOf(String((stock?.stock as Node | undefined)?.statusCode ?? stock?.availability ?? ''));
    if (avail) out.availability = avail;
    const named2 = findWith(state, 'name');
    if (!out.productName) out.productName = cleanText(named2?.name);
    (out.raw as Node).state = { prices: prices ?? null, colours: colors.length, sizes: sizes.length };
  }
  if (!out.chosenColour && tail) out.chosenColour = `colour ${tail}`;
  if (!out.productName && (out.images ?? []).length === 0) return null;
  return out;
}
