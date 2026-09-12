import type { LinkReadFailure, VerdictHeadline, VerdictPlaqueLine, WardrobeItem } from '@zauq/shared/types'
import type { NudgeIn, OutboundLink } from '@zauq/shared/store'

// The Fitting Room's pure helpers: reading a link out of shared text or a
// paste, the clipboard door, the headline ladder, and the affiliate label.
// No React in here so the tests run in plain Node.

const URL_RE = /https?:\/\/[^\s<>"'`]+/i

/** The first http(s) URL in a piece of text, with trailing punctuation trimmed. */
export function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const m = URL_RE.exec(text)
  if (!m) return null
  return m[0].replace(/[),.;:!?\]]+$/, '')
}

/**
 * The URL a share target sent: the first http(s) URL in `text`, then `url`,
 * then `title` — Android puts the link in the text more often than in the url.
 */
export function extractShareUrl(params: { title?: string | null; text?: string | null; url?: string | null }): string | null {
  return firstUrl(params.text) ?? firstUrl(params.url) ?? firstUrl(params.title)
}

/** A pasted string that is (or contains) a shop link, or null. */
export function urlFromPaste(text: string): string | null {
  return firstUrl(text.trim())
}

/**
 * The "Paste" button: reads the clipboard inside the click handler where the
 * browser allows it. Resolves null when the API is missing or the member
 * refuses, so the field is still there to paste into by hand.
 */
export async function readClipboardText(nav: Pick<Navigator, 'clipboard'> | undefined = typeof navigator === 'undefined' ? undefined : navigator): Promise<string | null> {
  const read = nav?.clipboard?.readText
  if (typeof read !== 'function') return null
  try {
    const text = await read.call(nav!.clipboard)
    return typeof text === 'string' && text.trim() ? text : null
  } catch {
    return null
  }
}

/** The headline ladder, in the stylist's voice; `em` is the italic brass clause. */
export function headlineFor(h: VerdictHeadline | string | null | undefined): { lead: string; em: string; text: string } {
  switch (h) {
    case 'earns':
      return { lead: 'It would', em: 'earn its place.', text: 'It would earn its place.' }
    case 'could':
      return { lead: 'It', em: 'could work.', text: 'It could work.' }
    case 'wait':
      return { lead: 'I’d wait', em: 'on this one.', text: 'I’d wait on this one.' }
    default:
      return { lead: 'It', em: 'could work.', text: 'It could work.' }
  }
}

/** The honest line when the reader could not read a link, by reason. */
export function readFailureLine(reason: LinkReadFailure['reason'] | string | null | undefined): string {
  switch (reason) {
    case 'not-product':
      return 'That doesn’t look like a product page.'
    case 'unsupported':
      return 'I don’t know that shop yet. A screenshot works.'
    case 'blocked':
    case 'timeout':
    case 'disabled':
    default:
      return 'That shop keeps its pages closed. Send me a screenshot of the piece and I’ll read it from there.'
  }
}

/** Whether a shop link earns the inline "Affiliate" label. Only a wrapped link does. */
export function showsAffiliateBadge(link: Pick<OutboundLink, 'affiliate'> | null | undefined): boolean {
  return link?.affiliate === true
}

/** Whether the room needs the one-line affiliate disclosure at its foot. */
export function needsAffiliateDisclosure(links: Iterable<Pick<OutboundLink, 'affiliate'> | null | undefined>): boolean {
  for (const l of links) if (showsAffiliateBadge(l)) return true
  return false
}

/** The date a nudge lands, for a choice made now. */
export function nudgeDate(nudgeIn: NudgeIn, now = Date.now()): Date | null {
  if (nudgeIn === 'never') return null
  return new Date(now + (nudgeIn === 'fortnight' ? 14 : 30) * 86_400_000)
}

/** The tone's colour class: a flag reads in the danger token, good in brass, a note stays quiet. */
export function toneClass(tone: VerdictPlaqueLine['tone']): string {
  return tone === 'flag' ? 'text-[rgb(var(--c-danger))]' : tone === 'good' ? 'text-brass-ink' : 'text-ink/60'
}

/** The piece's name as the shop gave it, else as the reader saw it. */
export function candidateLabel(it: Pick<WardrobeItem, 'productName' | 'primaryColor' | 'subtype' | 'category'> | null | undefined): string {
  if (!it) return 'this piece'
  if (it.productName) return it.productName
  return [it.primaryColor, it.subtype ?? it.category].filter(Boolean).join(' ') || 'this piece'
}

/** The price to show for a candidate: sale first, then list, then what the member typed. */
export function candidatePrice(it: Pick<WardrobeItem, 'salePrice' | 'listPrice' | 'seenPrice' | 'currency'>): { amount: number; currency: string | null } | null {
  const amount = it.salePrice ?? it.listPrice ?? it.seenPrice
  if (amount == null) return null
  return { amount, currency: it.currency ?? null }
}

/** "as of 12 Sep" — a price never travels without its date. */
export function asOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'as of today'
  if (days === 1) return 'as of yesterday'
  return `as of ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

/** A one-word availability state for a badge, or null when the shop did not say. */
export function availabilityLabel(a: WardrobeItem['availability']): string | null {
  switch (a) {
    case 'in_stock':
      return 'In stock'
    case 'out_of_stock':
      return 'Out of stock'
    case 'preorder':
      return 'Pre-order'
    default:
      return null
  }
}
