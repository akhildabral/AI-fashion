// Small helpers every parser leans on: turning a shop's price string into a
// number and a currency, reading schema.org availability, and tidying text.

import type { Availability } from '../types';

const CURRENCY_BY_SYMBOL: [RegExp, string][] = [
  [/₹|Rs\.?\s|INR/i, 'INR'],
  [/AED|د\.إ|Dhs?\.?/i, 'AED'],
  [/£|GBP/i, 'GBP'],
  [/€|EUR/i, 'EUR'],
  [/SAR|ر\.س/i, 'SAR'],
  [/\$|USD/i, 'USD'],
];

/** "₹1,299.00" → { amount: 1299, currency: 'INR' }; "1299" → { amount: 1299, currency: null }. */
export function parsePrice(raw: unknown): { amount: number | null; currency: string | null } {
  if (typeof raw === 'number') return { amount: Number.isFinite(raw) ? raw : null, currency: null };
  if (typeof raw !== 'string') return { amount: null, currency: null };
  const s = raw.trim();
  if (!s) return { amount: null, currency: null };
  const currency = CURRENCY_BY_SYMBOL.find(([re]) => re.test(s))?.[1] ?? null;
  // Indian lakh grouping (1,29,900.00) and western (1,299.00) both drop commas cleanly.
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(s.replace(/\s/g, ''));
  if (!m) return { amount: null, currency };
  const amount = Number(m[0].replace(/,/g, ''));
  return { amount: Number.isFinite(amount) && amount >= 0 ? amount : null, currency };
}

export function normaliseCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(s)) return s;
  return parsePrice(raw).currency;
}

export function availabilityOf(raw: unknown): Availability | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase();
  if (/instock|in_stock|in stock|limitedavailability|onlineonly|instoreonly|available|only \d+ left/.test(s)) return 'in_stock';
  if (/outofstock|out_of_stock|out of stock|soldout|sold out|discontinued|unavailable/.test(s)) return 'out_of_stock';
  if (/preorder|pre-order|presale|backorder/.test(s)) return 'preorder';
  return null;
}

export function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  return s.length ? s.slice(0, 300) : null;
}

export function absoluteUrl(raw: unknown, base: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function uniq(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const s of list) if (s && !out.includes(s)) out.push(s);
  return out;
}

/** Strip the `size:`-style label a shop sometimes leaves on a variant value. */
export function variantValue(raw: unknown): string | null {
  const s = cleanText(raw);
  if (!s) return null;
  return s.replace(/^(size|colou?r|shade)\s*[:\-]\s*/i, '').trim() || null;
}
