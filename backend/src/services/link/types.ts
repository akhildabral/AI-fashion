// The shop-link reader's contract. Mirrors `LinkRead` / `LinkReadFailure` in
// packages/shared/src/types.ts — the backend workspace does not import the
// shared package, so the shapes are restated here and must stay in step.

export type Availability = 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';

export type ReadMethod = 'jsonld' | 'opengraph' | 'inline' | 'vendor';

export type FailReason = 'blocked' | 'not-product' | 'unsupported' | 'disabled' | 'timeout';

/** What the reader extracted from a shop link. */
export interface LinkRead {
  ok: true;
  /** Registry id (e.g. `flipkart`); the display name is `retailerName`. */
  retailer: string;
  canonicalUrl: string;
  productName: string | null;
  brand: string | null;
  /** The list price (MRP). When the shop shows one price only, it lands here. */
  price: number | null;
  /** The current selling price when it differs from the list price. */
  salePrice: number | null;
  currency: string | null;
  availability: Availability;
  images: string[];
  chosenColour: string | null;
  chosenSize: string | null;
  sizeOptions: string[];
  /** ISO time the page was read; prices are shown with it. */
  asOf: string;
  /** Which rung of the reading ladder produced the name and image. */
  method: ReadMethod;
}

export interface LinkReadFailure {
  ok: false;
  /** blocked: the shop refused; not-product: not a product page; unsupported: no parser; disabled: switched off. */
  reason: FailReason;
  retailer: string | null;
  message: string;
}

export type LinkReadResult = LinkRead | LinkReadFailure;

/**
 * What one rung of the ladder found. Every field is optional; the reader
 * merges rungs first-non-null-wins. `raw` is the parsed structure the rung
 * worked from (JSON-LD node, OG map, twister block) and is kept on the item
 * as `extraction` — never the HTML.
 */
export interface PartialRead {
  productName?: string | null;
  brand?: string | null;
  price?: number | null;
  salePrice?: number | null;
  currency?: string | null;
  availability?: Availability | null;
  images?: string[];
  chosenColour?: string | null;
  chosenSize?: string | null;
  sizeOptions?: string[];
  /** A canonical URL the page itself declared (rel=canonical / og:url). */
  canonicalUrl?: string | null;
  raw?: unknown;
}

/** What the rungs need to know about the link being read. */
export interface ReadContext {
  retailerId: string;
  /** The product id from the URL (ASIN, pid, style id…). */
  productId: string | null;
  /** The variant key the member shared (child ASIN, Flipkart pid, Zara v1, ASOS colourWayId). */
  variantKey: string | null;
  finalUrl: string;
  sharedUrl: string;
}

export class LinkError extends Error {
  reason: FailReason;
  constructor(reason: FailReason, message: string) {
    super(message);
    this.name = 'LinkError';
    this.reason = reason;
  }
}

export const FAIL_MESSAGES: Record<FailReason, string> = {
  blocked: "That shop keeps its pages closed. Send me a screenshot of the piece and I'll read it from there.",
  disabled: "I can't read links from that shop right now. Send me a screenshot of the piece and I'll read it from there.",
  unsupported: "I don't know that shop yet. Send me a screenshot of the piece and I'll read it from there.",
  'not-product': "That link isn't a product page. Paste the link of one piece, or send me a screenshot.",
  timeout: 'The shop took too long to answer. Try again in a moment, or send me a screenshot of the piece.',
};

export function failure(reason: FailReason, retailer: string | null, message = FAIL_MESSAGES[reason]): LinkReadFailure {
  return { ok: false, reason, retailer, message };
}
