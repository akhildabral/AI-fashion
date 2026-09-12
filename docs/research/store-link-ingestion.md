# Store-link ingestion: research findings

Researched 2026-09-12 against primary sources; each claim cites a numbered source at the end. "Probe" = a fetch we ran ourselves that day (curl 8.x from a UAE residential IP, and a real Chrome via the browser pane). **[U]** = could not verify. Not legal advice.

## Summary

Ten of the twelve retailers embed a schema.org `Product`/`ProductGroup` JSON-LD block plus Open Graph tags in the server HTML of a product page, so one parser (JSON-LD, then OG, then a per-retailer inline-state fallback) covers most of the catalogue; Amazon.in and Uniqlo need inline-state parsing and Shein is CAPTCHA-walled even for a real browser. The blocker is bot detection, not markup: a plain `curl`-style fetch is refused by nine of twelve (Akamai TLS reset or 403, reCAPTCHA, Amazon's 503), and only a real-browser fingerprint on a residential egress gets through — so the fetcher must be a headless browser or an unblocker API, or the fetch must run on the member's device. Every terms page we could read forbids automated extraction and commercial image reuse; India and the UAE have no scraping precedent, so the defensible posture is a single user-initiated fetch, private non-shared use, links rather than stored images where possible, and Amazon via its Creators API if we ever join Associates. For share-in, an installed Android PWA `share_target` works today (the URL arrives in `text`), iOS needs a native share extension (now built into `expo-sharing` on SDK 55+), and a visible "paste link" field with a `paste` listener is the zero-prompt fallback everywhere. Canonicalise by following redirects with a browser UA, then `<link rel=canonical>`, then `og:url`, then per-retailer ID regexes. Refresh prices on open when older than a few hours and daily in the background for active items, always with a timestamp; Amazon's own licence caps caching at 24 h.

## 1. Per retailer: what a fetch gets

**Conclusion.** Parse JSON-LD first (nine sites), then OG, then inline state. Only Amazon.ae, Flipkart and Uniqlo (the latter two with a browser UA) answered a bare server fetch; the rest need a real-browser fingerprint. No retailer publishes oEmbed [1].

| Retailer | Plain server fetch (probe) | Server HTML seen by real Chrome (probe) | Variants/availability |
|---|---|---|---|
| Amazon.ae | `curl` UA: 200 **with** JSON-LD `Product` (offers 65 AED, InStock, image, rating) + OG; browser UA: full page, no JSON-LD | same | twister JSON: `dimensionValuesDisplayData` {ASIN: [size, colour]}, `priceAmount`, `parentAsin`, `colorImages` |
| Amazon.in | `curl` UA: 500 "503 Service Unavailable" wall (3/3); browser UA: 200 | no JSON-LD, no OG; canonical points at parent ASIN; `landingImage` `data-a-dynamic-image` | same twister blocks |
| Myntra | TLS/H2 reset (Akamai), all UAs, HTTP/1.1 too | JSON-LD `Product` (sku = style id, INR price, availability) + full OG | `window.__myx.pdpData` (styleId, mrp, sizes) |
| Flipkart | `curl` UA: 403 "Flipkart reCAPTCHA"; browser UA: 200 | JSON-LD `Product` (brand, `color`, sku, 5 images, offers, `OutOfStock`, return policy, reviews) + `og:title/url/image` | `__INITIAL_STATE__` (`finalPrice`, `mrp`); sizes not in JSON-LD |
| Ajio | 403 Akamai, all UAs | JSON-LD `ProductGroup` + Organization; `og:image` only | `__PRELOADED_STATE__` (price, availability, brandName, color) |
| Namshi | TLS/H2 reset | JSON-LD `Product` (brand, sku, 4 images, offers) + OG | — |
| Noon | TLS/H2 reset | JSON-LD `Product` + OG (1200×628 image) | inline JSON (sku, price, availability, brand) |
| Next (.ae) | 403 Akamai | JSON-LD `ProductGroup` (`variesBy` size/color/Fit) + 2 `Product`; `og:title/description` | `__NEXT_DATA__` |
| Zara | 403 or 2 KB Akamai `bm-verify` interstitial | JSON-LD `ProductGroup` (brand, `variesBy` size/color, images) + OG (`og:type=product`, `og:url?v1=<colour>`) | `window.zara` viewPayload (sizes, colors, price, availability) |
| H&M | 403 Akamai | JSON-LD `ProductGroup` with `hasVariant[]` `Product` (sku, color, size, offers), material, pattern + OG | `__NEXT_DATA__` `productArticleDetails` |
| Uniqlo | TLS reset for `curl` UA; browser UA: 200 | OG only; **no JSON-LD**; `__PRELOADED_STATE__` is an empty shell | client-side API [U] |
| ASOS | TLS/H2 reset | JSON-LD `ProductGroup` (`variesBy` size, sku, brand) + OG | `window.asos` (price, brandName, color) |
| Shein | 200 → redirect to `/risk/challenge?captcha_type=909` | real Chrome also challenged | not parseable |

robots.txt: none disallow product pages for `User-agent: *`; Amazon disallows ~80 named AI/scraper agents site-wide, Namshi blocks `python-requests`, H&M and Noon explicitly allow GPTBot/ClaudeBot, Ajio disallows `/api/*`, Zara `/itxrest/*/availability`, Noon/Namshi `/_svc/`; no `Crawl-delay` anywhere [2–13]. Use an honest named UA and stay on `/dp/`, `/p/`, `/buy` paths.

Official APIs. Amazon PA-API 5 is deprecated in favour of the **Creators API** (OAuth2; GetItems/GetVariations): eligibility 10 qualifying sales in the past 30 days, 1 TPS / 8,640 TPD initially, access lost after 30 sale-less days, India and UAE supported, non-image content cacheable 24 h [14–17]; the May 2026 retirement date is third-party only [U]. Flipkart's affiliate API docs are live (`/1.0/product.{format}` returns title, imageUrls, brand, MRP, selling price, color, size, inStock) but the portal shows only a login; "registrations paused since 2018" is a Cuelinks claim [U] [18]. Myntra, Ajio, Noon and Namshi have no public product API; Cuelinks, Admitad, Impact, Awin and Rakuten offer deep-link conversion or catalogue feeds for partnered brands, and **none resolves an arbitrary URL to product JSON** [19–22]. Unofficial app endpoints (`myntra.com/gateway/v2`, `1.rome.api.flipkart.com`, `zara.com/itxrest`, `api.asos.com/product/catalogue`, `api.hm.com`) are undocumented and partly robots-disallowed [U].

Commercial fetchers (list prices, Sept 2026): Zyte API `product: true` returns name, price, currency, availability, images, brand, color, size, sku, variants for $0.0004–0.0016 per extraction plus request fees [23]; Bright Data Web Scraper/Unlocker $1.5 per 1K PAYG, with Flipkart/Myntra/Noon pages [24]; Rainforest (Amazon, .in listed) from $23/500 credits [25]; ScrapingBee $19/75K credits, stealth 75 credits/page [26]; Diffbot Product API free 10K then $299/250K [27]; Firecrawl $16–599/month, JSON mode +4 credits [28]; Apify per-retailer actors $0.80–10 per 1K, mostly search-URL not single-PDP [29]. Oxylabs pricing unverified [U].

## 2. Legal and terms

**Conclusion.** Every readable terms page bans robots/scrapers and commercial image reuse with no "single page at a user's request" carve-out. US courts treat scraping public pages as not unauthorised access (hiQ, Meta v. Bright Data, X v. Bright Data) but contract claims survive (hiQ was enjoined and paid $500K); India and the UAE have no precedent, so the exposure is contractual and reputational rather than criminal. Design for it: user-initiated single fetch, no bulk crawl, private wishlist, transient image copy for try-on, "Affiliate" label on any commission link.

- Amazon.in/.ae: the licence excludes "any collection and use of any product listings, descriptions, or prices" and "any use of data mining, robots, or similar data gathering and extraction tools"; images "may not be reproduced ... for any commercial purpose" [30, 31]. Myntra and Flipkart share one sentence: no "'deep-link', 'page-scrape', 'robot', 'spider' or other automatic device ... to access, acquire, copy or monitor any portion of the Platform"; material is "solely for Your personal, non-commercial use" [32, 33]. Uniqlo India bans "spider boards, crawlers, avatars or intelligent agents" [34]. Next: "No text or data mining, or web scraping ... unless you are authorised to do so as a matter of law" [35]. Noon has **no** scraping clause, only "circumvent any technical measures" and reserved IP [36]. Ajio, H&M, Zara, ASOS, Namshi, Shein terms were bot-blocked or JS-only [U].
- Case law: hiQ (9th Cir. 2022): "where access is open to the general public, the CFAA 'without authorization' concept is inapplicable" [37]; the 2022 consent judgment still enjoined hiQ and ordered deletion (secondary) [38]. Meta v. Bright Data (2024): logged-out scraping did not breach Meta's terms (secondary) [39]. X v. Bright Data (2024): dismissed, copying claims preempted by copyright (secondary) [40]. Ryanair v. Booking turned on access behind a login (secondary) [41].
- India: IT Act s.43 (access "without permission", copying data) is civil; s.66 requires "dishonestly or fraudulently" [42]. DPDP Act 2023 covers "data about an individual" only — product metadata is out, the member's try-on photo is in [43]. Copyright Act s.2(c) protects photographs; s.52(1)(a) fair dealing covers "private or personal use, including research" and its Explanation says electronic storage for that purpose is not infringement — helpful for a member's private render, weaker for a service holding copies [44]. No Indian scraping ruling; OLX v. Padawan (Delhi HC 2016) is nearest, ANI v. OpenAI pending (secondary) [45].
- UAE: FDL 34/2021 penalises hacking, not reading a public page; FDL 38/2021 copyright and PDPL 45/2021 texts return 403 [U] [46, 47].
- Amazon Associates (if joined): no storing images ("you may store a link ... for up to 24 hours"), other content 24 h max, timestamp next to prices refreshed less than hourly, no use "for the purpose of aggregating, analyzing, extracting, or repurposing", no "client-side software application" without written approval; prices only via Amazon-served links or the Creators API [48, 49]. Scraped Amazon prices or edited Amazon images would breach this regardless of statute.
- Disclosure. India: ASCI 2023 lists permitted labels "Ad, Sponsored, Collaboration, Partnership, Employee, Free gift, Affiliate", "upfront and prominent ... hard to miss", not buried in hashtags or a bio [50]; binding rules are the CCPA 2022 Misleading Advertisements and Endorsements Guidelines (material connection "shall be fully disclosed") and the 30 Nov 2023 Dark Patterns Guidelines (disguised ads, false urgency, drip pricing) — gazette PDFs unreachable [U] [51, 52]. UAE: the 2025 Advertiser Permit (free three years, then AED 1,000) targets individuals posting promotional content "paid or unpaid"; whether an app earning commissions is covered is unclear — get local advice [53, 54]. FTC 2023 Guides define "clear and conspicuous" as "difficult to miss" [55].

## 3. Share-to-app mechanics

**Conclusion.** Android PWA: `share_target` (GET) and read the URL out of `text`. iOS: no web share target; ship the native extension via `expo-sharing` (SDK 55+) or `expo-share-intent`. Everywhere: a visible "Paste link" input with a `paste` listener needs no permission; `readText()` is only an accelerator.

- Web Share Target: manifest `share_target` with `action`, `method`, `params` {title, text, url}; the PWA "can only act as a web share target if it has been installed" [56, 57]. Chrome: "On Android, the `url` field will be empty ... URLs will often appear in the `text` field, or occasionally in the `title` field" [58]. Chrome Android since 71, desktop Chrome/Edge 89, Safari "no signal" (WebKit position: Neutral), Firefox not shipped [59, 60]. Outbound `navigator.share` works on Safari iOS 12.2+ [61]. Our web app already ships `frontend/public/manifest.webmanifest` with `"display": "standalone"` and no `share_target`, so the Android path is a manifest addition plus a receiving route.
- Android intents carry the payload in `EXTRA_TEXT` ("When receiving a URL make sure to get the EXTRA_TEXT field"); `EXTRA_SUBJECT` maps to `title` [62]. Retailers do not document share text. Probe: Amazon `a.co/d/<code>` 301s to `/dp/<ASIN>?ref_=cm_sw_r_...`; Flipkart shares `dl.flipkart.com/s/<code>`, which returns 403 with `x-captcha-validate` to non-browsers; Myntra shares are AppsFlyer OneLinks (`myntra.onelink.me/...`, `deep_link_value=myntra://...`, web URL `/…/<styleId>/buy` inside) — message formats anecdotal [U] [63].
- iOS/Expo: `expo-sharing` on SDK 55+ (experimental) adds the iOS share-extension target and Android intent filters via config plugin and delivers payloads by deep link (`useIncomingShare()`); SDK 55+ is New-Architecture-only [64, 65]. `expo-share-intent` v8.0.1 (July 2026) supports SDK 54–57, configures `NSExtensionActivationSupportsWebURLWithMaxCount`, App Group and `singleTask`, needs prebuild/EAS, not Expo Go [66]. `react-native-receive-sharing-intent` last published 2021 — avoid [67]. Apple: extension and host share data only via an App Group; extension memory is "significantly lower" than a foreground app (120 MB is anecdotal [U]); guideline 4.4 forbids marketing/IAP in extensions, 5.1.1 prefers the share sheet over broad access [68–70].
- Clipboard: Chrome `readText()` needs user activation and a `clipboard-read` prompt [71]; Safari rejects reads outside a gesture and shows a "Paste" callout [72]; Firefox 125+ shows a paste prompt and will not implement `clipboard-read` [73]. iOS 16+ alerts on programmatic `UIPasteboard.general.string`; `hasURLs`/`detectPatterns` (`probableWebURL`) check without notifying and `UIPasteControl` reads without the alert [74, 75]; `expo-clipboard.getStringAsync` returns an empty string on denial and has no `detectPatterns` wrapper [76]. Android 12+ toasts on `getPrimaryClip` from another app, not on `getPrimaryClipDescription` [77].

## 4. Messy links and canonicalisation

**Conclusion.** Resolve with GET and a browser UA (Amazon answers HEAD 405; `dl.flipkart.com` CAPTCHAs bots, so Flipkart short links may need client-side resolution), then `<link rel=canonical>`, then `og:url`, then a per-retailer regex; strip everything but the variant key.

- IDs: Amazon ASIN is 10 alphanumerics after `/dp/`; `/gp/product/`, `/gp/aw/d/`, `amzn.in/d/`, `a.co/d/`, `amzn.eu/d/`, `amzn.to/` all resolve to `/<slug>/dp/<ASIN>` — but Amazon.in's canonical pointed at the *parent* ASIN in our probe while the twister map gives child ASIN → [size, colour], so keep the child ASIN the member shared [78]. Flipkart: `/<slug>/p/itm<hex>?pid=<16 chars>`; canonical drops `pid`, `og:url` keeps it — **keep `pid`** [18]. Myntra: `/<cat>/<brand>/<slug>/<styleId>/buy` (probe). Ajio: `/<slug>/p/<code>` (probe). Noon: `/uae-en/<slug>/N<digits>[A|V]/p/`, ids start with N (noon SKU) or Z; strip `?o=` [79]. Namshi: `/uae-en/buy-<slug>/Z<hex>Z/p/` (probe). Zara: `-p<8 digits>.html`, `?v1=` colour (sitemap) [80]. H&M: `productpage.<article>.html`. Uniqlo: `/products/E<code>-000/<colour>`. ASOS: `/prd/<id>`. Shein: `-p-<id>-cat-<id>.html`. Next: `/style/st<6 digits>/<item>`, same ids on .co.uk and .ae (sitemaps) [81].
- Deep links: shared links are HTTPS App/Universal Links; assetlinks.json verified for Flipkart, Amazon.in, Noon, Ajio, Namshi, Zara and AASA for Flipkart, Amazon.in, Noon; Myntra's unreachable [U]; `flipkart://` and Amazon's scheme undocumented [U] [82]. Treat `myntra://` as "extract the embedded https URL".
- Strip list: ClearURLs' Amazon rules (`ref_`, `pf_rd_*`, `pd_rd_*`, `qid`, `sr`, `th`, `psc`, `crid`, `sprefix`, `keywords`, `linkCode`, `tag`, `_encoding`, `dib*`) and Flipkart rules (`otracker*`, `ssid`, `marketplace`, `store`, `srno`, `ppn`, `ppt`, `fm`, `st`, `qH`, `cmpid`, `affid`, `affExtParam*`) — its `[cilp]id` rule would strip Flipkart `pid`, so override; globally `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `_gl`, `srsltid` [83, 84]. `rel=canonical` is Google's "strong signal"; `og:url` is "the canonical URL of your object" [85, 1].

## 5. Price and availability re-checks

**Conclusion (our recommendation, not a sourced rule).** Refresh on open when older than 6 h; background daily for items viewed in the last 14 days, weekly after, stop after 60 days idle; one request per domain per second with jitter; back off on 403/429/503 or a CAPTCHA redirect; always show "price as of <time>" plus a "verify on retailer" link.

Amazon's licence is the ceiling: 24 h cache, timestamp if refreshed less than hourly, never store images [48]. Google Merchant Center disapproves listings whose price mismatches the landing page and computes price drops from observed history — the discipline we want for drop alerts [86, 87]. No robots.txt sets `Crawl-delay` [2–13]. The walls we hit (Amazon's 503 page naming `api-services-support@amazon.com`; Akamai Bot Manager on Ajio, H&M, Zara, Uniqlo, Next, Shein; TLS-level drops on Myntra, ASOS, Namshi, Noon) are tuned for repeated automated fetches, so re-checks must use the same headless/unblocker path and be budgeted per retailer, not per member.

## 6. Comparable products

**Conclusion.** Nobody does "any link → parsed garment → try-on" well: the big try-on features are walled to the retailer's own catalogue and the universal-save apps are image-first with weak parsing (Locker's own reviews complain most shares fail). That gap is ZAUQ's position; borrow the capture UX, photo rules and disclaimers.

- Google "Try it on": full-length photo, GA US July 2025, UK and India Dec 2025, no UAE; Google listings only; requires sign-in with history/personalisation on; disclaimer "may include mistakes ... consult size charts"; price tracking with size/colour/target [88–91]. Doppl (Labs, US) takes screenshots of any outfit, not URLs [92].
- Amazon: AR shoes/eyewear try-on, "Find on Amazon" share target mapping any link/image to its catalogue, explainable size advice ("Personalized Fit Insights") [93, 94]. Zalando: history-based size flags, two-photo on-device measurement, 3D fitting room "at scale in 2026" with deliberately non-hyper-real avatars [95, 96]. ASOS: Fit Assistant, Style Match photo search, Feb 2026 hybrid try-on (your photo or an AI model in your size, "4–7 seconds") [97, 98].
- Wardrobe: Whering — share sheet, paste URL, Chrome extension, free [99]; Indyx — photos, forwarded receipts, pasted links, $12.99/mo [100]; Acloset — Gmail/order import, avatar fitting room with a daily free quota [101]; Stylebook — in-app clipper, $4.99 [102]; Cladwell — URLs and screenshots into a shopping list [103].
- Wishlist: Shop (Shopify) — price-drop and restock alerts, Shopify merchants only, no share-sheet capture [104]; Lyst — size-specific restock alerts, extension [105]; Locker — share sheet from any page, cashback layer, reviews report failed/image-less saves [106]; Klarna — in-app-browser wishlists with automatic price-drop alerts, not in India/UAE [107]; Pinterest — verified-merchant badge meaning "accurate pricing/stock" [108]. Carrot unreachable [U].
- Myntra: MyFashionGPT, Maya (2023), Glamstream (2025); no try-on or price-drop on its App Store listing; 2026 "Try On Me" avatar is press-only [U] [109–111]. Flipkart Labs: avatar apparel try-on and size recommendation [112].

Borrow: share-sheet capture with an instant "Saved" toast and background parse, then a confirmation card (name/price/image) with a manual image picker when parsing fails; screenshot as first-class input (Doppl, ASOS); explicit photo rules, reusable stored photo with delete control, transient/on-device processing statement (Google, Zalando); inline accuracy disclaimer and stated render time (Google, ASOS); explainable size advice (Amazon, Zalando); opt-in price alerts with size/colour (Google, Lyst); saved items persist when sold out with restock alerts (Whering, Shop); "price checked at <time>". Avoid: silent parse failures (Locker); try-on gated on unrelated consents (Google); regions silently unsupported (Google, Pinterest); undisclosed affiliate/cashback layers (Locker) versus Copilot's explicit "we don't receive commissions except where identified" [113]; stale prices without timestamp; vague quota copy (Acloset); desktop-extension-first capture in a mobile-first market.

## Open questions we could not verify

- Terms of Ajio, H&M, Zara, ASOS, Namshi, Shein; UAE FDL 34/2021, 38/2021, 45/2021 and Cabinet Resolution 42/2025 texts; CCPA 2022 and dark-patterns PDFs; whether the UAE Advertiser Permit applies to an app.
- PA-API retirement date; Flipkart affiliate sign-up status; Admitad/Cuelinks feed contents for Myntra/Ajio; Oxylabs pricing; Uniqlo's client API; all unofficial retailer endpoints.
- Exact share-sheet text from the Amazon, Myntra and Flipkart Android apps; Myntra assetlinks/AASA; `flipkart://` and Amazon scheme docs; `expo-share-intent` New-Architecture statement; share-extension memory limit.
- Whether Amazon.ae serves JSON-LD to server UAs consistently (2/2 probes) and whether Amazon.in ever does; whether Shein's CAPTCHA is IP-reputation driven (curl and Chrome from the same residential IP were both challenged).
- Myntra 2026 "Size & Fit Intelligence"/"Try On Me"; Carrot's current features.

## Sources

1. https://ogp.me/ ; https://oembed.com/
2. https://www.amazon.in/robots.txt  3. https://www.amazon.ae/robots.txt  4. https://www.myntra.com/robots.txt  5. https://www.flipkart.com/robots.txt  6. https://www.ajio.com/robots.txt  7. https://www.namshi.com/robots.txt  8. https://www.noon.com/robots.txt  9. https://www.next.ae/robots.txt  10. https://www.zara.com/robots.txt  11. https://www2.hm.com/robots.txt  12. https://www.uniqlo.com/robots.txt  13. https://www.asos.com/robots.txt ; https://www.shein.com/robots.txt
14. https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation
15. https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
16. https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/api-rates
17. https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference
18. https://affiliate.flipkart.com/api-docs/af_prod_ref.html ; https://affiliate.flipkart.com/api-docs/af_glossary.html
19. https://developers.cuelinks.com/
20. https://developers.mitgo.com/hc/en-us/categories/34481291136402-Admitad-API-for-Publishers
21. https://integrations.impact.com/impact-publisher/reference/list-all-items-for-a-catalog ; https://help.awin.com/developers/docs/product-feed-publisher
22. https://affiliates.noon.com/en ; https://noon-docs.noonpartners.dev/
23. https://docs.zyte.com/zyte-api/pricing.html ; https://docs.zyte.com/zyte-api/usage/reference.html
24. https://brightdata.com/pricing/web-scraper ; https://brightdata.com/products/web-scraper/myntra
25. https://trajectdata.com/pricing/rainforest-api
26. https://www.scrapingbee.com/pricing/
27. https://www.diffbot.com/pricing/ ; https://www.diffbot.com/docs/extract/product
28. https://www.firecrawl.dev/pricing ; https://docs.firecrawl.dev/features/scrape
29. https://apify.com/easyapi/myntra-product-scraper ; https://apify.com/shahidirfan/flipkart-product-scraper ; https://apify.com/native_emblem/shein-product-scraper ; https://apify.com/shahidirfan/noon-com-scraper
30. https://www.amazon.in/gp/help/customer/display.html?nodeId=200545940
31. https://www.amazon.ae/gp/help/customer/display.html?nodeId=201909000
32. https://www.myntra.com/termsofuse
33. https://www.flipkart.com/pages/terms
34. https://faq-in.uniqlo.com/pkb_Home_UQ_IN?id=kA0Ie000000TP5N&l=en_US
35. https://www.next.ae/en/help/terms-and-conditions
36. https://www.noon.com/uae-en/terms-of-use/
37. https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf
38. https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/ (secondary)
39. https://www.quinnemanuel.com/the-firm/news-events/client-alert-meta-v-bright-data-significant-decision-for-web-scraping-industry/ (secondary)
40. https://www.proskauer.com/release/proskauer-secures-dismissal-of-scraping-claims-against-bright-data (secondary)
41. https://www.rcfp.org/briefs-comments/ryanair-v-booking-com/ (secondary)
42. https://www.indiacode.nic.in/bitstream/123456789/13116/1/it_act_2000_updated.pdf
43. https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
44. https://copyright.gov.in/Documents/CopyrightRules1957.pdf
45. https://www.ikigailaw.com/article/263/legality-of-data-scraping-in-india (secondary)
46. https://uaelegislation.gov.ae/en/legislations/1526/download [U]
47. https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws
48. https://affiliate-program.amazon.in/help/operating/agreement
49. https://affiliate-program.amazon.com/help/operating/policies
50. https://www.ascionline.in/wp-content/uploads/2023/08/GUIDELINES-FOR-INFLUENCER-ADVERTISING-IN-DIGITAL-MEDIA.pdf
51. https://consumeraffairs.nic.in/sites/default/files/filefield_paths/Endorsement_Know-Hows.pdf [U]
52. https://www.scconline.com/blog/post/2023/12/04/ccpa-notifies-guidelines-for-prevention-and-regulation-of-dark-patterns-2023-legal-news/ (secondary)
53. https://www.nma.gov.ae/en/services/permit-for-an-individual-to-provide-advertising-or-media-content-on-social-media-and-other-digital-platforms
54. https://uaelegislation.gov.ae/en/legislations/2145 ; https://www.nma.gov.ae/en/uae/media-content-standards
55. https://www.govinfo.gov/content/pkg/FR-2023-07-26/pdf/2023-14795.pdf
56. https://w3c.github.io/web-share-target/
57. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target
58. https://developer.chrome.com/docs/capabilities/web-apis/web-share-target
59. https://chromestatus.com/feature/5662315307335680
60. https://github.com/WebKit/standards-positions/issues/11
61. https://caniuse.com/web-share
62. https://developer.android.com/training/sharing/receive ; https://developer.android.com/training/sharing/send
63. https://affiliate.flipkart.com/tools/mobile-tracking-info ; probes of a.co, dl.flipkart.com, myntra.onelink.me
64. https://docs.expo.dev/versions/latest/sdk/sharing/
65. https://expo.dev/changelog/sdk-55
66. https://github.com/achorein/expo-share-intent ; https://registry.npmjs.org/expo-share-intent
67. https://registry.npmjs.org/react-native-receive-sharing-intent
68. https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html ; .../ExtensionCreation.html
69. https://developer.apple.com/documentation/bundleresources/information-property-list/nsextension/nsextensionattributes/nsextensionactivationrule
70. https://developer.apple.com/app-store/review/guidelines/
71. https://web.dev/articles/async-clipboard ; https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API
72. https://webkit.org/blog/10855/async-clipboard-api/
73. https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText
74. https://developer.apple.com/documentation/uikit/uipasteboard ; https://developer.apple.com/documentation/uikit/uipasteboard/detectionpattern/probableweburl
75. https://developer.apple.com/documentation/uikit/uipastecontrol
76. https://docs.expo.dev/versions/latest/sdk/clipboard/
77. https://developer.android.com/about/versions/12/behavior-changes-all ; https://developer.android.com/about/versions/10/privacy/changes
78. https://sell.amazon.com/blog/what-is-an-asin
79. https://support.noon.partners/portal/en/kb/articles/product-listing
80. https://www.zara.com/sitemaps/sitemap-product-in-en.xml.gz
81. https://www.next.ae/Next-AE-EN-Products-1.xml.gz ; https://www.next.co.uk/Next-GB-EN-Products-1.xml.gz
82. https://www.flipkart.com/.well-known/assetlinks.json ; https://www.amazon.in/.well-known/assetlinks.json (and Noon, Ajio, Namshi, Zara equivalents)
83. https://github.com/ClearURLs/Rules ; https://rules2.clearurls.xyz/data.minify.json
84. https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt
85. https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
86. https://support.google.com/merchants/answer/12159029 ; https://support.google.com/merchants/answer/6324371
87. https://developers.google.com/search/docs/appearance/structured-data/product ; https://developers.google.com/search/docs/appearance/structured-data/product-variants ; https://schema.org/ProductGroup
88. https://blog.google/products/shopping/back-to-school-ai-updates-try-on-price-alerts/
89. https://blog.google/products-and-platforms/products/shopping/virtual-apparel-try-on-uk-india/
90. https://support.google.com/googleshopping/answer/16253678
91. https://blog.google/products-and-platforms/products/shopping/google-shopping-cart/
92. https://blog.google/innovation-and-ai/models-and-research/google-labs/doppl/
93. https://www.aboutamazon.com/news/retail/amazon-shopping-app
94. https://www.aboutamazon.com/news/retail/how-amazon-is-using-ai-to-help-customers-shop
95. https://corporate.zalando.com/en/about-us/what-we-do/how-zalando-leverages-technology-help-customers-find-right-size
96. https://corporate.zalando.com/en/fashion/rewriting-rules-fit-europe-3-key-takeaways-cphfw-aw26
97. https://www.asos.com/us/customer-care/product-stock/how-does-fit-assistant-help-with-sizing/
98. https://www.asosplc.com/news-and-media/latest-news/asos-launches-hybrid-approach-to-virtual-try-on-giving-customers-a-unique-way-to-shop-with-confidence/
99. https://whering.co.uk/faq/adding-clothes-online ; https://whering.co.uk/faq/add-to-wishlist
100. https://www.myindyx.com/how-it-works
101. https://www.acloset.app/extension/ ; https://www.acloset.app/support/
102. https://www.stylebookapp.com/features.html
103. https://cladwell.com/app
104. https://help.shop.app/hc/en-us/articles/4406797152660
105. https://help.lyst.com/hc/en-gb/articles/115005631645
106. https://apps.apple.com/us/app/locker-shopping-wishlist/id6446096312
107. https://www.klarna.com/international/press/klarna-creates-new-ways-to-make-shopping-social-with-the-launch-of-followable-wish-lists/
108. https://help.pinterest.com/en/article/shopping-with-pinterest
109. https://blog.myntra.com/wp-content/uploads/2023/06/My_Fashion_GPT.pdf
110. https://corporate.walmart.com/news/2025/07/29/myntra-introduces-glamstream-bringing-shoppable-streaming-to-india
111. https://apps.apple.com/in/app/myntra-fashion-shopping-app/id907394059
112. https://stories.flipkart.com/flipkart-labs-technology-ravi-krishnan
113. https://support.microsoft.com/en-us/microsoft-copilot/shopping-with-microsoft-copilot
