# ZAUQ brand guidelines

Reconciled against the delivered identity — **ZAUQ Brand Guide V1.0,
September 2026** (`AI-fashion/brand/ZAUQ Brand Guide.pdf`), the official SVG
set (`brand/svg/{geometry,editable}`) and the asset renderers
(`backend/scripts/brand-{assets,icons}.ts`). Where the guide and the code
disagreed, §12 says which won and why.

---

## 1. The idea

**ZAUQ** — Urdu/Persian **ذوق**, *zowk*: taste, discernment, the pleasure of a
thing done well. The brand is a private atelier, not a fashion app: dark rooms,
one warm light, brass, and a garment treated like an object in a vitrine.

> **A gallery by day, an atelier by night.**

The identity is earned from the interface — the arch framed garments before it
was ever a logo — so brand work and product work must never diverge.

Positioning: *A personal stylist for the clothes you own.*

---

## 2. The arch

**Geometry.** A 3:4 arch. **Corner radius = half the arch width** — i.e. the
crown is a true semicircle. The feet are 2–3px (**3px** here, which is also the
house radius). The stroke is a fixed **1:104 of the arch width**, so every arch
carries the same optical hairline at any size: **never thicken it**, and never
scale it independently.

**Below 32px the outlined mark becomes the solid fill.** A hairline greys out
when downsampled, which is why the favicon is a solid gold arch, not an
outline.

One rule scales the curve everywhere — the mark, the niche, the mirror, the
loading skeleton: horizontal radius 50%, crown height w/2. *(The product's CSS
drew a flattened 46% / 0.373× ellipse; corrected — see readme §4b, items 1 and
5b.)*

---

## 3. Which mark, where

| Context | Mark | File |
|---|---|---|
| App header, web nav | **Wordmark** | `Wordmark` component / `zauq-wordmark-*.png` |
| App icon, every store | **English icon** — arch + ZAUQ + gold rule. **Primary** | `official/zauq-icon-en-*.png` |
| MENA, packaging, ceremonial | **Arabic icon** — arch + ذوق + rule. **Secondary** | `official/zauq-icon-ar-*.png` |
| Favicon, badge | **Solid gold arch** — filled, never outlined | `official/zauq-favicon-solid.png`, `official/svg/zauq-favicon-gold-256.svg` |
| Social avatar | **Round solid**, gold ground | `official/zauq-favicon-round.png` |
| Splash, packaging, invitations (**200px+**) | **Ceremonial** lockup | `official/zauq-ceremonial-{dark,light}.png` |
| Email, documents, invoices | **Wordmark** | `official/zauq-wordmark-*.png` |
| Empty-frame decoration | **Mirror** (arch, no script) | `official/zauq-mirror-{dark,neutral}.png` |

The round avatar is the **one** circle in the whole system, and only because
social platforms crop to one. **In product, an avatar is a 3px brass square
with initials** — never round, never an image.

---

## 4. The wordmark

Playfair Display 400, uppercase, with **fixed** kerning:

```
ZA  0.24em      --wordmark-track-za
AU  0.20em      --wordmark-track-au
UQ  0.16em      --wordmark-track-uq
```

**No rule, no tagline.** The wordmark is the wordmark; the gold rule belongs to
the ceremonial lockup and the tagline is a separate layout element set in
tracked Archivo — never locked up with it.

Always **ZAUQ** — never *Zauq*, *zauq*, or a trailing full stop. Playfair
Display appears **nowhere else**: not in headlines, not in body, not in decks.

---

## 5. Clear space and minimum sizes

| | Rule |
|---|---|
| **Wordmark clear space** | X = the cap height of the Z, all four sides |
| **Mark clear space** | half the arch width, all four sides |
| **Wordmark minimum** | **88px on screen · 22mm in print** |
| **Mark minimum** | 32px outlined · 16px solid (below 32px, use solid) |
| **Ceremonial lockup** | 200px and up only |

The delivered size ladder: 1024 / 512px (app icon) · 180 / 120px (touch icon) ·
48px (badge) · 32 / 16px (favicon) · 88px / 22mm (wordmark floor).

Nothing — type, image edge, rule — enters the clear space.

---

## 6. Colour: three grounds, one accent

| Token | Hex | Role |
|---|---|---|
| `--ground-ink` | `#0B0A09` | the primary ground |
| `--ground-cream` | `#F2EDE3` | light ground: print, email, stationery |
| `--ground-neutral` | `#D6CFC0` | third ground: packaging, quiet surfaces |
| `--brand-gold` | `#D8B26A` | the one accent — the mark, rules, CTAs |
| `--brand-muted` | `#B9AE97` | sublines and captions on ink |
| `--brand-terracotta` | `#A9563A` | **secondary, editorial only** |

**Terracotta is not an interface colour.** It may appear in an editorial layout
or a printed piece; it never appears in the app, never as an accent alongside
gold, and never on a control.

Identity gold `#D8B26A` sits warmer than product brass `#C8A45E` because it is
a printing decision. Do not substitute: **product screens use brass; brand
material uses gold.**

---

## 7. Type in brand material

Bodoni Moda **400 / 400 italic / 500** · Noto Nastaliq Urdu **600** · Archivo
**400 / 500 / 600**. That is the whole set the identity licenses.

| Role | Face | Spec (per 1080 of canvas width) |
|---|---|---|
| Headline | Bodoni Moda 500 | 104px (88 on square), line-height 1.06, tracking −1 |
| Accent line | Bodoni Moda 500 *italic*, gold | exactly **one** line per headline |
| Subline | Archivo 400 | 30px, `--brand-muted` |
| CTA | Archivo 700 | 21px, tracking 2, uppercase, ink on a gold bar |
| Eyebrow / tagline | Archivo 600 | 0.28–0.32em tracking, uppercase |

Headlines are **hand-broken**: 2–3 lines, 2–5 words a line, no widows, no
hyphenation. Never centre a headline over a photograph — it sits on the left
margin.

---

## 8. Ad and social layout

| Key | Pixels | Ratio | Use |
|---|---|---|---|
| `sq` | 1080 × 1080 | 1:1 | feed |
| `pt` | 1080 × 1350 | 4:5 | feed — **the default** |
| `st` | 1080 × 1920 | 9:16 | story, reel cover |
| OG | 1200 × 630 | — | link card |

- **Side margin** 9% of the width (97px at 1080); copy left-aligned.
- **Copy block** 11% up from the bottom (default) or 16% down from the top —
  never centred vertically.
- **Scrim:** a feathered ink panel behind the copy block only, solid under the
  words and fading into the image. Never a full-frame darken.
- **Wordmark** opposite the copy block, same 9% margin, above its 88px minimum.
- **CTA** gold bar, 4px radius, 54px tall, uppercase Archivo 700.
- Stack, bottom-anchored: headline → 6px → subline → 30px → CTA.

The OG reference build (1200 × 630, ink): mark at y 150, wordmark 84px at
y 355, gold rule 104 × 3 at y 392, tagline Archivo 600 18px tracking 6 in
`#A79E8A` at y 470, centred.

---

## 9. Imagery direction

Every ZAUQ image, generated or shot, is the same photograph:

> Cinematic editorial fashion photograph, atelier aesthetic. Near-black
> charcoal background (#0B0A09), warm brass and gold tones (#D8B26A), bone and
> cream accents. A single warm directional spotlight, deep shadows, moody and
> luxurious, film grain, shot on medium format, shallow depth of field. No
> text, no words, no logos, no watermark.

Then the subject — and always a note on **where the negative space is**,
because a headline has to sit on it.

**On-brand subjects:** a brass arched mirror alone in a dark room; a rail of a
few muted garments under one spotlight; an overhead flat-lay on bone linen; a
woman seen from behind at a mirror; fabric and a brass button in raking light;
one coat spotlit in an arched niche; a wardrobe with morning light spilling
out; hands adjusting a lapel; a single pair of heels in a pool of light; a
silhouette at a tall window.

**Never:** cool or blue light, high-key studio white, flat even lighting, two
light sources, saturated colour, stock-photo smiles, visible logos, a face
where the garment is the subject, or text baked into the image.

**Treatment.** Garments are matted cut-outs on a lit niche (7% padding; 9% on
small tiles; 10–12% under 64px). Scenes are photographs in a 3px rectangle.
Text over a photograph gets a **protection gradient**, not a capsule; a
discrete fact gets a card or a plaque. Film grain over every screen and every
composed ad.

---

## 10. Voice in brand material

Marketing drops the stylist's "I" and speaks plain second person: *"It knows
your closet."* British spelling, short verbless lines, full stops doing the
work of exclamation marks, real apostrophes (’), **no emoji, no em dashes**
(comma, colon or full stop instead).

Concrete beats abstract: *"43 pieces. 1,200 outfits. Nothing bought."* Reuse
the lexicon — *the brief, the rooms, the rail, the niche, the mirror, the
circle, the ledger, a fitting, let it go, already waiting*.

Do not soften: *"Your photo is yours. Delete it any time, and every render made
from it goes with it."*

---

## 11. The asset set

```
assets/brand/                     in-app renders (wordmarks, marks, favicon, app icons)
assets/brand/official/            the delivered identity
  zauq-icon-en-*.png              PRIMARY app icon (arch + ZAUQ + rule)
  zauq-icon-ar-*.png              secondary (arch + ذوق + rule)
  zauq-favicon-solid/round/…      favicon + social avatar
  zauq-ceremonial-{dark,light}    splash / packaging / invitations, 200px+
  zauq-lockup-{dark,light}        mark + wordmark, 1600 × 400
  zauq-wordmark-{dark,light,gold,neutral}
  zauq-mirror-{dark,neutral}      the empty arch
  svg/                            GEOMETRY — pure paths, production-ready
  svg-editable/                   LIVE TYPE — outline before shipping
```

**Caveat on `svg-editable/`:** those files contain real `<text>` referencing
Playfair Display and Noto Nastaliq Urdu by name. An SVG used as an image cannot
load external fonts, so in an `<img>`, a favicon slot or an app-icon slot they
fall back to a system serif — and the Nastaliq ذوق becomes a different
letterform. Outline the type before shipping, or use the PNGs.

**Known outstanding in the identity itself** (from the guide, not a gap here):
the wordmark should be redrawn as bespoke vectors rather than outlined
Playfair, and the ذوق commissioned as true nastaliq calligraphy.

---

## 12. Where this document differs from the PDF, and why

The guide was read as evidence, not scripture. Four judgements:

1. **Feet at 3px, not "2–3px".** A range is not a spec. 3px is inside the
   guide's range *and* equals the house radius, so the arch's feet and every
   rectangle in the product agree.
2. **The tagline is not a lockup.** The guide's own primary construction says
   "no rule, no tagline", yet the ad and OG builds set a tagline under the
   wordmark. Resolved: the tagline is a **layout element** in tracked Archivo,
   positioned near the wordmark but never locked to it, and never at wordmark
   scale.
3. **The round avatar is scoped, not adopted.** The guide sanctions a round
   solid mark for social avatars; the product bans circles. Both stand: round
   **only** where a platform crops round, square everywhere we control.
4. **Terracotta is fenced.** The guide calls it "secondary, editorial only". It
   is recorded as a token but excluded from every interface rule, so nobody can
   read it as a second accent.

Where the guide **corrected me**: the primary app icon is the **English** icon
(I had inferred the Arabic script mark from the older renderer), the favicon is
a **solid** arch rather than an outline, the wordmark minimum is **88px / 22mm**
(I had 72 / 18), the mark's clear space is **half the arch width**, and
`#A9563A` terracotta and `#D6CFC0` neutral-as-a-ground were missing entirely.

---

## 13. Checklist before anything ships

1. One accent — gold (brand) or brass (product), never both, never terracotta.
2. Radius 3px on every rectangle; the only curve is a semicircular arch.
3. Nothing wider than 1:1 is arched.
4. Mark solid below 32px; stroke never thickened.
5. Wordmark above 88px, kerned ZA .24 / AU .20 / UQ .16, clear space clean, no
   rule and no tagline attached.
6. One warm light in every image; nothing cool, nothing high-key.
7. Exactly one gold italic line per headline.
8. No emoji, no em dashes, no icon set, no gradient background.
9. Film grain on.
