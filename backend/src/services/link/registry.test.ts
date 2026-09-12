import { afterEach, describe, expect, it } from 'vitest';
import { isEnabled, isProductUrl, productIdOf, regionOf, resolveRetailer, retailerById, variantKeyOf } from './registry';

const u = (s: string) => new URL(s);

afterEach(() => {
  delete process.env.LINK_DISABLED_RETAILERS;
});

describe('retailer registry', () => {
  it('maps every host the member might share to its shop, short domains included', () => {
    const cases: [string, string][] = [
      ['https://www.amazon.in/dp/B07XYZ1234', 'amazon'],
      ['https://amazon.ae/Some-Slug/dp/B07XYZ1234/ref=cm_sw', 'amazon'],
      ['https://a.co/d/3kfJ2xy', 'amazon'],
      ['https://amzn.in/d/abc', 'amazon'],
      ['https://amzn.to/xyz', 'amazon'],
      ['https://amzn.eu/d/xyz', 'amazon'],
      ['https://www.myntra.com/shirts/x/y/12345678/buy', 'myntra'],
      ['https://myntra.onelink.me/abc?af_web_dp=x', 'myntra'],
      ['https://www.flipkart.com/x/p/itm123?pid=ABC', 'flipkart'],
      ['https://dl.flipkart.com/s/abc', 'flipkart'],
      ['https://fkrt.it/abc', 'flipkart'],
      ['https://fkrt.cc/abc', 'flipkart'],
      ['https://www.ajio.com/x/p/441234567', 'ajio'],
      ['https://www.namshi.com/uae-en/buy-x/Z12AB34Z/p/', 'namshi'],
      ['https://www.noon.com/uae-en/x/N12345678A/p/', 'noon'],
      ['https://www.next.co.uk/style/st123456/123456', 'next'],
      ['https://www.next.ae/en/style/st123456/123456', 'next'],
      ['https://www.zara.com/in/en/x-p01234567.html?v1=123', 'zara'],
      ['https://www2.hm.com/en_in/productpage.1234567002.html', 'hm'],
      ['https://www.uniqlo.com/in/en/products/E455359-000/00', 'uniqlo'],
      ['https://www.asos.com/us/x/prd/201234567?colourWayId=201234568', 'asos'],
      ['https://www.shein.in/x-p-12345678-cat-1234.html', 'shein'],
    ];
    for (const [url, id] of cases) expect(resolveRetailer(u(url))?.id, url).toBe(id);
    expect(resolveRetailer(u('https://www.example.com/dp/B07XYZ1234'))).toBeNull();
    // A look-alike host is not the shop.
    expect(resolveRetailer(u('https://notamazon.in/dp/B07XYZ1234'))).toBeNull();
  });

  it('knows a product page from a category, and pulls the id out of it', () => {
    const amazon = retailerById('amazon')!;
    expect(productIdOf(amazon, u('https://www.amazon.in/Allen-Solly/dp/B07CHLD0M1/ref=sr_1_3?keywords=polo'))).toBe('B07CHLD0M1');
    expect(productIdOf(amazon, u('https://www.amazon.ae/gp/product/B07CHLD0M1'))).toBe('B07CHLD0M1');
    expect(isProductUrl(amazon, u('https://www.amazon.in/s?k=polo'))).toBe(false);
    const flipkart = retailerById('flipkart')!;
    expect(productIdOf(flipkart, u('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU'))).toBe('itm7f3a4a6c1b2d9');
    expect(variantKeyOf(flipkart, u('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU'))).toBe('JEAG3K2ZQHJZ9YHU');
    expect(isProductUrl(flipkart, u('https://www.flipkart.com/clothing-and-accessories/pr?sid=clo'))).toBe(false);
    const myntra = retailerById('myntra')!;
    expect(productIdOf(myntra, u('https://www.myntra.com/shirts/roadster/x/12345678/buy'))).toBe('12345678');
    expect(isProductUrl(myntra, u('https://www.myntra.com/men-shirts'))).toBe(false);
    const zara = retailerById('zara')!;
    expect(variantKeyOf(zara, u('https://www.zara.com/in/en/linen-shirt-p01234567.html?v1=987654'))).toBe('987654');
    expect(productIdOf(zara, u('https://www.zara.com/in/en/linen-shirt-p01234567.html'))).toBe('01234567');
    const asos = retailerById('asos')!;
    expect(variantKeyOf(asos, u('https://www.asos.com/us/x/prd/201234567?colourWayId=201234568'))).toBe('201234568');
  });

  it('works out the market from the host or the path', () => {
    const amazon = retailerById('amazon')!;
    expect(regionOf(amazon, u('https://www.amazon.in/dp/B07XYZ1234'))).toBe('IN');
    expect(regionOf(amazon, u('https://www.amazon.ae/dp/B07XYZ1234'))).toBe('AE');
    expect(regionOf(retailerById('next')!, u('https://www.next.co.uk/style/st123456/1'))).toBe('UK');
    expect(regionOf(retailerById('zara')!, u('https://www.zara.com/ae/en/x-p01234567.html'))).toBe('AE');
    expect(regionOf(retailerById('hm')!, u('https://www2.hm.com/en_in/productpage.1234567002.html'))).toBe('IN');
    expect(regionOf(retailerById('noon')!, u('https://www.noon.com/uae-en/x/N1A/p/'))).toBe('AE');
  });

  it('honours the registry flag and the LINK_DISABLED_RETAILERS kill switch', () => {
    expect(isEnabled(retailerById('shein')!)).toBe(false);
    expect(isEnabled(retailerById('flipkart')!)).toBe(true);
    process.env.LINK_DISABLED_RETAILERS = 'flipkart, Myntra';
    expect(isEnabled(retailerById('flipkart')!)).toBe(false);
    expect(isEnabled(retailerById('myntra')!)).toBe(false);
    expect(isEnabled(retailerById('amazon')!)).toBe(true);
  });
});
