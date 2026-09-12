# The Fitting Room — shop links, store scans and the wishlist

*Spec v1 · 12 September 2026 · web first. Inputs: the discovery brief, `docs/research/store-link-ingestion.md`, and the owner's answers of 12 Sept.*

## Problem statement

Members buy clothes they already own a version of, that don't go with anything they have, or that don't suit their build and taste, because at the moment of decision (in a shop, or browsing Myntra on the sofa) nothing consults their closet. ZAUQ's current store scan answers only "how many outfits" from a photo, ignores everything it knows about the member, can't read a link, and the wishlist is a list with a one-shot nudge. The cost of not solving it: the product's core promise ("a stylist for the clothes you own") stops at the shop door, which is exactly where members spend money.

## Goals

1. **Any piece, three doors.** A member can ask the closet about a piece from a photo in the shop, a link from any shopping app or browser, or a screenshot, and get the same verdict page. Target: link read success ≥ 85% on the ten priority retailers; verdict within 10 s of a link, 15 s of a photo.
2. **A verdict that knows them.** The verdict answers all three questions (should I buy it, will I wear it, does it flatter me) using the closet, the taste profile, the body and fit profile, budget and climate, in the stylist's suggestive voice. Target: ≥ 60% of verdicts viewed lead to a Keep, Pass or Buy within the session (a decision was made).
3. **A wishlist that is a place.** Kept pieces hold their link, price with date, verdict and try-on, and quietly help the Closet spot gaps. Target: ≥ 30% of members who import a piece return to the wishlist within 14 days; wishlist → Bought conversion tracked.
4. **Clean on terms and privacy.** Member-initiated single fetches, links kept rather than pages copied, product images transient, prices timestamped, affiliate links labelled. Target: zero retailer complaints; a per-retailer kill switch that disables a parser in one deploy.

## Non-goals (this version)

- **Mobile app changes.** Web only; the native share extension and mobile screens come later in one batch.
- **Sharing wishlist items to the circle.** Owner decision; revisit after launch.
- **Price and stock alerts.** Requires live tracking; the data model is designed for it, the scheduler isn't built.
- **Size-in-brand guidance from retailer size charts.** Needs measurements plus per-brand charts; v1 captures optional measurements and gives fit guidance from body type, cut and length only.
- **Amazon Creators API / affiliate product data.** Requires ten qualifying sales a month; v1 affiliate support is link-wrapping only, where a programme is configured.
- **Bulk import, price comparison across shops, "find me a cheaper one".**

## User stories

**The browser at home**
- As a member browsing Myntra on my phone, I want to paste the product link into ZAUQ and see whether it fits my closet so that I decide before I pay.
- As a member with the web app installed on Android, I want to share a product straight from the retailer's app to ZAUQ so that I don't copy links by hand.
- As a member on a laptop, I want a browser button that sends the page I'm on to ZAUQ so that the verdict is one click away.
- As a member whose link ZAUQ can't read, I want to drop a screenshot instead so that I never hit a dead end.

**The shopper in the mall**
- As a member holding a piece in a shop, I want one photo to tell me how many outfits it makes, whether I already own something like it and what a wear would cost so that I can put it back or take it to the till.
- As a member photographing a rail with several pieces, I want to pick which one I mean so that the wishlist doesn't fill with things I never asked about.

**The verdict**
- As a member, I want the verdict to say whether the piece suits my taste and build, not just my closet, so that I trust it.
- As a member, I want the verdict to notice when I already own a near-identical piece so that I don't buy a fourth white shirt.
- As a member, I want to see the piece on my own reflection before deciding so that I'm not guessing from a flat photo.
- As a member, I want the stylist's tone to be suggestive, not a "don't buy", so that the decision stays mine.

**The wishlist**
- As a member, I want kept pieces to remember where they came from, what they cost and when, so that I can go back and buy them.
- As a member, I want the Closet to tell me when a wishlist piece would fill a gap, without it turning up in my daily brief, so that the wishlist helps without nagging.
- As a member, I want to mark a piece as bought and have it join my closet with its price and source intact so that tomorrow's brief knows.
- As a member, I want to change or cancel a reminder so that it feels like mine.

**Fit**
- As a member who wants better fit advice, I want to add my measurements to my profile so that the verdict can talk about fit, not only colour and style.

## Requirements

### P0 · Must have

**R1. Paste-a-link door (web).**
The Wishlist room and the store page carry a paste field. Pasting a URL starts the import; a "Paste" button reads the clipboard on click where the browser allows. Short links, tracking parameters and app-link wrappers are canonicalised server-side; Flipkart `pid` and Amazon child ASIN are kept.
- Given a Myntra/Flipkart/Ajio/Noon/Namshi/ASOS/Zara/H&M/Next/Amazon link, when pasted, then within 10 s the product card shows name, brand, price with currency and "as of" time, the image, colour and size if the link carried them, and the verdict starts.
- Given a link the reader cannot open, when it fails, then the member sees "That shop keeps its pages closed. Send me a screenshot of the piece and I'll read it from there." with a file input, and the failure is logged per retailer.
- Given a non-product URL, when pasted, then the member is told it isn't a product page.

**R2. Reading ladder and retailer registry.**
A server-side reader tries, in order: JSON-LD `Product`/`ProductGroup`, Open Graph, per-retailer inline-state parsers (Amazon .in/.ae twister JSON, Uniqlo preloaded state), then an optional vendor extractor (behind `LINK_EXTRACTOR=zyte|none` with a key), then gives up honestly. Fetches use a browser user agent, a 10 s timeout, one retry, and one request per retailer per second. A registry maps hostnames to retailer name, id regex, parser and an enabled flag (the kill switch). Each parser has fixture tests from saved HTML.
- Given a retailer's parser is disabled in config, when a link for it is pasted, then the screenshot door is offered immediately.

**R3. Screenshot / upload door.**
The existing photo pipeline accepts a screenshot; when several garments are detected the member chooses one and only that one is catalogued; no silent wishlist rows.

**R4. Candidate data model.**
`WardrobeItem` gains: `sourceUrl`, `canonicalUrl`, `retailer`, `productName`, `currency`, `listPrice`, `salePrice`, `chosenColour`, `chosenSize`, `sizeOptions`, `availability`, `sourceImages`, `lastCheckedAt`, `ingestSource` (camera | library | link | share | extension | screenshot), `extraction` (JSON). `seenPrice` keeps working. The product image is downloaded for cataloguing and try-on only; once the cut-out exists the original is deleted and `sourceImages` holds URLs only.

**R5. Verdict v2.**
Computed for a candidate against the clean closet, with these inputs: validated outfits per relevant event type (work, casual, evening, occasion), duplicate likeness to owned pieces, taste hooks (item bonus, pair affinity, formality lean), fitting (body type, height, measurements when present, skin tone, avoided colours, budget band), climate (season and typical temperature for the member's city), dress code, and projected cost per wear from how often the closet's similar pieces are worn.
- Headline ladder, suggestive in the stylist's voice: "It would earn its place" (≥ 3 validated outfits, no near-duplicate, inside taste and budget, fit not flagged), "It could work" (with the one reason it isn't a clear yes), "I'd wait on this one" (with the reason: duplicate, nothing to wear it with, outside budget, wrong for the climate, or against a stated avoid). Never "don't buy".
- Plaques: The verdict (outfits, with boards), Your closet (pairs, closest owned with wear count, what it unlocks), Your taste (how it sits with learned preferences), Your build (fit and length against body type and measurements; colour against skin tone), The money (price vs budget band, projected cost per wear, "you already own this in black, worn twice").
- Every plaque line has a reason; nothing praises; warnings render through the existing verdict display.
- A near-duplicate can never receive the top headline.
- The verdict is cached on the item and recomputed only when the closet or profile changes (a `closetVersion` stamp), not on every poll.

**R6. Try-on for a candidate (owner-delegated decision).**
"See it on you" on the verdict page renders the candidate on the member's reflection with the board renderer and fidelity check; requires a reflection (else "Add your reflection first" leads to the Mirror). One render is cached on the item and shown on the wishlist card; "Try again" re-renders. Renders count against the existing render meter; imports and verdicts do not count against any meter.

**R7. The wishlist room, rebuilt.**
A board of kept pieces (arches) with verdict number, price with date, retailer, a "seen at" line, the try-on when it exists, and the nudge state. Sorted by outfits, filterable by occasion. Actions: The verdict, See it on you, Bought it, Let it go (undo), Open at the shop (outbound link; affiliate-wrapped and labelled "Affiliate" when configured for that retailer). Bought moves the piece into the closet with brand, price, size, source and try-on intact, runs the twin check, and clears the nudge.

**R8. Wishlist helps the Closet, not the brief.**
The Closet's gaps rail (and the closet-value plaque) can say "A piece in your wishlist would unlock 9 outfits: the navy trouser." driven by the existing ghost simulation using real wishlist items. Opt-out per piece ("don't suggest this"). The daily brief, Compose and packing never include a wishlist item.

**R9. Fixes to today's flow.**
Re-keeping never wipes store/price; "Try again" works from the wishlist; multi-garment photos ask which piece; the duplicated "unlock" plaque is merged; polls read the cached verdict; the nudge is a choice (a fortnight, a month, never) and cancellable; a store entry appears in the web Closet's add chooser; error paths flash a message instead of failing silently; the two unimplemented promises in copy are either implemented (cost per wear: yes) or removed (brief integration: replaced by R8 copy).

**R10. Measurements in the fitting.**
Profile gains optional measurements (chest/bust, waist, hips, shoulder, inseam, preferred fit) with units per the member's setting, editable in Profile, used by R5's build plaque. Never required.

**R11. Terms and privacy guardrails.**
Only member-initiated fetches; no background crawling in v1; product images transient (R4); prices always displayed with their date; affiliate links labelled inline and disclosed in Settings; a per-retailer kill switch; robots-respecting paths only; an honest user agent string.

### P1 · Should have (fast follow within the same release train)

**R12. Android share target.** `share_target` in the web manifest routing to the store page; the URL is extracted from the shared text; an unauthenticated share lands on sign-in and resumes.

**R13. Browser extension and bookmarklet.** A minimal Chrome (Manifest V3) extension with one action: send the current tab's URL to ZAUQ (opens `zauq.app/closet/store?url=…` in the signed-in web app). The same as a bookmarklet for other browsers. No page content is read by the extension.

**R14. Occasion-first gaps.** "What am I missing for the wedding?" from the Closet lists the gap and any wishlist piece that fills it.

**R15. Compare two.** Two candidates side by side: outfits, duplicates, taste, build, money.

### P2 · Future considerations (design for, don't build)

- Price and availability watch with chosen alerts (the `lastCheckedAt`, `listPrice`/`salePrice` and a `PriceObservation` table are laid out for it).
- Size-in-brand from measurements plus per-brand size charts.
- Native mobile share extension (Expo SDK 55+) and the mobile store/wishlist screens.
- Amazon Creators API and Flipkart affiliate product data when eligible.
- Wishlist sharing to the circle ("should I?").

## Success metrics

Leading (first 30 days after launch):
- Link read success rate per retailer (target ≥ 85% on the priority ten; any retailer under 70% for a week triggers a parser fix or kill switch).
- Median time to verdict: link ≤ 10 s, photo ≤ 15 s.
- Decision rate: ≥ 60% of verdict views end in Keep, Pass or Buy.
- Try-on usage: ≥ 25% of verdicts request a render.
- Share of imports by door (link, share, extension, photo, screenshot).

Lagging (90 days):
- Wishlist return rate within 14 days ≥ 30%.
- Wishlist → Bought conversion, and Bought pieces' wear rate versus the closet average (are we improving purchases?).
- "I'd wait" verdicts followed by Pass ≥ 50% (the honesty is being heard).
- Zero retailer complaints; parser incidents resolved within a day.

Measured from usage events (`import.started/read/failed`, `verdict.viewed`, `verdict.decision`, `tryon.candidate`) and the wishlist tables.

## Open questions

- **Legal (non-blocking):** local advice on affiliate disclosure for an app in the UAE; confirm the "Affiliate" inline label meets ASCI/CCPA expectations in India.
- **Engineering (blocking for Amazon.in and Uniqlo):** inline-state parsers need fixtures captured with a browser; confirm the fetcher's egress passes their walls from the VPS, else those two go through the vendor extractor or the screenshot door at launch.
- **Design (non-blocking):** the verdict page grows from three plaques to five; confirm the order on a phone-width screen (verdict, closet, money, build, taste is the proposal).
- **Data (non-blocking):** which event types to validate outfits for per member; proposal: the member's top two from wear logs, else work and casual.

## Timeline and phasing

- **Phase 1 (this build, ~2–3 weeks):** R1–R11 on web, with parser fixtures for Myntra, Flipkart, Ajio, Noon, Namshi, Amazon .in/.ae, Zara, H&M, Uniqlo, ASOS, Next; Shein via screenshot only.
- **Phase 1b (same train, ~1 week):** R12 share target, R13 extension and bookmarklet, R14 occasion-first gaps, R15 compare.
- **Phase 2 (later, when mobile resumes):** native share extension, mobile screens, price watch, size-in-brand, affiliate APIs.

Dependencies: none external for Phase 1; a vendor extractor key is optional; affiliate programmes are configuration, added as they are approved.
