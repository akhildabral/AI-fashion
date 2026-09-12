// Runs on Node's own test runner: `node --test` from browser-extension/.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStoreUrl, isProductUrl, normalizeOrigin, PRODUCTION_ORIGIN } from '../src/zauq-url.js'

test('normalizeOrigin keeps production, adds https, drops paths', () => {
  assert.equal(normalizeOrigin('https://myzauq.com'), 'https://myzauq.com')
  assert.equal(normalizeOrigin('myzauq.com'), 'https://myzauq.com')
  assert.equal(normalizeOrigin('  https://myzauq.com/closet/store  '), 'https://myzauq.com')
  assert.equal(normalizeOrigin('https://MyZauq.com:443/'), 'https://myzauq.com')
})

test('normalizeOrigin allows http only for localhost', () => {
  assert.equal(normalizeOrigin('http://localhost:5173'), 'http://localhost:5173')
  assert.equal(normalizeOrigin('http://127.0.0.1:5173/x'), 'http://127.0.0.1:5173')
  assert.equal(normalizeOrigin('http://example.com'), null)
  assert.equal(normalizeOrigin('ftp://myzauq.com'), null)
  assert.equal(normalizeOrigin(''), null)
  assert.equal(normalizeOrigin('not a url'), null)
  assert.equal(normalizeOrigin(undefined), null)
})

test('isProductUrl accepts web pages and refuses browser pages', () => {
  assert.equal(isProductUrl('https://www.myntra.com/jackets/x/p/1'), true)
  assert.equal(isProductUrl('http://shop.local/p/1'), true)
  assert.equal(isProductUrl('chrome://extensions'), false)
  assert.equal(isProductUrl('about:blank'), false)
  assert.equal(isProductUrl(undefined), false)
  assert.equal(isProductUrl(''), false)
})

test('buildStoreUrl encodes the tab address and names the door', () => {
  const tab = 'https://www.zara.com/in/en/textured-jacket-p04387300.html?v1=3&v2=4'
  const out = buildStoreUrl('https://myzauq.com', tab)
  const u = new URL(out)
  assert.equal(u.origin, PRODUCTION_ORIGIN)
  assert.equal(u.pathname, '/closet/store')
  assert.equal(u.searchParams.get('url'), tab)
  assert.equal(u.searchParams.get('door'), 'extension')
  assert.equal(out, `https://myzauq.com/closet/store?url=${encodeURIComponent(tab).replace(/%20/g, '+')}&door=extension`)
})

test('buildStoreUrl falls back to production for a bad origin and to the paste door for a bad tab', () => {
  const out = buildStoreUrl('http://example.com', 'chrome://newtab')
  assert.equal(out, 'https://myzauq.com/closet/store?door=extension')
  assert.equal(buildStoreUrl(undefined, undefined), 'https://myzauq.com/closet/store?door=extension')
})

test('buildStoreUrl respects a dev origin and a custom door', () => {
  const out = buildStoreUrl('localhost:5173', 'https://www.hm.com/en_in/productpage.1.html', 'bookmarklet')
  assert.equal(out, 'https://localhost:5173/closet/store?url=https%3A%2F%2Fwww.hm.com%2Fen_in%2Fproductpage.1.html&door=bookmarklet')
  assert.equal(buildStoreUrl('http://localhost:5173', 'https://a.b/c').startsWith('http://localhost:5173/closet/store?'), true)
})
