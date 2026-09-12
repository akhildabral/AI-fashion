import { describe, expect, it, vi } from 'vitest';
import { canonicalUrlFor, isPrivateHost, prepare, resolveRedirects, stripTracking, unwrap } from './canonical';
import { retailerById } from './registry';
import { LinkError } from './types';

const u = (s: string) => new URL(s);

describe('prepare(): what a pasted link becomes before any fetch', () => {
  it('strips tracking parameters and the Amazon /ref= tail', () => {
    const out = prepare(
      'https://www.amazon.in/Allen-Solly-Polo/dp/B07CHLD0M1/ref=sr_1_3?crid=ABC&keywords=polo&qid=1700000000&sprefix=polo%2Caps%2C300&sr=8-3&th=1&psc=1&utm_source=share&pf_rd_r=XYZ&pd_rd_w=ABC&linkCode=sl1&tag=zauq-21&ascsubtag=x',
    );
    expect(out.toString()).toBe('https://www.amazon.in/Allen-Solly-Polo/dp/B07CHLD0M1');
  });

  it('keeps Flipkart pid, Zara v1 and ASOS colourWayId while dropping the rest', () => {
    expect(
      prepare('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU&lid=LSTJEAG3K2ZQHJZ9YHU3JAQGX&marketplace=FLIPKART&otracker=search&otracker1=search&srno=s_1_1&ppn=x&ppt=y&fm=z&st=q&qH=abc&ctx=x&nnc=y&cid=z&spm=1&fbclid=abc&gclid=def&msclkid=g&af_xp=custom&cmpid=x&affid=y&affExtParam1=z').toString(),
    ).toBe('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU');
    expect(prepare('https://www.zara.com/in/en/linen-shirt-p01234567.html?v1=987654&v2=111&utm_campaign=x').toString()).toBe(
      'https://www.zara.com/in/en/linen-shirt-p01234567.html?v1=987654&v2=111',
    );
    expect(prepare('https://www.asos.com/us/x/prd/201234567?colourWayId=201234568&cid=1234&utm_medium=share').toString()).toBe(
      'https://www.asos.com/us/x/prd/201234567?colourWayId=201234568',
    );
  });

  it('unwraps a Myntra OneLink (af_web_dp, deep_link_value) down to the product URL', () => {
    const one =
      'https://myntra.onelink.me/BPAv/abc123?af_dp=myntra%3A%2F%2F&deep_link_value=myntra%3A%2F%2Fwww.myntra.com%2Fshirts%2Froadster%2Fx%2F12345678%2Fbuy&af_web_dp=https%3A%2F%2Fwww.myntra.com%2Fshirts%2Froadster%2Fx%2F12345678%2Fbuy%3Futm_source%3Dshare&pid=share';
    expect(prepare(one).toString()).toBe('https://www.myntra.com/shirts/roadster/x/12345678/buy');
    // deep_link_value alone, as a myntra:// deep link with the path inside.
    expect(
      unwrap(u('https://myntra.onelink.me/x?deep_link_value=myntra%3A%2F%2Fwww.myntra.com%2Fshirts%2Froadster%2Fx%2F12345678%2Fbuy')).toString(),
    ).toBe('https://www.myntra.com/shirts/roadster/x/12345678/buy');
  });

  it('accepts a link with text around it, and a bare host', () => {
    expect(prepare('Check this out https://www.flipkart.com/x/p/itm1?pid=AB12 nice').toString()).toBe('https://www.flipkart.com/x/p/itm1?pid=AB12');
    expect(prepare('www.myntra.com/shirts/x/y/12345678/buy').toString()).toBe('https://www.myntra.com/shirts/x/y/12345678/buy');
  });

  it('refuses non-http schemes, credentials and private hosts', () => {
    for (const bad of ['ftp://www.amazon.in/dp/B07CHLD0M1', 'javascript:alert(1)', 'http://user:pw@www.amazon.in/dp/B07CHLD0M1', 'http://localhost:3000/dp/B07CHLD0M1', 'http://127.0.0.1/x', 'http://10.0.0.5/x', 'http://192.168.1.2/x', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/x', 'not a link at all']) {
      expect(() => prepare(bad), bad).toThrow(LinkError);
    }
    expect(isPrivateHost('www.amazon.in')).toBe(false);
    expect(isPrivateHost('172.20.1.1')).toBe(true);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
  });

  it('never unwraps a url= param into an unknown host', () => {
    expect(unwrap(u('https://www.flipkart.com/x/p/itm1?pid=AB12&url=https%3A%2F%2Fevil.example%2F')).hostname).toBe('www.flipkart.com');
  });
});

describe('resolveRedirects(): short links', () => {
  const redirect = (to: string) => new Response(null, { status: 301, headers: { location: to } });
  const page = (body = '<html></html>') => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

  it('follows an a.co short link to the /dp/ page with GET and drops the ref_ it lands with', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://a.co/d/3kfJ2xy') return redirect('https://www.amazon.in/dp/B07CHLD0M1?ref_=cm_sw_r_apan_dp_ABC&th=1');
      return page();
    });
    const out = await resolveRedirects(u('https://a.co/d/3kfJ2xy'), { 'user-agent': 'x' }, fetchImpl);
    expect(out.finalUrl.toString()).toBe('https://www.amazon.in/dp/B07CHLD0M1');
    expect(out.hops).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'manual' });
  });

  it('follows fkrt.it → dl.flipkart.com → flipkart.com keeping pid, unwrapping wrappers on the way', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('https://fkrt.it/')) return redirect('https://dl.flipkart.com/s/abc?af_web_dp=https%3A%2F%2Fwww.flipkart.com%2Flevi-s%2Fp%2Fitm7f3a4a6c1b2d9%3Fpid%3DJEAG3K2ZQHJZ9YHU%26lid%3DLST123%26marketplace%3DFLIPKART');
      if (url.startsWith('https://dl.flipkart.com/')) return redirect('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU&lid=LST123');
      return page();
    });
    const out = await resolveRedirects(u('https://fkrt.it/abc'), {}, fetchImpl);
    expect(out.finalUrl.toString()).toBe('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU');
    // The af_web_dp wrapper was unwrapped before the second hop was fetched.
    expect(fetchImpl.mock.calls[1][0]).toBe('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after five hops and refuses a redirect into a private host', async () => {
    const loop = vi.fn(async (url: string) => redirect(url.replace(/\d*$/, (n) => String(Number(n || 0) + 1))));
    await expect(resolveRedirects(u('https://a.co/d/x1'), {}, loop)).rejects.toMatchObject({ reason: 'not-product' });
    const inward = vi.fn(async () => redirect('http://169.254.169.254/latest/meta-data'));
    await expect(resolveRedirects(u('https://a.co/d/x'), {}, inward)).rejects.toMatchObject({ reason: 'not-product' });
  });
});

describe('canonicalUrlFor(): the URL a candidate is stored under', () => {
  it('Amazon: rebuilds /dp/<child ASIN> from the shared link, ignoring the page canonical that points at the parent', () => {
    const html = '<html><head><link rel="canonical" href="https://www.amazon.in/Allen-Solly/dp/B07PARENT1"></head></html>';
    const out = canonicalUrlFor(retailerById('amazon')!, u('https://www.amazon.in/Allen-Solly-Polo/dp/B07CHLD0M1'), u('https://www.amazon.in/Allen-Solly-Polo/dp/B07CHLD0M1'), html);
    expect(out).toBe('https://www.amazon.in/dp/B07CHLD0M1');
    // A short link: the child is only known from where we landed.
    expect(canonicalUrlFor(retailerById('amazon')!, u('https://www.amazon.ae/dp/B07CHLD0M1'), u('https://a.co/d/abc'), html)).toBe('https://www.amazon.ae/dp/B07CHLD0M1');
  });

  it('Flipkart: prefers rel=canonical but puts the pid back when the canonical dropped it', () => {
    const html =
      '<html><head><link rel="canonical" href="https://www.flipkart.com/levi-s-men-slim-fit/p/itm7f3a4a6c1b2d9"><meta property="og:url" content="https://www.flipkart.com/levi-s-men-slim-fit/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU"></head></html>';
    const shared = u('https://www.flipkart.com/levi-s/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU');
    expect(canonicalUrlFor(retailerById('flipkart')!, shared, shared, html)).toBe('https://www.flipkart.com/levi-s-men-slim-fit/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU');
  });

  it('falls back to og:url, then the landed URL, and ignores a canonical that is not a product page of this shop', () => {
    const zara = retailerById('zara')!;
    const shared = u('https://www.zara.com/in/en/linen-shirt-p01234567.html?v1=987654&utm_source=x');
    const ogOnly = '<html><head><meta property="og:url" content="https://www.zara.com/in/en/linen-shirt-p01234567.html?v1=987654"></head></html>';
    expect(canonicalUrlFor(zara, shared, shared, ogOnly)).toBe('https://www.zara.com/in/en/linen-shirt-p01234567.html?v1=987654');
    const homeCanonical = '<html><head><link rel="canonical" href="https://www.zara.com/in/"></head></html>';
    expect(canonicalUrlFor(zara, shared, shared, homeCanonical)).toBe('https://www.zara.com/in/en/linen-shirt-p01234567.html?v1=987654');
    expect(canonicalUrlFor(zara, shared, shared, null)).toBe('https://www.zara.com/in/en/linen-shirt-p01234567.html?v1=987654');
  });

  it('stripTracking leaves a shop\'s real params alone', () => {
    expect(stripTracking(u('https://www.next.ae/en/style/st123456/123456?size=M')).toString()).toBe('https://www.next.ae/en/style/st123456/123456?size=M');
  });
});
