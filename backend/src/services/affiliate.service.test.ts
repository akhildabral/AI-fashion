import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { affiliateTemplates, wrapOutbound } from './affiliate.service';

// Affiliate wrapping is configuration: a retailer with a template gets its
// link wrapped and labelled, everyone else gets the canonical link back.

const ENV = JSON.stringify({
  'amazon.in': 'https://www.amazon.in/dp/{asin}?tag=zauq-21',
  flipkart: 'https://dl.flipkart.com/dl/{path}?affid=zauq',
  myntra: 'https://go.example.com/click?url={url}',
});

describe('wrapOutbound', () => {
  it('wraps a configured retailer and labels it', () => {
    const r = wrapOutbound('https://www.amazon.in/Levis-Jeans/dp/B0ABCDEFGH/ref=sr_1_1?keywords=jeans', 'amazon.in', ENV);
    expect(r).toEqual({ url: 'https://www.amazon.in/dp/B0ABCDEFGH?tag=zauq-21', affiliate: true });
    const f = wrapOutbound('https://www.flipkart.com/p/itm123abc?pid=ABC123', 'flipkart', ENV);
    expect(f).toEqual({ url: 'https://dl.flipkart.com/dl/p/itm123abc?pid=ABC123?affid=zauq', affiliate: true });
    const m = wrapOutbound('https://www.myntra.com/jeans/levis/123', null, ENV);
    expect(m.affiliate).toBe(true);
    expect(m.url).toBe(`https://go.example.com/click?url=${encodeURIComponent('https://www.myntra.com/jeans/levis/123')}`);
  });

  it('matches by hostname when the retailer name is missing or different', () => {
    const r = wrapOutbound('https://amazon.in/dp/B0ABCDEFGH', 'Amazon', ENV);
    expect(r.affiliate).toBe(true);
  });

  it('leaves an unconfigured retailer unchanged and unlabelled', () => {
    const url = 'https://www.zara.com/in/en/jacket-p0123.html';
    expect(wrapOutbound(url, 'zara', ENV)).toEqual({ url, affiliate: false });
    expect(wrapOutbound(url, 'zara', undefined)).toEqual({ url, affiliate: false });
    expect(wrapOutbound(url, 'zara', '')).toEqual({ url, affiliate: false });
  });

  it('falls back to the canonical link when a placeholder cannot be filled', () => {
    const url = 'https://www.amazon.in/s?k=jeans';
    expect(wrapOutbound(url, 'amazon.in', ENV)).toEqual({ url, affiliate: false });
  });

  it('treats malformed env as no templates, without throwing', () => {
    const url = 'https://www.amazon.in/dp/B0ABCDEFGH';
    expect(wrapOutbound(url, 'amazon.in', '{not json')).toEqual({ url, affiliate: false });
    expect(wrapOutbound(url, 'amazon.in', '["a","b"]')).toEqual({ url, affiliate: false });
    expect(wrapOutbound(url, 'amazon.in', '{"amazon.in": 42}')).toEqual({ url, affiliate: false });
    expect(affiliateTemplates('{"amazon.in":"ftp://nope/{asin}","ok":"https://x.y/{id}"}')).toEqual({ ok: 'https://x.y/{id}' });
  });

  it('never wraps a non-http link', () => {
    expect(wrapOutbound('javascript:alert(1)', 'amazon.in', ENV)).toEqual({ url: 'javascript:alert(1)', affiliate: false });
    expect(wrapOutbound('not a url', 'amazon.in', ENV)).toEqual({ url: 'not a url', affiliate: false });
  });
});
