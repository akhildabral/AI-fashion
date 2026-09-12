import { describe, expect, it, vi } from 'vitest'
import {
  extractShareUrl,
  firstUrl,
  headlineFor,
  needsAffiliateDisclosure,
  readClipboardText,
  readFailureLine,
  showsAffiliateBadge,
  urlFromPaste,
} from './fitting-room'

describe('share target URL extraction', () => {
  it('takes the first http(s) URL from the shared text before url or title', () => {
    expect(
      extractShareUrl({
        title: 'Check this out https://title.example/x',
        text: 'Look at this: https://www.myntra.com/tshirts/brand/p/123?utm=1 nice one',
        url: 'https://url.example/y',
      }),
    ).toBe('https://www.myntra.com/tshirts/brand/p/123?utm=1')
  })

  it('falls back to url, then title', () => {
    expect(extractShareUrl({ text: 'no link here', url: 'https://www.flipkart.com/p/itm?pid=ABC' })).toBe('https://www.flipkart.com/p/itm?pid=ABC')
    expect(extractShareUrl({ text: 'nothing', url: '', title: 'From https://www.ajio.com/p/1' })).toBe('https://www.ajio.com/p/1')
    expect(extractShareUrl({ text: 'nothing', url: null, title: 'plain' })).toBeNull()
  })

  it('trims trailing punctuation and ignores non-http schemes', () => {
    expect(firstUrl('see https://zara.com/en/shirt-p01.html.')).toBe('https://zara.com/en/shirt-p01.html')
    expect(firstUrl('(https://hm.com/p/1)')).toBe('https://hm.com/p/1')
    expect(firstUrl('myntra://product/1')).toBeNull()
    expect(firstUrl('')).toBeNull()
  })

  it('reads a URL out of a paste that carries surrounding text', () => {
    expect(urlFromPaste('  https://www.amazon.in/dp/B0ABC?th=1 \n')).toBe('https://www.amazon.in/dp/B0ABC?th=1')
    expect(urlFromPaste('just words')).toBeNull()
  })
})

describe('the Paste button', () => {
  it('returns the clipboard text when the browser allows it', async () => {
    const nav = { clipboard: { readText: vi.fn(async () => 'https://www.noon.com/uae-en/p/1') } } as unknown as Navigator
    await expect(readClipboardText(nav)).resolves.toBe('https://www.noon.com/uae-en/p/1')
    expect(nav.clipboard.readText).toHaveBeenCalledTimes(1)
  })

  it('tolerates a refusal and a missing API', async () => {
    const refused = { clipboard: { readText: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError') }) } } as unknown as Navigator
    await expect(readClipboardText(refused)).resolves.toBeNull()
    await expect(readClipboardText({} as Navigator)).resolves.toBeNull()
    await expect(readClipboardText(undefined)).resolves.toBeNull()
  })

  it('treats an empty clipboard as nothing to paste', async () => {
    const nav = { clipboard: { readText: async () => '   ' } } as unknown as Navigator
    await expect(readClipboardText(nav)).resolves.toBeNull()
  })
})

describe('verdict headline ladder', () => {
  it('maps the three rungs to the stylist’s lines', () => {
    expect(headlineFor('earns').text).toBe('It would earn its place.')
    expect(headlineFor('could').text).toBe('It could work.')
    expect(headlineFor('wait').text).toBe('I’d wait on this one.')
  })
  it('never says don’t buy, and reads an unknown rung as the middle one', () => {
    for (const h of ['earns', 'could', 'wait', 'something-else', null] as const) {
      expect(headlineFor(h).text.toLowerCase()).not.toContain('don’t buy')
    }
    expect(headlineFor('something-else').text).toBe('It could work.')
  })
  it('splits the italic clause off the lead', () => {
    const h = headlineFor('earns')
    expect(`${h.lead} ${h.em}`).toBe(h.text)
  })
})

describe('read failure lines', () => {
  it('speaks per reason', () => {
    expect(readFailureLine('not-product')).toBe('That doesn’t look like a product page.')
    expect(readFailureLine('unsupported')).toBe('I don’t know that shop yet. A screenshot works.')
    const closed = 'That shop keeps its pages closed. Send me a screenshot of the piece and I’ll read it from there.'
    expect(readFailureLine('blocked')).toBe(closed)
    expect(readFailureLine('timeout')).toBe(closed)
    expect(readFailureLine('disabled')).toBe(closed)
  })
})

describe('the affiliate label', () => {
  it('shows only for a wrapped link', () => {
    expect(showsAffiliateBadge({ affiliate: true })).toBe(true)
    expect(showsAffiliateBadge({ affiliate: false })).toBe(false)
    expect(showsAffiliateBadge(null)).toBe(false)
    expect(showsAffiliateBadge(undefined)).toBe(false)
  })
  it('discloses at the foot of the room when any card is affiliate', () => {
    expect(needsAffiliateDisclosure([null, { affiliate: false }, { affiliate: true }])).toBe(true)
    expect(needsAffiliateDisclosure([{ affiliate: false }, undefined])).toBe(false)
    expect(needsAffiliateDisclosure([])).toBe(false)
  })
})
