import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserHeaders, detectWall, fetchPage, MAX_BODY_BYTES, readCapped, resetThrottle, throttle } from './fetch';
import { retailerById } from './registry';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');
const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

beforeEach(() => resetThrottle());
afterEach(() => vi.useRealTimers());

describe('wall detection', () => {
  it('names the walls the research catalogued', () => {
    expect(detectWall(200, 'https://www.ajio.com/x/p/441234567', fixture('akamai-denied.html'))).toBe('akamai');
    expect(detectWall(200, 'https://www.flipkart.com/x/p/itm1?pid=A', fixture('flipkart-captcha.html'))).toBe('flipkart-captcha');
    expect(detectWall(200, 'https://www.flipkart.com/x', '<html></html>', new Headers({ 'x-captcha-validate': '1' }))).toBe('flipkart-captcha');
    expect(detectWall(500, 'https://www.amazon.in/dp/B07CHLD0M1', '<html><body>503 Service Unavailable. api-services-support@amazon.com</body></html>')).toBe('amazon-wall');
    expect(detectWall(200, 'https://www.shein.in/risk/challenge?captcha_type=909', '<html></html>')).toBe('shein-challenge');
    expect(detectWall(403, 'https://www.zara.com/x', '<html></html>')).toBe('http');
    expect(detectWall(429, 'https://www.zara.com/x', '<html></html>')).toBe('http');
    expect(detectWall(503, 'https://www.zara.com/x', '<html></html>')).toBe('http');
  });

  it('lets a real product page through even when Akamai scripts are on it', () => {
    expect(detectWall(200, 'https://www.flipkart.com/x/p/itm1?pid=A', fixture('flipkart-product.html'))).toBeNull();
    expect(detectWall(200, 'https://www.amazon.in/dp/B07CHLD0M1', fixture('amazon-in.html'))).toBeNull();
  });
});

describe('fetchPage()', () => {
  const flipkart = retailerById('flipkart')!;
  const url = new URL('https://www.flipkart.com/x/p/itm7f3a4a6c1b2d9?pid=JEAG3K2ZQHJZ9YHU');

  it('sends browser headers with the market language and returns the page', async () => {
    const fetchImpl = vi.fn(async () => html(fixture('flipkart-product.html')));
    const page = await fetchPage(url, flipkart, { fetchImpl, noThrottle: true });
    expect(page.status).toBe(200);
    expect(page.html).toContain('application/ld+json');
    expect(page.truncated).toBe(false);
    const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['user-agent']).toMatch(/Mozilla\/5\.0.*Chrome/);
    expect(headers['accept-language']).toMatch(/^en-IN/);
    expect(browserHeaders('AE')['accept-language']).toMatch(/^en-AE/);
    expect(browserHeaders('UK')['accept-language']).toMatch(/^en-GB/);
  });

  it('reports walls as blocked, gone pages as not-product, other statuses as blocked', async () => {
    await expect(fetchPage(url, flipkart, { fetchImpl: async () => html(fixture('flipkart-captcha.html')), noThrottle: true })).rejects.toMatchObject({ reason: 'blocked', message: 'wall:flipkart-captcha' });
    await expect(fetchPage(url, flipkart, { fetchImpl: async () => html(fixture('akamai-denied.html'), 403), noThrottle: true })).rejects.toMatchObject({ reason: 'blocked' });
    await expect(fetchPage(url, flipkart, { fetchImpl: async () => html('<html></html>', 404), noThrottle: true })).rejects.toMatchObject({ reason: 'not-product' });
    await expect(fetchPage(url, flipkart, { fetchImpl: async () => html('<html></html>', 302), noThrottle: true })).rejects.toMatchObject({ reason: 'blocked' });
    await expect(fetchPage(url, flipkart, { fetchImpl: async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } }), noThrottle: true })).rejects.toMatchObject({ reason: 'not-product' });
  });

  it('retries once on a network error, and reports a timeout as timeout', async () => {
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls++;
      if (calls === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
      return html(fixture('flipkart-product.html'));
    });
    const page = await fetchPage(url, flipkart, { fetchImpl: flaky, noThrottle: true, sleep: async () => undefined });
    expect(page.status).toBe(200);
    expect(flaky).toHaveBeenCalledTimes(2);

    const dead = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(fetchPage(url, flipkart, { fetchImpl: dead, noThrottle: true, sleep: async () => undefined })).rejects.toMatchObject({ reason: 'blocked' });
    expect(dead).toHaveBeenCalledTimes(2);

    const slow = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    });
    await expect(fetchPage(url, flipkart, { fetchImpl: slow, noThrottle: true })).rejects.toMatchObject({ reason: 'timeout' });
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('caps the body at 3 MB and flags the truncation', async () => {
    const big = '<html><head><title>x</title></head><body>' + 'a'.repeat(MAX_BODY_BYTES + 1000) + '</body></html>';
    const { text, truncated } = await readCapped(html(big));
    expect(truncated).toBe(true);
    expect(Buffer.byteLength(text)).toBe(MAX_BODY_BYTES);
  });
});

describe('per-retailer token bucket', () => {
  it('spaces requests to one shop a second apart, independently per shop', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    await throttle('flipkart', 1000, sleep);
    await throttle('flipkart', 1000, sleep);
    await throttle('flipkart', 1000, sleep);
    await throttle('amazon', 1000, sleep);
    expect(waits).toEqual([1000, 2000]);
    // Time passes: no wait.
    await throttle('flipkart', 10_000, sleep);
    expect(waits).toEqual([1000, 2000]);
  });
});
