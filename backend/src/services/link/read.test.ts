import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetThrottle } from './fetch';
import { mergeReads, readLink } from './read';

// The reading ladder end to end with the network replaced: which rung gets
// the credit, how each failure is named, and that a short link, a kill
// switch and the vendor rung all behave.

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');
const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

const now = () => new Date('2026-09-12T10:00:00.000Z');
const opts = (fetchImpl: (url: string) => Promise<Response>) => ({ fetchImpl, noThrottle: true, now, sleep: async () => undefined });

beforeEach(() => resetThrottle());
afterEach(() => {
  delete process.env.LINK_DISABLED_RETAILERS;
  delete process.env.LINK_EXTRACTOR;
  delete process.env.LINK_EXTRACTOR_KEY;
});

describe('readLink(): method attribution', () => {
  it('Flipkart: JSON-LD supplies the card; the canonical keeps the pid', async () => {
    const out = await readLink(
      'https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU&lid=LST1&marketplace=FLIPKART',
      opts(async () => html(fixture('flipkart-product.html'))),
    );
    expect(out.result).toMatchObject({
      ok: true,
      retailer: 'flipkart',
      method: 'jsonld',
      productName: "Levi's Men Slim Fit Mid Rise Blue Jeans",
      brand: "LEVI'S",
      price: 1899,
      salePrice: null,
      currency: 'INR',
      availability: 'in_stock',
      chosenColour: 'Blue',
      canonicalUrl: 'https://www.flipkart.com/levi-s-men-slim-fit-mid-rise-blue-jeans/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU',
      asOf: '2026-09-12T10:00:00.000Z',
    });
    expect(out.preparedUrl).toBe('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU');
    expect(out.extraction).toMatchObject({ productId: 'itm7f3a4a6c1b2d9', variantKey: 'JEAG3K2ZQHJZ9YHU' });
    expect(Object.keys((out.extraction as { rungs: object }).rungs)).toEqual(['jsonld', 'opengraph']);
    expect(JSON.stringify(out.extraction)).not.toContain('<html');
  });

  it('Myntra OG-only page: Open Graph gets the credit', async () => {
    const out = await readLink('https://www.myntra.com/shirts/roadster/x/12345678/buy', opts(async () => html(fixture('og-only.html'))));
    expect(out.result).toMatchObject({ ok: true, retailer: 'myntra', method: 'opengraph', productName: 'Roadster Men Olive Green Solid Casual Shirt', price: 1099, currency: 'INR', brand: 'Roadster' });
    expect((out.result as { images: string[] }).images).toHaveLength(2);
  });

  it('Amazon.in: the inline parser gets the credit and the child ASIN survives the parent canonical', async () => {
    const out = await readLink(
      'https://www.amazon.in/Allen-Solly-Polo/dp/B07CHLD0M1/ref=sr_1_3?keywords=polo&th=1&psc=1',
      opts(async () => html(fixture('amazon-in.html'))),
    );
    expect(out.result).toMatchObject({
      ok: true,
      retailer: 'amazon',
      method: 'inline',
      productName: "Allen Solly Men's Regular Fit Polo T-Shirt (Navy, Medium)",
      brand: 'Allen Solly',
      price: 1499,
      salePrice: 749,
      currency: 'INR',
      chosenSize: 'Medium',
      chosenColour: 'Navy',
      sizeOptions: ['Small', 'Medium', 'Large'],
      canonicalUrl: 'https://www.amazon.in/dp/B07CHLD0M1',
    });
  });

  it('H&M ProductGroup: the variant in the URL is the one read', async () => {
    const out = await readLink('https://www2.hm.com/en_in/productpage.1234567002.html', opts(async () => html(fixture('hm-productgroup.html'))));
    expect(out.result).toMatchObject({ ok: true, retailer: 'hm', method: 'jsonld', chosenColour: 'Light blue', chosenSize: null, price: 2299, salePrice: 1499, sizeOptions: ['S', 'M', 'L'] });
  });

  it('an a.co short link is followed to the product and read as Amazon', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('https://a.co/')) return redirect('https://www.amazon.in/Allen-Solly-Polo/dp/B07CHLD0M1?ref_=cm_sw_r_apan_dp_X');
      return html(fixture('amazon-in.html'));
    });
    const out = await readLink('https://a.co/d/3kfJ2xy', opts(fetchImpl));
    expect(out.result).toMatchObject({ ok: true, retailer: 'amazon', canonicalUrl: 'https://www.amazon.in/dp/B07CHLD0M1', chosenSize: 'Medium' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('the vendor rung runs only when the free rungs found no card, and gets the credit', async () => {
    const vendor = vi.fn(async () => ({ productName: 'Vendor Shirt', images: ['https://cdn.example/v.jpg'], price: 999, currency: 'AED', brand: 'Vendor' }));
    const bare = '<html><head><title>Something</title></head><body></body></html>';
    const out = await readLink('https://www.noon.com/uae-en/some-shirt/N12345678A/p/', { ...opts(async () => html(bare)), vendor });
    expect(out.result).toMatchObject({ ok: true, retailer: 'noon', method: 'vendor', productName: 'Vendor Shirt', price: 999 });
    expect(vendor).toHaveBeenCalledTimes(1);
    // With a card already in hand, the vendor is never asked.
    vendor.mockClear();
    await readLink('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU', { ...opts(async () => html(fixture('flipkart-product.html'))), vendor });
    expect(vendor).not.toHaveBeenCalled();
  });
});

describe('readLink(): failures, named honestly', () => {
  it('unsupported: a shop the registry does not know', async () => {
    const fetchImpl = vi.fn();
    const out = await readLink('https://www.example-boutique.com/products/shirt', opts(fetchImpl));
    expect(out.result).toMatchObject({ ok: false, reason: 'unsupported', retailer: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('disabled: Shein by registry, Flipkart by the kill switch; nothing is fetched', async () => {
    const fetchImpl = vi.fn();
    const shein = await readLink('https://www.shein.in/x-p-12345678-cat-1234.html', opts(fetchImpl));
    expect(shein.result).toMatchObject({ ok: false, reason: 'disabled', retailer: 'shein' });
    expect((shein.result as { message: string }).message).toMatch(/screenshot/i);
    process.env.LINK_DISABLED_RETAILERS = 'flipkart';
    const fk = await readLink('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU', opts(fetchImpl));
    expect(fk.result).toMatchObject({ ok: false, reason: 'disabled', retailer: 'flipkart' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('not-product: a category URL, a bad scheme, a product URL with no product on it', async () => {
    const cat = await readLink('https://www.myntra.com/men-shirts', opts(async () => html(fixture('not-product.html'))));
    expect(cat.result).toMatchObject({ ok: false, reason: 'not-product', retailer: 'myntra' });
    const scheme = await readLink('ftp://www.myntra.com/x/12345678/buy', opts(vi.fn()));
    expect(scheme.result).toMatchObject({ ok: false, reason: 'not-product', retailer: null });
    const empty = await readLink('https://www.myntra.com/shirts/x/y/12345678/buy', opts(async () => html('<html><head><title>Oops</title></head></html>')));
    expect(empty.result).toMatchObject({ ok: false, reason: 'not-product', retailer: 'myntra' });
  });

  it('blocked: an Akamai wall, a Flipkart CAPTCHA, a 403; and the message offers the screenshot door', async () => {
    const ajio = await readLink('https://www.ajio.com/x/p/441234567', opts(async () => html(fixture('akamai-denied.html'), 403)));
    expect(ajio.result).toMatchObject({ ok: false, reason: 'blocked', retailer: 'ajio' });
    expect((ajio.result as { message: string }).message).toBe("That shop keeps its pages closed. Send me a screenshot of the piece and I'll read it from there.");
    const fk = await readLink('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU', opts(async () => html(fixture('flipkart-captcha.html'))));
    expect(fk.result).toMatchObject({ ok: false, reason: 'blocked', retailer: 'flipkart' });
    expect(fk.extraction).toMatchObject({ detail: 'wall:flipkart-captcha' });
    const zara = await readLink('https://www.zara.com/in/en/x-p01234567.html?v1=1', opts(async () => html('', 403)));
    expect(zara.result).toMatchObject({ ok: false, reason: 'blocked', retailer: 'zara' });
  });

  it('timeout: the shop never answered', async () => {
    const slow = async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    };
    const out = await readLink('https://www.namshi.com/uae-en/buy-x/Z12AB34Z/p/', opts(slow));
    expect(out.result).toMatchObject({ ok: false, reason: 'timeout', retailer: 'namshi' });
  });

  it('a short link that lands on a disabled shop is disabled, and one that lands off-registry is unsupported', async () => {
    process.env.LINK_DISABLED_RETAILERS = 'amazon';
    const out = await readLink('https://a.co/d/abc', opts(async () => redirect('https://www.amazon.in/dp/B07CHLD0M1')));
    expect(out.result).toMatchObject({ ok: false, reason: 'disabled', retailer: 'amazon' });
    delete process.env.LINK_DISABLED_RETAILERS;
    const off = await readLink('https://fkrt.it/abc', opts(async (url: string) => (url.startsWith('https://fkrt.it') ? redirect('https://www.example.com/x') : html('<html></html>'))));
    expect(off.result).toMatchObject({ ok: false, reason: 'unsupported' });
  });
});

describe('mergeReads()', () => {
  it('first non-null wins, images union, the rung with name+image gets the method', () => {
    const { merged, method } = mergeReads([
      { method: 'jsonld', read: { productName: null, price: 100, images: [] } },
      { method: 'opengraph', read: { productName: 'Shirt', price: 120, images: ['a'], brand: 'B' } },
      { method: 'inline', read: { productName: 'Other', images: ['a', 'b'], salePrice: 90 } },
    ]);
    expect(merged).toMatchObject({ productName: 'Shirt', price: 100, brand: 'B', salePrice: 90 });
    expect(merged.images).toEqual(['a', 'b']);
    expect(method).toBe('opengraph');
  });

  it('a sale price that is not below the list price is dropped', () => {
    const { merged } = mergeReads([{ method: 'jsonld', read: { productName: 'x', images: ['i'], price: 100, salePrice: 100 } }]);
    expect(merged.salePrice).toBeNull();
  });
});
