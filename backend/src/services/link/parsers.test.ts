import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAmazon, parseTwister } from './parsers/amazon';
import { parseJsonLd } from './parsers/jsonld';
import { parseOpenGraph } from './parsers/opengraph';
import { parsePrice } from './parsers/shared';
import { parseUniqlo } from './parsers/uniqlo';
import type { ReadContext } from './types';

export const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');

const ctx = (over: Partial<ReadContext>): ReadContext => ({
  retailerId: 'x',
  productId: null,
  variantKey: null,
  finalUrl: 'https://www.example.com/',
  sharedUrl: 'https://www.example.com/',
  ...over,
});

describe('JSON-LD parser', () => {
  it('reads a Flipkart-style Product: name, brand, colour, price, currency, stock, all images', () => {
    const url = 'https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU';
    const out = parseJsonLd(fixture('flipkart-product.html'), ctx({ retailerId: 'flipkart', productId: 'itm7f3a4a6c1b2d9', variantKey: 'JEAG3K2ZQHJZ9YHU', finalUrl: url, sharedUrl: url }))!;
    expect(out).toMatchObject({
      productName: "Levi's Men Slim Fit Mid Rise Blue Jeans",
      brand: "LEVI'S",
      price: 1899,
      salePrice: null,
      currency: 'INR',
      availability: 'in_stock',
      chosenColour: 'Blue',
      chosenSize: null,
      sizeOptions: [],
    });
    expect(out.images).toHaveLength(2);
    expect(out.images?.[0]).toContain('imagh4b5.jpeg');
    expect(out.canonicalUrl).toBeNull();
  });

  it('reads an H&M-style ProductGroup and picks the variant the URL names', () => {
    const url = 'https://www2.hm.com/en_in/productpage.1234567002.html';
    const out = parseJsonLd(fixture('hm-productgroup.html'), ctx({ retailerId: 'hm', productId: '1234567002', variantKey: '1234567002', finalUrl: url, sharedUrl: url }))!;
    expect(out).toMatchObject({
      productName: 'Regular Fit Linen shirt',
      brand: 'H&M',
      chosenColour: 'Light blue',
      currency: 'INR',
      price: 2299,
      salePrice: 1499,
    });
    // Every size of article 1234567002 matches: no size was chosen, and the
    // in-stock one (M) carries the availability, not the sold-out S.
    expect(out.chosenSize).toBeNull();
    expect(out.availability).toBe('in_stock');
    expect(out.sizeOptions).toEqual(['S', 'M', 'L']);
    // The variant's own images come first, then the group's.
    expect(out.images?.[0]).toContain('1234567002_1.jpg');
    expect(out.images).toContain('https://image.hm.com/assets/hm/aa/bb/aabb1234567002_group.jpg');
    expect(out.canonicalUrl).toBe(url);
  });

  it('without a variant key, falls back to the first in-stock variant', () => {
    const out = parseJsonLd(fixture('hm-productgroup.html'), ctx({ retailerId: 'hm' }))!;
    expect(out.chosenColour).toBe('White');
    expect(out.chosenSize).toBeNull();
    expect(out.price).toBe(2299);
  });

  it('returns null when the page carries no Product', () => {
    expect(parseJsonLd(fixture('not-product.html'), ctx({}))).toBeNull();
    expect(parseJsonLd(fixture('og-only.html'), ctx({}))).toBeNull();
    expect(parseJsonLd('<html><script type="application/ld+json">{not json</script></html>', ctx({}))).toBeNull();
  });
});

describe('Open Graph parser', () => {
  it('reads a Myntra-style OG-only page, with the product: extension and the shop suffix trimmed', () => {
    const url = 'https://www.myntra.com/shirts/roadster/roadster-men-olive-green-solid-casual-shirt/12345678/buy';
    const out = parseOpenGraph(fixture('og-only.html'), ctx({ retailerId: 'myntra', finalUrl: url }))!;
    expect(out).toMatchObject({
      productName: 'Roadster Men Olive Green Solid Casual Shirt',
      brand: 'Roadster',
      price: 1099,
      salePrice: null,
      currency: 'INR',
      availability: 'in_stock',
      chosenColour: 'Olive',
      canonicalUrl: url,
    });
    expect(out.images).toHaveLength(2);
  });

  it('does not turn a listing page into a product', () => {
    // og:title present but no image and og:type website: a name comes back,
    // but no image — the ladder needs both for a card.
    const out = parseOpenGraph(fixture('not-product.html'), ctx({}));
    expect(out?.images ?? []).toHaveLength(0);
    expect(parseOpenGraph('<html><head><title>Something</title></head></html>', ctx({}))).toBeNull();
  });
});

describe('Amazon parser', () => {
  const url = 'https://www.amazon.in/Allen-Solly-Polo/dp/B07CHLD0M1';
  const c = ctx({ retailerId: 'amazon', productId: 'B07CHLD0M1', variantKey: 'B07CHLD0M1', finalUrl: url, sharedUrl: url });

  it('reads the twister block: child ASIN → size and colour, sizes of that colour', () => {
    const tw = parseTwister(fixture('amazon-in.html'))!;
    expect(tw.dimensions).toEqual(['Size', 'Colour']);
    expect(tw.values.B07CHLD0M1).toEqual(['Medium', 'Navy']);
    const out = parseAmazon(fixture('amazon-in.html'), c)!;
    expect(out.chosenSize).toBe('Medium');
    expect(out.chosenColour).toBe('Navy');
    expect(out.sizeOptions).toEqual(['Small', 'Medium', 'Large']);
  });

  it('reads title, brand, the largest landing image, price with MRP, and stock', () => {
    const out = parseAmazon(fixture('amazon-in.html'), c)!;
    expect(out.productName).toBe("Allen Solly Men's Regular Fit Polo T-Shirt (Navy, Medium)");
    expect(out.brand).toBe('Allen Solly');
    expect(out.images?.[0]).toBe('https://m.media-amazon.com/images/I/71abcDEF01L._SY879_.jpg');
    expect(out.images).toContain('https://m.media-amazon.com/images/I/71abcDEF01L._SL1500_.jpg');
    expect(out.price).toBe(1499);
    expect(out.salePrice).toBe(749);
    expect(out.currency).toBe('INR');
    expect(out.availability).toBe('in_stock');
  });

  it('returns null on a wall page', () => {
    expect(parseAmazon(fixture('akamai-denied.html'), c)).toBeNull();
  });
});

describe('Uniqlo parser', () => {
  it('reads OG plus a populated __PRELOADED_STATE__: promo price, colour by URL code, sizes', () => {
    const url = 'https://www.uniqlo.com/in/en/products/E455359-000/00';
    const out = parseUniqlo(fixture('uniqlo.html'), ctx({ retailerId: 'uniqlo', productId: 'E455359-000', finalUrl: url, sharedUrl: url }))!;
    expect(out.productName).toBe('MEN AIRism Cotton Crew Neck T-Shirt');
    expect(out.images?.[0]).toContain('ingoods_09_455359.jpg');
    expect(out.price).toBe(990);
    expect(out.salePrice).toBe(790);
    expect(out.currency).toBe('INR');
    expect(out.chosenColour).toBe('WHITE');
    expect(out.sizeOptions).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(out.availability).toBe('in_stock');
  });

  it('survives the empty-shell state the live site serves', () => {
    const html = fixture('uniqlo.html').replace(/window\.__PRELOADED_STATE__ = .*?;<\/script>/s, 'window.__PRELOADED_STATE__ = {};</script>');
    const url = 'https://www.uniqlo.com/in/en/products/E455359-000/69';
    const out = parseUniqlo(html, ctx({ retailerId: 'uniqlo', finalUrl: url, sharedUrl: url }))!;
    expect(out.productName).toBe('MEN AIRism Cotton Crew Neck T-Shirt');
    expect(out.price).toBeNull();
    expect(out.chosenColour).toBe('colour 69');
  });
});

describe('price parsing', () => {
  it('handles the shops\' formats', () => {
    expect(parsePrice('₹1,29,900.00')).toEqual({ amount: 129900, currency: 'INR' });
    expect(parsePrice('AED 65.00')).toEqual({ amount: 65, currency: 'AED' });
    expect(parsePrice('Rs. 1,899')).toEqual({ amount: 1899, currency: 'INR' });
    expect(parsePrice('£24.99')).toEqual({ amount: 24.99, currency: 'GBP' });
    expect(parsePrice('1899')).toEqual({ amount: 1899, currency: null });
    expect(parsePrice(749)).toEqual({ amount: 749, currency: null });
    expect(parsePrice('')).toEqual({ amount: null, currency: null });
  });
});
