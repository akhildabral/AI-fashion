# ZAUQ — Ask the closet

A one-button browser extension. On any shop page, click the arch and ZAUQ
opens with that page's address, reads the piece, and tells you whether it
belongs with what you already own. Spec: `docs/specs/fitting-room.md`, R13.

It is deliberately tiny: no content scripts, no host permissions, no page
reading. The only thing it ever sees is the address of the tab you click it
on, and only in the moment you click.

```
browser-extension/
  manifest.json        Manifest V3, Chrome 102+ and Firefox 109+
  src/background.js    the service worker: click → open the store page
  src/zauq-url.js      the URL helper (pure, tested)
  src/options.js       the options sheet's script
  options.html/.css    the options sheet: one field, the ZAUQ address
  icons/               the arch at 16/32/48/128 (rendered by scripts/icons.ts)
  test/                node --test, zero dependencies
```

## How it works

1. You click the toolbar action on a product page.
2. `activeTab` grants the extension that one tab's URL for that one click.
3. It opens `https://myzauq.com/closet/store?url=<encoded>&door=extension`
   in a new tab beside the shop, or reuses the ZAUQ tab it opened last time.
4. Signed out? The web app sends you to login and resumes the import after.

The origin is configurable in the options sheet (right-click the icon →
Options), stored in `chrome.storage.sync`. It defaults to production and
accepts `http://localhost:5173` for a dev build.

## Load it unpacked

**Chrome, Edge, Brave, Arc (anything Chromium):**

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `browser-extension/` folder.
4. Pin "ZAUQ — Ask the closet" from the puzzle-piece menu so the arch sits in
   the toolbar.
5. Go to any product page and click the arch.

**Firefox 109+ (temporary, until the listing is live):**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `manifest.json` in this folder.
3. The add-on lasts until Firefox restarts. The `browser_specific_settings.gecko`
   key in the manifest is what lets Firefox accept it; a signed build for
   permanent installs comes from AMO later.

**Pointing it at a dev build:** right-click the arch → Options → set the
address to `http://localhost:5173` → Save.

## Tests and tooling

```sh
cd browser-extension
node --test "test/**/*.test.js"   # the URL helper
npm run check                     # parses manifest.json
npm run icons                     # re-renders icons/ (uses sharp from backend/)
npm run pack                      # zips a store-ready build one level up
```

The runtime has zero dependencies. The icon script borrows `sharp` from
`backend/` (it resolves the module from there), which is why `npm run icons`
changes into that folder.

## Store listing copy

**Name:** ZAUQ — Ask the closet

**Short description (132 chars max):**
On any shop page, ask ZAUQ whether the piece belongs with what you already
own. One click. Nothing read but the page's address.

**Long description:**

ZAUQ is a personal stylist for the clothes you already own. This extension is
its front door to the shops.

On any product page, click the arch. ZAUQ opens with that page, reads the
piece, and gives you an honest verdict: what it goes with in your closet, what
it would cost you per wear, whether you already own its twin, and whether to
buy it, keep it on the wishlist, or pass.

It does one thing and touches nothing else. It reads the address of the tab
you click it on, only when you click, and opens ZAUQ with it. No content is
read from the page. No browsing is tracked. Nothing is sent anywhere except
to your ZAUQ.

You need a ZAUQ membership; it is invite-only for now.

**Category:** Shopping

**Privacy (for the listing's disclosure form):**

- Single purpose: open the current page's address in ZAUQ so the member can
  ask about the piece.
- Permissions: `activeTab` (the clicked tab's URL, granted per click),
  `storage` (the chosen ZAUQ address, synced across the member's browsers).
- No host permissions, no content scripts, no remote code, no analytics.
- Data handled: the URL of the current tab, at the moment of the click, sent
  only to the ZAUQ origin the member chose (myzauq.com by default). Nothing
  is stored by the extension except the chosen address.
- Not sold, not shared, not used for anything unrelated to the single purpose.

**Privacy policy line for the store page:** The extension reads only the
current tab's address, only when you click it, and sends nothing else
anywhere. See https://myzauq.com/legal/privacy.

## Bookmarklet, for browsers without the extension

The same door, as a link you drag to the bookmarks bar. Members find it in
the web app under You → Account → "Save from your browser".

```
javascript:location.href='https://myzauq.com/closet/store?url='+encodeURIComponent(location.href)+'&door=bookmarklet'
```
