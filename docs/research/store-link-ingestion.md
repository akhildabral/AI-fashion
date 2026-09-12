# Store-link ingestion: what a shop link can give us, and what we are allowed to do with it

*Researched 12 September 2026 against primary sources where reachable. Tags: **[P]** primary source fetched, **[S]** secondary, **[U]** not verifiable from this network (several retailers Akamai-block non-browser clients).*

**Summary.** Most target retailers publish a schema.org product block a fetch can parse (Flipkart, Myntra, Noon, Namshi, ASOS as `Product`; Zara, H&M, Ajio as `ProductGroup`); Amazon and Uniqlo publish neither structured data nor usable Open Graph and need inline-state parsing; Shein is CAPTCHA-walled. Nearly all block a plain datacenter fetch, so production needs a browser fingerprint and residential egress or a vendor extractor. Every reachable terms-of-use except Noon's forbids automated extraction and any reproduction of images beyond personal use; Amazon's affiliate agreement forbids caching product images at all. Share-to-app works on Android for an installed web app (URL arrives in `text`), needs the native app on iOS (Expo SDK 55+ ships it), and copy-paste is prompt-free only via a visible paste field. Design consequence: member-initiated single fetches, store the link and facts rather than a copy, transient images, timestamped prices, official affiliate APIs where we join, a screenshot door that always works.

## 1. What product pages expose, per retailer

| Retailer | robots.txt on PDPs | Structured data (live fetch) | Plain server fetch | Notes |
|---|---|---|---|---|
| Amazon .in/.ae | `/dp/` allowed; ~80 AI/scraper UAs `Disallow: /` [P] | none; no OG; price/variants in inline "twister" scripts [P] | 200 with browser UA; `python-requests` UA → 500 "contact api-services-support@amazon.com" [P] | canonical `/<slug>/dp/<ASIN>`; HEAD → 405, use GET; short domains a.co, amzn.in, amzn.eu, amzn.to resolve [P] |
| Myntra | `/…/buy` allowed [P] | JSON-LD `Product` + `window.__myx.pdpData` (sizes, colours) [P via browser] | HTTP/2 INTERNAL_ERROR / timeouts [P] | share links are AppsFlyer OneLinks with the real URL in `af_web_dp`/`deep_link_value` |
| Flipkart | `/p/` allowed; variant params disallowed [P] | JSON-LD `Product`, og:title/og:image, `__INITIAL_STATE__` [P] | 200, intermittent reCAPTCHA page [P] | keep `?pid=` (the variant); `dl.flipkart.com` short links 403 non-browsers |
| Ajio | `/p/` allowed; `/api/*` disallowed [P] | JSON-LD `ProductGroup` [P via browser] | Akamai 403 [P] | |
| Namshi | filter params disallowed; `python-requests` `Disallow: /` [P] | JSON-LD `Product` + `Brand` [P via browser] | timeout [P] | |
| Noon | `/_svc/` disallowed; AI bots explicitly allowed [P] | JSON-LD `Product`, full OG [P via browser] | timeout [P] | ToS has no anti-scraping clause [P] |
| Next .co.uk/.ae | `*/api/` disallowed; `/style/` PDPs not listed [P] | untested at PDP level [U] | Akamai 403 [P] | style ids `st<6 digits>/<item>` identical across regions (official sitemaps) [P] |
| Zara | `-p<id>.html` allowed; colour params disallowed [P] | JSON-LD `ProductGroup` [P via browser] | 2 KB JS challenge shell [P] | |
| H&M | AI crawlers explicitly `Allow: /` [P] | JSON-LD `ProductGroup` + `__NEXT_DATA__` [P via browser] | Akamai 403 [P] | |
| Uniqlo | PDPs allowed; per-market `sitemap_*_pdp.xml` [P] | OG only; data in `__PRELOADED_STATE__` [P] | 200 [P] | |
| ASOS | legacy `*/Prod/*` disallowed [P] | JSON-LD `Product` with sku, color, image, brand [P via browser] | Akamai 403 / timeout [P] | |
| Shein | no product disallow [P] | unreadable: geo-redirect to `risk/challenge` CAPTCHA even in a browser [P] | blocked | screenshot/photo door only |

No retailer emits an oEmbed link (grep on every fetched page). Open Graph itself defines no product or price properties [P: ogp.me]; `product:price:*` is the retired Facebook object type [U]. Target parse schema: schema.org `Product`/`Offer`/`ProductGroup` (price, `priceCurrency`, `availability`, `color`, `size`, `sku`, `gtin`, `isVariantOf`) [P: schema.org; Google product structured-data docs].

Unofficial JSON endpoints referenced in page source (Myntra `gateway/v2`, Flipkart `1.rome.api`, Zara `itxrest`, H&M `api.hm.com`, ASOS `api.asos.com/product/catalogue`) exist but are undocumented, robots-disallowed in several cases, and **[U]**.

## 2. Official and affiliate APIs

- **Amazon**: PA-API 5 is deprecated; the replacement Creators API (OAuth2; GetItems, SearchItems, GetVariations) requires **10 qualifying sales in the past 30 days**, starts at 1 TPS / 8,640 TPD, and revokes access after 30 sale-less days. India and UAE are supported locales; credentials work across marketplaces. Non-image content may be cached 24 h; images may not be cached; prices need a timestamp if refreshed less than hourly. [P: affiliate-program.amazon.com/creatorsapi docs; Operating Agreement (amazon.in); Program Policies (.com)] Retirement date of PA-API 5 (May 2026) is from emails only [U].
- **Flipkart Affiliate API**: docs live (`/1.0/product.{format}` etc., fields include `imageUrls`, `productBrand`, `flipkartSellingPrice`, `color`, `size`, `inStock`) [P: affiliate.flipkart.com/api-docs]; registration reportedly paused since 2018 [S: Cuelinks] [U].
- **Myntra, Ajio, Namshi, Noon**: no first-party public API; networks (Cuelinks, Admitad, Impact, Awin, Rakuten) provide links, feeds and reporting but **nothing resolves an arbitrary URL to product JSON** [P: developers.cuelinks.com; Impact catalog API; Awin product feed docs; affiliates.noon.com].

## 3. Vendor extractors (arbitrary URL → product JSON)

Zyte API (automatic product extraction, fractions of a cent per page) [P: docs.zyte.com pricing/reference]; Bright Data Web Scraper API (free 5K/mo, then ~$1.5/1K; has Flipkart, Myntra, Noon pages) [P]; Diffbot Product API (free 10K credits; fields incl. offerPrice, availability, images, colors, size) [P]; Rainforest for Amazon.in [P]; ScrapingBee, ScraperAPI, Crawlbase, Firecrawl (credit multipliers for JS/stealth) [P]; per-retailer Apify actors (mostly search URLs, $1–10 per 1K) [P]. Oxylabs tiers [U].

## 4. Terms of use and law

- **Terms** [P]: Amazon.in/.ae ("any use of data mining, robots, or similar data gathering and extraction tools"; images "may not be reproduced… for any commercial purpose"), Myntra and Flipkart ("deep-link, page-scrape, robot, spider… to access, acquire, copy or monitor any portion"; images for personal, non-commercial use only), Uniqlo India (no crawlers; copying content beyond personal use prohibited), Next UK/AE ("No text or data mining, or web scraping… unless… you have our express prior written agreement"). Noon: no scraping clause; content rights reserved. Ajio, H&M, Zara, ASOS, Namshi, Shein terms unreachable [U].
- **Case law** (US): public-page fetching is not "without authorization" under the CFAA (hiQ v. LinkedIn, 9th Cir. 2022 [P]), but terms-of-service claims succeed (hiQ consent judgment, $500K and a permanent injunction [S]); Meta v. Bright Data and X v. Bright Data dismissed claims over logged-out public scraping [S]; Ryanair v. Booking turned on access to a password-protected area [S].
- **India**: no ruling squarely on public-page scraping [S]. IT Act s.43/s.66 liability turns on access "without permission" done "dishonestly or fraudulently" [P: indiacode]. DPDP Act: product data is not personal data; the member's photo is [P]. Copyright Act s.52(1)(a): fair dealing for private use, including electronic storage for that purpose [P]; a commercial service copying product photos is a grey area, strongest when user-initiated, private and transient.
- **UAE**: Cybercrimes FDL 34/2021 targets unauthorised entry, not reading public pages [U: official text 403]; PDPL applies to personal data only [P: u.ae].
- **Disclosure**: ASCI 2023 guidelines list "Affiliate" as a permitted, must-be-prominent label [P]; CCPA 2022 misleading-ads guidelines require material connections to be disclosed [S]; FTC §255.5 "clearly and conspicuously" [P]. UAE: an advertiser permit for individuals publishing promotional content (free three years, then AED 1,000) [P: nma.gov.ae]; an app earning commissions is not clearly covered, seek local advice.

## 5. Share-to-app and paste

- **Web Share Target**: Chromium only (Chrome Android 71+, desktop 89+), installed PWA required, no Safari support (WebKit position neutral) [P: developer.chrome.com; MDN; chromestatus; WebKit standards-positions #11]. On Android the shared URL arrives in the `text` field, occasionally `title`, never `url` [P: Chrome docs]. Our web app is already an installable standalone PWA, so this is a manifest addition.
- **Native (Expo)**: Expo SDK 55+ ships share-in in `expo-sharing` (config plugin adds the iOS share extension and Android intent filters; payloads via deep link; `useIncomingShare()`) [P: docs.expo.dev]; SDK 55+ is New-Architecture only. `expo-share-intent` v8 (July 2026) is the maintained alternative; `react-native-receive-sharing-intent` is unmaintained since 2021 [P: npm]. iOS extensions need an App Group and run under much lower memory limits [P: Apple Extensibility guide]. App Review 4.4 forbids marketing or purchases inside extensions [P].
- **Paste**: a visible input reading the `paste` event needs no permission anywhere; `navigator.clipboard.readText()` needs a user gesture and prompts in Chrome, shows a "Paste" callout in Safari and Firefox [P: web.dev; webkit.org; MDN]. iOS 16+ prompts on programmatic paste but `UIPasteboard.hasURLs`/`detectPatterns` are prompt-free; `UIPasteControl` reads without the alert [P: Apple docs]. Android 12+ toasts on `getPrimaryClip` but not on `getPrimaryClipDescription` [P: Android docs]. `expo-clipboard` exposes `hasUrlAsync` on iOS only [P].

## 6. Messy links and canonicalisation

Resolve with GET and a browser user agent (Amazon returns 405 to HEAD; `dl.flipkart.com` returns a CAPTCHA 403 to non-browsers) [P]. Prefer `<link rel="canonical">`, then `og:url`, then a per-retailer id regex [P: Google canonical docs; ogp.me]. Identities: Amazon ASIN after `/dp/` (drop `th`, `psc`, `ref_`, `pf_rd_*`, `pd_rd_*`, `crid`, `sprefix`, `keywords`, `linkCode`, `ascsubtag`) [P: ClearURLs rules; uBlock privacy list]; Flipkart `/p/itm…` plus **keep `pid`** (ClearURLs' `[cilp]id` rule would wrongly strip it); Myntra `/<styleId>/buy` [U]; Zara `p<8 digits>` [P: sitemap]; H&M `productpage.<article>.html` [S]; Noon `N…A/p/` [S]; Next `st<6>/<item>` [P]; ASOS `/prd/<id>` [S]; Uniqlo `E<code>-000` [U]. Strip `utm_*`, `gclid`, `fbclid`, `msclkid`, `otracker`, `lid`, `marketplace`. All retailers use HTTPS App Links/Universal Links (assetlinks/AASA verified for Flipkart, Amazon.in, Noon, Ajio, Namshi, Zara) [P]; custom schemes (`myntra://`) are secondary.

## 7. Price and availability re-checks

Amazon: 24 h cache limit, hourly or timestamped [P]. Google Merchant Center treats price mismatches as disapprovals and expects expiry dates under 30 days [P]. No retailer publishes a crawl-delay. Recommendation (ours): re-read on open when older than 6 h; daily for items opened in the last 14 days, weekly after, stop after 60 idle days; one request per domain per second with jitter; back off on 403/429/503; always show "price as of".

## 8. Comparable products

Google Shopping and Amazon run virtual try-on on their own catalogues; ASOS/Zalando give size guidance from body data and returns; Whering and Indyx let members save shop items beside owned pieces; Shop, Lyst, Klarna and Carrot are save-and-track with price alerts; Myntra offers in-app try-on for select categories. None combines a member's real closet, a fit verdict against their own taste and body, and a try-on on their own photo. Patterns to borrow: one-tap save from the share sheet, price-with-date, "goes with N of yours"; to avoid: dark-pattern urgency, undated prices, silent affiliate links.

## Open questions we could not verify

Terms for Ajio, H&M, Zara, ASOS, Namshi, Shein; UAE cybercrime and copyright statute text; Flipkart affiliate registration status; PA-API 5 retirement date; Myntra/Ajio/Namshi/Uniqlo URL patterns beyond observed examples; any retailer's official share-message format.

## Sources (selection)

schema.org/Product, /Offer, /ProductGroup · developers.google.com/search/docs/appearance/structured-data/product · ogp.me · oembed.com · amazon.in/robots.txt · flipkart.com/robots.txt · affiliate-program.amazon.com/creatorsapi/docs (introduction, api-rates, locale-reference, paapiv5-deprecation) · affiliate-program.amazon.in/help/operating/agreement · affiliate-program.amazon.com/help/operating/policies · affiliate.flipkart.com/api-docs/af_prod_ref.html · developers.cuelinks.com · docs.zyte.com/zyte-api/pricing.html · brightdata.com/pricing/web-scraper · diffbot.com/pricing · amazon.in Conditions of Use (nodeId=200545940) · amazon.ae Conditions of Use (nodeId=201909000) · myntra.com/termsofuse · flipkart.com/pages/terms · next.co.uk/help/terms-and-conditions · noon.com/uae-en/terms-of-use · cdn.ca9.uscourts.gov 17-16783 (hiQ) · indiacode.nic.in IT Act 2000 · meity.gov.in DPDP Act 2023 · copyright.gov.in · ascionline.in influencer guidelines 2023 · govinfo.gov 88 FR 48092 · nma.gov.ae advertiser permit · w3c.github.io/web-share-target · developer.chrome.com/docs/capabilities/web-apis/web-share-target · chromestatus.com/feature/5662315307335680 · github.com/WebKit/standards-positions/issues/11 · docs.expo.dev/versions/latest/sdk/sharing · github.com/achorein/expo-share-intent · developer.apple.com (UIPasteboard, UIPasteControl, App Extension Programming Guide, App Store Review Guidelines) · developer.android.com (sharing/receive, versions/12/behavior-changes-all) · web.dev/articles/async-clipboard · webkit.org/blog/10855 · developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls · rules2.clearurls.xyz · raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt · support.google.com/merchants (6324371, 12159029, 188494)
