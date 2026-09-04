# Asset index — every logo file, and which one to use

Two sets. `assets/brand/official/` is the **delivered identity** — use it for
anything that ships. `assets/brand/` is the app's own render of the same marks,
kept because the product loads those exact files.

Transparency, format and size are listed because picking wrong is the usual
failure: an outlined SVG in a favicon slot greys out, and an editable SVG in an
`<img>` loses its typeface.

---

## Pick by job

| You are making | Use | File |
|---|---|---|
| A web/app header | wordmark, transparent | `official/zauq-wordmark-{dark,light,gold,neutral}.png` or the `Wordmark` component |
| An app icon (App Store, Play) | **English icon** — arch + ZAUQ + rule | `official/zauq-icon-en-dark.png` (1024 master) |
| MENA store listing, packaging, ceremonial print | **Arabic icon** — arch + ذوق + rule | `official/zauq-icon-ar-{dark,gold,light,neutral}.png` |
| A favicon or a small badge | **solid** gold arch | `official/zauq-favicon-solid.png`, `official/svg/zauq-favicon-gold-256.svg` |
| A social avatar | round solid, gold ground | `official/zauq-favicon-round.png` |
| A splash, an invitation, a poster (200px+) | ceremonial lockup | `official/zauq-ceremonial-{dark,light}.png` |
| A horizontal lockup (mark + wordmark) | lockup, 1600 × 400 | `official/zauq-lockup-{dark,light}.png` |
| A watermark or decoration | the empty arch, transparent | `official/png/zauq-arch-{gold,cream,ink}-{512,1024}.png` or the SVG |
| Anything vector: print, cutting, embroidery, laser | **geometry SVG** | `official/svg/*.svg` |
| Android adaptive icon | foreground / background / monochrome | `assets/mobile/android-icon-*.png` |
| An email | wordmark PNG on cream, ink variant | `official/zauq-wordmark-dark.png` |

---

## The files

### `assets/brand/official/svg/` — geometry. Production-ready.

Pure paths, no type, no dependencies. These render identically in an `<img>`, a
favicon slot, an app-icon slot, Illustrator, or on a laser cutter. Stroke is a
fixed **1:104 of the arch width**, so every arch carries the same optical
hairline at any size.

```
zauq-arch-gold.svg / -cream / -ink        the mark, transparent ground
zauq-mark-arch-{dark,gold,light,neutral}-1024.svg   app icon, bare mark
zauq-favicon-{dark,gold,light,neutral}-256.svg      favicon, badge
```

### `assets/brand/official/png/` — transparent raster exports

Rasterised from the geometry SVGs, alpha preserved, for slide decks, docs and
anywhere SVG is awkward.

```
zauq-arch-gold-1024.png / -512.png
zauq-arch-cream-1024.png / -512.png
zauq-arch-ink-1024.png / -512.png
```

### `assets/brand/official/svg-editable/` — live type. **Outline before use.**

These contain real `<text>` referencing Playfair Display and Noto Nastaliq Urdu
**by name**. An SVG used as an image cannot load external fonts, so in an
`<img>`, a favicon slot or an app-icon slot they fall back to a system serif —
and the Nastaliq ذوق becomes a different letterform entirely.

Workflow: install both fonts, open in Illustrator/Figma, select the text,
convert to outlines, save. Until then use the PNGs for anything that ships.

```
zauq-wordmark-transparent-{ink,cream}.svg   1200 × 300
zauq-ceremonial-dark.svg                    1200 × 600, wordmark + rule
zauq-lockup-dark.svg                        1600 × 400, mark + wordmark
zauq-mirror-dark-512.svg                    the empty mirror
```

### `assets/brand/official/*.png` — the delivered rasters

```
zauq-icon-en-{dark,gold,light,neutral}.png   PRIMARY app icon
zauq-icon-ar-{dark,gold,light,neutral}.png   secondary: MENA, packaging
zauq-favicon-{solid,round,gold,dark}.png     favicon + social avatar
zauq-ceremonial-{dark,light}.png             splash, invitations, 200px+
zauq-lockup-{dark,light}.png                 horizontal lockup
zauq-wordmark-{dark,light,gold,neutral}.png  the wordmark on each ground
zauq-mirror-{dark,neutral}.png               the empty arch
```

Ground in the filename = the ground it is drawn **for**: `dark` sits on ink,
`light` on cream, `neutral` on `#D6CFC0`, `gold` is the gold-on-transparent
variant.

### `assets/brand/` — the app's own renders

```
zauq-wordmark-{ink,cream,gold}.png   600 × 150, transparent
zauq-mark-{cream,ink}.png            512, transparent, arch + script
favicon.svg · icon-512.png · apple-touch-icon.png
```

### `assets/mobile/` — native packaging

```
icon.png                       the app icon master
splash-icon.png                the splash mark
android-icon-foreground.png    gold arch, transparent
android-icon-background.png    ink ground
android-icon-monochrome.png    themed-icon layer
grain.png                      the film grain the app overlays
```

### `assets/imagery/` — product photography

`bag · blazer · closet · friends · mirror · morning · pumps · store · tank ·
trousers` (`.webp`). Garment shots are cut-outs for a niche; `closet`,
`friends`, `mirror`, `morning`, `store` are scenes for a rectangle.

---

## Rules that apply to every file

1. **Below 32px, the mark is solid** — never an outline. A hairline greys out
   when downsampled.
2. **Never recolour** outside ink / cream / neutral / gold.
3. **Never stretch, rotate, outline, emboss or shadow** the mark, and never
   re-kern the wordmark (ZA .24em · AU .20em · UQ .16em is fixed).
4. **Clear space:** wordmark = the cap height of the Z on all sides; mark = half
   the arch width.
5. **Minimums:** wordmark 88px / 22mm; mark 32px outlined, 16px solid;
   ceremonial lockup 200px.
6. **No rule and no tagline** attached to the wordmark — the rule belongs to
   the ceremonial lockup, the tagline is a separate tracked-Archivo element.
7. Over a photograph, the mark needs a scrim or a protection gradient.

## Missing on purpose

There is **no monochrome-black wordmark, no stacked-with-tagline lockup and no
icon set** — if a piece seems to need one, the answer is the existing lockup
plus type, or a word. And per the identity's own outstanding list: the wordmark
is still outlined Playfair rather than bespoke vectors, and the ذوق is set type
rather than commissioned calligraphy.
