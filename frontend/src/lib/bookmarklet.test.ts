import { describe, expect, it } from 'vitest'
import { bookmarkletHref, bookmarkletTarget } from './bookmarklet'

describe('the bookmarklet', () => {
  it('builds the javascript: link against the production origin', () => {
    expect(bookmarkletHref('https://myzauq.com')).toBe(
      "javascript:location.href='https://myzauq.com/closet/store?url='+encodeURIComponent(location.href)+'&door=bookmarklet'",
    )
  })

  it('points a dev build at itself and tolerates a trailing slash', () => {
    expect(bookmarkletHref('http://localhost:5173/')).toBe(
      "javascript:location.href='http://localhost:5173/closet/store?url='+encodeURIComponent(location.href)+'&door=bookmarklet'",
    )
  })

  it('produces the same address the link would navigate to', () => {
    const page = 'https://www.myntra.com/jackets/x/p/123?utm=1&x=y'
    const target = bookmarkletTarget('https://myzauq.com', page)
    const u = new URL(target)
    expect(u.origin).toBe('https://myzauq.com')
    expect(u.pathname).toBe('/closet/store')
    expect(u.searchParams.get('url')).toBe(page)
    expect(u.searchParams.get('door')).toBe('bookmarklet')
  })
})
