# ZAUQ Design System

**Atelier** — the design system behind ZAUQ, an AI personal stylist for the
clothes you already own.

---

## 1. The product

ZAUQ (Urdu/Persian **ذوق**, *zowk* — taste, discernment, the pleasure of a thing
done well) is an invite-only personal stylist that works with a wardrobe you
already have rather than a catalogue you might buy from.

The user photographs their closet once. From then on the app composes a daily
outfit against the weather, the calendar, what is clean and what has been worn
recently, renders it onto the user's own photo, and keeps a ledger of what each
piece is actually costing per wear.

**The four rooms** (the app's whole navigation):

| Room | What it is |
|---|---|
| **Today** | The brief. The day's outfit hung in four arched niches, why it was chosen, and one tap to log that it was worn. |
| **Closet** | The wardrobe as a board of arched niches, with collections (most worn, never worn, sitting idle, possible twins) and the cost-per-wear ledger. |
| **Mirror** | Pick pieces from the rail; see the look rendered on your own photo. |
| **Circle** | A few people you trust. Verdict polls, friends picking outfits for you, five invitations each. |

Beyond the rooms: **Fitting** (the three-minute taste quiz), **Trips**
(packing capsules), **Journal** (the wear log), **Store** (point your camera at
a garment and ask whether it goes with what you own), **Basket / Wishlist /
Outfits** rooms, plus resale drafts for pieces being let go.

### Sources this system was built from

- **Codebase:** a local folder attached as `AI-fashion` — a Vite + React + TS
  SPA (`frontend/`) on an Express + Postgres + Prisma API (`backend/`), with
  provider-agnostic AI via the Vercel AI SDK. Every token, class and component
  in this system was lifted from real source, principally:
  - `frontend/src/index.css` — the "ATELIER" token block, component classes,
    the arch, the plaque, the tape, the grain and the animation set
  - `frontend/tailwind.config.js` — font families, colour aliases, the one shadow
  - `frontend/src/components/ui.tsx` — the layout and primitive library
  - `frontend/src/components/Brand.tsx` — the wordmark and arch-mark geometry
  - `frontend/src/components/Header.tsx`, `WeekStrip.tsx`, `LookCard.tsx`
  - `frontend/src/pages/*` — TodayPage, ClosetPage, MirrorPage, CirclePage, LandingPage
  - `frontend/src/components/CircleCards.tsx` — the feed card shapes (LookCard,
    VerdictCard, PickCard, Plate, PostHeader)
  - `frontend/index.html` — the Google Fonts link and the meta/OG copy
- **The delivered identity:** `brand/ZAUQ Brand Guide.pdf` (V1.0, September
  2026), `brand/svg/{geometry,editable}` and ~25 official PNG lockups —
  including the English/Arabic icon pair, the solid favicon and the round
  social avatar. Read and reconciled in `guidelines/brand-guidelines.md` §12.
- **The native app:** `mobile/` — an Expo Router + Reanimated app with iOS and
  Android projects, its own token layer (`mobile/src/design/*`) and
  `mobile/CONVENTIONS.md`. Ported to `tokens/native.ts`,
  `guidelines/mobile-platform.md` and `ui_kits/mobile/`.
- **Brand work in this project:** `ZAUQ Brand Guidelines.dc.html`,
  `ZAUQ Brand Mark.dc.html`, `ZAUQ Assets.dc.html`, `ZAUQ Brand in Use.dc.html`
- **Imagery:** `frontend/public/landing/*.webp` and `frontend/public/brand/*`,
  copied into `assets/`

There is no Figma file and no repository URL; the attached folder is the only
code source. No design-system definition existed as a separate artefact — the
system was implicit in the CSS, and this project makes it explicit.

---

## 2. Philosophy

> **A gallery by day, an atelier by night.**

Four ideas, in order of how much they decide:

**1. Restraint is the luxury.** One accent colour. One curved form. One radius.
Two typefaces. No gradients on backgrounds, no drop shadows on resting
surfaces, no icon library, no emoji. Everything that is not load-bearing has
been removed, and what remains is allowed to be large.

**2. The interface is a room, not a dashboard.** The product's own words are
architectural: *rooms*, *the rail*, *the niche*, *the vitrine*, *the light
cord*, *the plaque*. Navigation is "which room am I in", not "which tab is
selected". This is why the header has a pull-cord that changes the theme
instead of a settings toggle, and why loading a grid shows arches rather than
a spinner: the shape of the room is there before its contents arrive.

**3. The arch earns the brand.** The arch was in the product before it was a
logo — it frames every garment, every render, every mirror. Making it the mark
means the identity was earned by the interface rather than applied on top of
it. It is the *only* curved form in the system; everything else is a 3px
rectangle.

**4. Depth without elevation.** Resting things have no shadow. Depth comes from
three places instead: the milled brass bezel, the lit niche recessed inside it,
and a film-grain overlay on every screen. This is what keeps a flat, shadowless
system from reading as flat vector art.

### The vocabulary of action

Five control types, deliberately distinct, so brass always means one thing:

| Type | Does | Looks like |
|---|---|---|
| **Action** | Acts | Primary = brass fill (one per row); ghost = outline; quiet = text |
| **Tab** | Switches views of the same thing | Text on a hairline, 2px brass rule under the active one |
| **Filter** | Narrows a set | A quiet token, 8% ink wash when on — **never brass** |
| **Choice** | Picks a value | A bordered chip, brass fill when chosen |
| **Overflow** | Everything that doesn't earn a button | The `···` icon button and a floating menu |

All of them sit on the same height scale (44 / 36 / 32) so any row aligns with
no adjustment. Brass keeps meaning "act" or "you are here"; a row of eight
brass filters would destroy both.

---

## 3. Content fundamentals

**Person and voice.** The app speaks in **first person** as the stylist, to a
**"you"** who is being dressed: *"Got it. I'll read this one more casual."*
*"Off the rail. I won't put it forward again."* The stylist has judgement and
admits limits — *"The stylist is out for a moment. Try again in a few
seconds."* Marketing drops the "I" and speaks in plain second person: *"It
knows your closet."*

**Register: British, literary, unhurried.** British spelling throughout
(*colour*, *favourite*, *jewellery*). Sentences are short and often verbless.
Full stops do the work that exclamation marks would do elsewhere. Real
typographic apostrophes (’), never straight quotes.

**Concrete over abstract.** Never "optimise your wardrobe utilisation" —
always *"You own thirty-eight things. You wear six."* Numbers are specific
(41,460 not "thousands"; 7:39 not "the morning"). Clothes are named as clothes:
*camel blazer*, *silk slip dress*, *suede flats*.

**The architectural lexicon** is load-bearing and should be reused, not
paraphrased: *the brief*, *the rooms*, *the rail*, *the niche*, *the mirror*,
*the circle*, *the ledger*, *the plaque*, *a sitting*, *a fitting*, *let it
go*, *hang it*, *developing*, *the first morning*.

**Casing.**
- Sentence case for headlines, buttons and body: *"Show me another"*, *"Let it go"*
- UPPERCASE with wide tracking for labels, eyebrows, tabs and nav — the brand's
  most-repeated typographic gesture
- The wordmark is always **ZAUQ**, never *Zauq* or *zauq*

**Length.** Headlines 2-7 words. Supporting lines one sentence. Empty states are
a single line with a way forward: *"Add a top, a bottom and shoes, and
tomorrow's outfit hangs here."* Errors say what to do, not what failed:
*"Use JPG, PNG, WebP or HEIC photos up to 12MB."*

**Emoji: never.** Not in UI, not in marketing, not in captions. The one
non-alphabetic glyph in use is `···` for overflow and `⇔` on the
before/after seam.

**Copy that must not be softened:** *"Your photo is yours. Delete it any time,
and every render made from it goes with it."*

---

## 4. Visual foundations

### Colour

Two themes, one token set. **Dark is the brand's native register**; light is a
true second theme, not an afterthought.

| | Atelier by night (default) | Gallery by day |
|---|---|---|
| Ground | `#0E0D0B` near-black | `#EBE5D7` warm paper |
| Raised | `#1A1714` | `#F5F0E6` |
| Text | `#ECE5D8` bone | `#221B12` ink |
| Brass | `#C8A45E` | `#B98C3B` |
| Brass hover | `#D9B87A` | `#A67C30` |
| Brass text | `#E4CB94` | `#8A6620` |

Nothing is pure white or pure black — the ground is warm at both ends. Text
opacity is the whole hierarchy: 100% / 75% / 55% / 45% ink, with 20% / 15% /
10% for controls, fields and hairlines.

**One accent.** Brass, in four steps. Semantic colours exist (danger
`#D86C64`, success `#8AB894`, warning `#C8A45E`) and always appear as
coloured text on a 10-12% wash of themselves.

**Identity constants** — gold `#D8B26A`, ink `#0B0A09`, cream `#F2EDE3`,
neutral `#D6CFC0` — belong to the logo and never theme. Identity gold sits
slightly warmer than product brass because it is a printing decision.

### Type

**Bodoni Moda** speaks: headings, figures, modal titles, any line with a
feeling in it. Weight 500, never bold; italic carries emphasis. Tracking
-0.01em, leading 0.98-1.14 (tighter as size grows).

**Archivo** labels: interface, body, buttons, nav, meta, counts. 400 / 500 /
600.

**Playfair Display** is the wordmark and nothing else. **Noto Nastaliq Urdu**
is ذوق and nothing else. Neither appears in body copy, ever.

The signature move is a **tracked uppercase label above a Bodoni line** —
0.28em brass eyebrow, 0.18em field label, 0.14em tab, 0.12em tile label. Every
section head in the product is that pair.

Figures are always tabular so a row doesn't jitter as it updates.

### Shape and space

4px base. Real rhythm: 3-4 inside controls, 4-6 between elements, 8-10 page
padding, 12-16 between landing sections. Control heights 44 / 36 / 32.

**Radius is 3px, everywhere, forever** (2px for the smallest tokens, 4px for
the arch's feet — the mark's own foot radius). No pills, no circles. The one
curved form is the arch.

**The arch geometry (corrected — see §9):** the crown is a **semicircle of
radius w/2**, exactly as drawn in the brand mark, so `--arch-h` = 50% × (w/h).
The arch is a **portrait** form: 1/1 is the widest it may ever be, and a
landscape picture is a 3px rectangle instead. The bezel is a 2px 160° brass
gradient (3px on the Mirror); the niche
inside carries an inset vitrine shadow and a vignette that melts product-shot
white edges into the warm fill. Cut-out garments sit `contain` with 7%
padding; photographs use `.zq-arch-photo` and `cover`.

**The one place the theme does not flip.** The niche is a near-white lit
vitrine in *both* themes, so `--c-ink` and the `--text-*` aliases invert
underneath an arch. Anything drawn **inside** a niche — an empty-state glyph,
an overlay caption, a placeholder letterform — must use theme-invariant dark
ink: `--text-in-niche`, `--text-in-niche-muted`, or `--brand-ink`. A label
*under* an arch sits on the page ground and themes normally. Photo arches are
exempt: their fill is `--surface-raised`.

### Backgrounds and imagery

Flat colour fields — **no gradients as backgrounds**. The only gradients in the
system are functional: the brass bezel, the niche's radial light, the plaque's
surface-to-ground wash, and the tape's fill.

**Film grain** (fractal-noise SVG, 140×140) sits fixed over every screen —
screen blend at 5% on dark, multiply at 4.5% on light.

Imagery is **warm, low-key, single-source-lit**: one lamp in a dark room,
window light on a chair, brass and shadow. Garments are matted cut-outs on a
lit niche; scenes are photographs. Nothing is cool-toned, nothing is
high-key, nothing is a stock-photo smile. Photographs get a protection
gradient rather than a capsule when text must sit over them; a card or plaque
is used when the text is a discrete fact.


### Layout, columns and responsiveness

ZAUQ is **not a 12-column grid**. It is a centred measure, symmetric page
padding, and a column count that steps at four breakpoints. Tokens live in
`tokens/layout.css`.

**Breakpoints** (Tailwind defaults — the product's own), mobile-first, never a
max-width query:

| | Width | What changes at it |
|---|---|---|
| base | 0–639 | one column · gutter 16 · page padding 16/32 · hero 48px |
| `sm` | 640 | gutter 24 · page padding 24/40 · board 3-up · hero 60px |
| `md` | 768 | the one-column → two-column switch · brief 4-up |
| `lg` | 1024 | board 5-up · the room's 340px sidebar appears · gaps 24/48 |
| `xl` | 1280 | board 6-up · hero 72px · room gap 64 |

**Measures.** Every page is one of five, centred with `mx-auto`; the measure
never changes with content.

`--measure-prose` 672 (reading) · `--measure-narrow` 768 (auth, legal,
settings) · `--measure` 1152 (the default page) · `--measure-wide` 1400
(header, Closet board) · `--measure-modal` 512 (every modal).

**Page padding** belongs to `PageShell` and nothing else: `--pad-x` 16 →
`--pad-x-sm` 24, `--pad-y` 32 → `--pad-y-sm` 40. A screen never sets its own.

**Column ladders.** Grids declare a ladder, not a width, and every track is
`minmax(0, 1fr)` so a long label can never widen a column:

- **The Closet board** — 2 → 3 (`sm`) → 5 (`lg`) → 6 (`xl`), gap 16 → 24.
- **The Today brief** — 3 → 4 (`md`), gap 12 → 20 (`sm`) → 24 (`lg`).
- **A landing room** — 1 → 2 (`md`), gap 40, with the picture side flipping
  order on alternate rooms.
- **The two-column room** — `--room-split` = `minmax(0,1fr) 340px` at 1024+,
  gap 48 → 64; below that the aside stacks full-width under the content.
- **The landing hero** — `--hero-split` = `1.05fr 0.95fr` at 768+; the copy is
  deliberately the wider half.

**Responsive type.** Only display roles scale. Body, buttons, labels and meta
are fixed at every width — a 15px line reads the same on a phone as on a
desktop. Hero 48 → 60 (`sm`) → 72 (`lg`/`xl`); section head 30 → 36 (`sm`);
card and modal titles fixed at 24. The one role that scales *downward* is the
field: 16px below 640 so iOS does not zoom on focus, 14px from 640 up.

**What stacks, and in which order.** Below `md`, a two-column layout becomes
copy-then-picture; a sidebar becomes a section at the end; a toolbar wraps
(`gap-x 16 / gap-y 8`) rather than scrolling; tab rows scroll horizontally
rather than wrapping. Touch targets never drop below the 44px control height,
and the 36/32 heights are desktop-and-up or non-primary only.

### Proportion and ratio

**The arch is a proportion, not a picture — and the proportion is a
semicircle.** The brand mark is the ground truth: its crown arcs 146px across a
292px-wide box, i.e. a true half-circle of radius w/2 in a 3:4 frame. So:

```
horizontal radius = 50% of the width      (a half-circle, always)
crown height      = w / 2
--arch-h          = 50% × (w / h)         (as a % of the frame HEIGHT)
```

Because the crown is half the width, **an arch is a portrait form.** At 1/1 the
crown already occupies half the frame; wider than that and it flattens into a
stretched lozenge — which is what the app was doing, and it looked wrong.

| Ratio | `--arch-h` | Used for |
|---|---|---|
| 2 / 3 | 33.3% | **the Mirror** — a standing figure |
| 3 / 4 | 37.5% | the brand ratio: landing tiles, feed photos, the mark |
| 4 / 5 | 40% | a tall garment, a person |
| 5 / 6 | 41.7% | the standard garment tile |
| 1 / 1 | 50% | the absolute limit — small ornamental vitrines only |

**Landscape surfaces are not arches.** A wide photograph, a video still, a
scene: 3px rectangle, hairline border, no bezel and no crown
(`--ratio-photo` 4/3, `--ratio-board` 16/9). The avatar is a 3px brass square,
never an arched or circular frame. Ratios are tokens (`--ratio-mirror`,
`--ratio-garment`, `--ratio-tile`, `--ratio-portrait`, `--ratio-photo`,
`--ratio-board`, `--ratio-square`) and the list is closed: a new surface takes
one of these or it does not ship.

**The type scale is a major third.** 72 · 60 · 48 · 36 · 30 · 24 · 20 — each
step ≈ &divide;1.25 (`--type-ratio`). The UI ladder deliberately does *not*
follow it: 17 · 15 · 14 · 13 · 12 · 11 · 10, one pixel at a time, because
labels must sit inside 44/36/32 controls without fractional leading.

**Optical proportions worth keeping.** A garment sits at 7% padding inside its
niche (9% on small landing tiles, 10-12% on tiles under 64px) so the cut-out
never touches the bezel; the bezel is 2px (3px on the Mirror); the plaque's
engraved figure is set at the same size as a section head so a fact and a
heading have equal weight. The bezel does **not** scale with the frame — a
64px tile and a 480px mirror both get 2-3px, because a proportional bezel
reads as a thick gold border at small sizes.

### Spacing and padding rules

The base is 4px, but the product only really lives at **4, 6, 8, 10, 12, 16,
20, 24, 32, 40, 48, 64**. Use those.

**Vertical rhythm** — each gap has one meaning:

| Gap | Token | Means |
|---|---|---|
| 8 | `--stack-tight` | tracked label → the line it labels |
| 16 | `--stack` | element → element inside a block |
| 32 | `--stack-loose` | block → block |
| 40 | `--stack-group` | group → group (a section and its neighbour) |
| 48 / 64 | `--section-y-page` / `-sm` | section → section on a landing page |

Grid gaps always sit **below** page padding: 12–24 inside a grid, 16–24 at the
page edge, 48–64 between sections. *If two gaps in one layout are within 4px of
each other, one of them is wrong.*

**Inner padding is fixed per control — copy these exactly:**

| Element | Height | Padding X | Padding Y | Text |
|---|---|---|---|---|
| Button · primary | 44 | 24 | — | 14 / 600 |
| Button · ghost, danger | 44 | 20 | — | 14 / 500 |
| Button · quiet | 44 | 4 | — | 14 / 500 |
| Button · small | 36 | 20 | — | 12 |
| Icon button | 36 | 36 wide | — | — |
| Chip | 36 | 14 | — | 13 / 500 |
| Filter token | 32 | 10 | — | 13 / 500 |
| Field | 44 | 16 | — | 16 → 14 (`sm`) |
| Field · small | 36 | 12 | — | 13 |
| Alert | — | 16 | 10 | 14 |
| Badge | — | 10 | 2 | 12 / 600 |
| Card | — | 16 or 20 | 16 or 20 | — |
| Modal | — | 24 | 24 | — |
| Tab | — | — | 4 top / 12 bottom | 11 → 12 (`sm`) |
| Label → field | — | — | 6 below the label | 12 / .18em |

Vertical padding is **never** set on a control — the height sets it, which is
what makes any mixed row of buttons, chips and filters align with no
adjustment. Toolbars use `gap-x 16 / gap-y 8`; tab rows `gap-x 20 → 24`.

### Motion

Three curves, and that is the whole vocabulary:

```
--ease-out      cubic-bezier(.23, 1, .32, 1)     entrances, UI
--ease-in-out   cubic-bezier(.77, 0, .175, 1)    on-screen movement
--ease-drawer   cubic-bezier(.32, .72, 0, 1)     sheets
--ease-rise     cubic-bezier(.2, .7, .2, 1)      the rise entrance
```

**Entrances** rise 12px and fade over 600ms; grids stagger 55ms per item,
capped at 8 so a long grid never crawls in. **Presses** shrink to `scale(0.97)`
in 150ms — every tappable, no exceptions. Nothing bounces; nothing spins except
a spinner inside a button.

Three signature animations: the **arch sweep** (a brass sheen crossing an arch
on reveal), the **mirror reveal** (a render resolving out of blur), and the
**filament** (a slow 5.5s pulse while the figure is being dressed). Everything
is disabled under `prefers-reduced-motion`.

### States

- **Hover:** brass-tints a border, or lifts text from 55% to 100% ink. Never a
  colour change on a fill except primary → brass-deep.
- **Press:** `scale(0.97)`.
- **Focus:** a 2px brass outline at 70%, offset 2px; fields also take a 2px
  brass ring at 20%.
- **Selected:** an arch brightens (`brightness(1.18) saturate(1.05)`); a chip
  fills brass; a tab gets the brass rule.
- **Disabled:** `opacity: 0.5`, `cursor: not-allowed`.
- **Loading:** the shape of what's coming — `ArchSkeleton` for grids, pulsing
  blocks for text. A bare centred spinner is not used.
- **Empty:** one italic Bodoni line and a way forward.
- **Destructive:** deferred, not confirmed. The item goes, and an `UndoBar`
  appears.

### Elevation and transparency

One shadow token, `--shadow-float` (`0 24px 60px -30px rgba(0,0,0,.7)`), used
by exactly four things: menus, modals, toasts and the undo bar. Cards, tiles,
inputs and arches have none.

Blur is used twice: the sticky header (`blur(12px)` over an 80% ground) and the
modal scrim (`blur(2px)` over 40% ink). Nowhere else.

---

## 4b. Corrections to the app as built

This system is the **baseline, not a transcript.** Where the shipping app is
inconsistent with itself, the numbers below are correct and the app should be
brought to them. Each entry says what the app does, what it should do, and
where to change it.

| # | What the app does | What is correct | Change |
|---|---|---|---|
| 1 | Arch crown is a flattened ellipse: 46% across, 0.373× the width tall | Crown is a **semicircle of radius w/2** — the brand mark's own curve. `--arch-h` = 50% × (w/h): 2/3 → 33.3, 3/4 → 37.5, 4/5 → 40, 5/6 → 41.7, 1/1 → 50 | `index.css` `--arch-radius` → `50% 50% …`; the `ARCH_H` map in `ui.tsx` |
| 2 | Landscape arches exist (5/4, 4/3 — the Circle feed photo, wide boards) | **An arch is portrait-only; 1/1 is the limit.** A wide picture is a 3px rectangle with a hairline, no bezel | remove those aspects from `ARCH_H`; `CircleCards.tsx` feed photo → rectangle |
| 3 | The Mirror render is 3/4 | **2/3** — a mirror holds a standing figure; 3/4 reads as a portrait frame | `MirrorPage.tsx` render box → `--ratio-mirror` |
| 4 | The Mirror has its own crown formula (`48% / 26%`) | One formula only. The Mirror is the same semicircle at 2/3, with a 3px bezel and 6px feet | `--mirror-radius` |
| 5 | Arch feet are 5px | **4px** (`--arch-foot`) — the mark's own foot radius | the arch rules in `index.css`; `--radius-lg` is deprecated |
| 5b | The crown is composed in a `:root` token (`--arch-radius`) holding a nested `var(--arch-h)` | **Compose the radius on the element** (`.zq-arch-bezel` / `.zq-arch-niche`). A nested `var()` is substituted where the property is *declared* — at `:root`, where `--arch-h` is unset — so every arch silently freezes at the fallback crown and the per-aspect heights are dead code. This is why the app's arches looked flattened even where the maths was right | `index.css`: move `border-radius` into the arch rules; delete `--arch-radius` |
| 6 | Filter tokens are 2px radius, everything else 3px | **3px.** 2px is reserved for the tape thumb alone | `.filter-token` |
| 7 | `--shell-wide` is `1400px` inside an otherwise rem scale | **87.5rem** | `--shell-wide` |
| 8 | Two section-rhythm token pairs (`--section-y`, `--section-y-page`) | One: `--section-y-page` 48 → 64 (`sm`) | deprecate `--section-y*` |
| 9 | Grid gaps ladder differently per surface (board 16 flat; brief 12 → 20 → 24) | **16 base → 24 at `lg`** for every tile grid | the grid classes on `ClosetPage`, `TodayPage` |
| 10 | Tab labels step 11 → 12px at `sm` | **12px fixed.** A 1px step nobody can see is not worth a breakpoint | `.tab` |
| 11 | `btn-dark` is padded `px-6 py-3` with no height | **h-44 / px-24**, like every other button, so mixed rows align | `.btn-dark` |
| 12 | Small controls disagree on type size: `btn-sm` 12px, chip 13px, both 36px tall | **13px** for every 36px control | `.btn-sm` |
| 13 | Colour tokens carry legacy names (`iris`, `spark`, `clay`, `sage`, `theater`) | New code uses the **semantic aliases only** — `--fill-accent`, `--text-accent`, `--surface-*`, `--border-*`. The channel names stay for compatibility and should be retired surface by surface | `tailwind.config.js` |
| 14 | Avatar sizes vary ad hoc | **40 / 32 / 24 only**, always a 3px brass square with initials — never a circle, never an image | headers, cards, feeds |
| 15 | Field text is 16px below 640 and 14px above | **Correct as-is** — 16px prevents the iOS focus zoom. Documented, not changed | — |
| 16 | The arch's feet are 5px on web, "2–3px" in the brand guide | **3px** — inside the guide's range and equal to the house radius, so feet and rectangles agree | `--arch-foot` |
| 17 | Native headings use Bodoni **400** | **500** — the brand sets headings at 500 and never bold; 400 reads thin against the web at the same size | `mobile/src/design/type.ts` |
| 18 | Native press is 120ms, web 150ms | **150ms** both — a platform-only drift with no reason behind it | `mobile/src/design/motion.ts` |
| 19 | Native space scale has no 20 or 40 | **Add both** so the phone can keep the web's rhythm (label 8, element 16, block 32, group 40) | `mobile/src/design/tokens.ts` |
| 20 | Dynamic Type is uncapped | **Cap display roles at 1.3×**; body and UI scale to 200%. A 44pt Bodoni line at 2× pushes the room header off screen | `type` roles + `fontScale` |
| 21 | Touch targets are 44pt on both platforms | **44pt visual, but ≥ 48dp effective on Android** via `hitSlop` — a 32pt filter token is illegal on Android as-is | every pressable |
| 22 | Terracotta `#A9563A` and neutral-as-a-ground `#D6CFC0` exist in the identity but nowhere in code | **Recorded as tokens and fenced**: terracotta is editorial only, never an interface colour | `tokens/colors.css` |
| 23 | The favicon is rendered as an **outlined** arch; the app icon uses the Arabic script mark | **Solid** gold arch for the favicon (a hairline greys out when downsampled); the **English** icon is the primary app icon, Arabic is secondary for MENA/packaging | `backend/scripts/brand-icons.ts` |
| 24 | The wordmark is locked up with a rule and a tagline in the OG/ad builds | The guide's own construction is **no rule, no tagline**: the rule belongs to the ceremonial lockup, the tagline is a separate tracked-Archivo element | ad + OG builds |

Two rules catch most future drift: **every rectangle is 3px and every curve is
a semicircular arch**, and **vertical padding is never set on a control** — the
44/36/32 height sets it.

## 5. Brand and identity

The full identity guide — mark geometry, variants, clear space and minimums,
the four lockups, brand colour vs product colour, ad and social layout at all
three sizes, the imagery prompt and its bans, and a pre-ship checklist — is
**`guidelines/brand-guidelines.md`**. Read it before making anything that
carries the mark.

The short version: ink ground, one warm light, gold accent, Bodoni headline
with exactly one gold italic line, Archivo subline, 9% margins, film grain on,
no emoji, and the arch never wider than 1:1.

## 5b. Iconography

**ZAUQ has no icon library, and that is deliberate.** There is no Lucide, no
Heroicons, no icon font, no sprite sheet anywhere in the codebase — verified by
search. The product draws the handful of glyphs it needs as **inline SVG with a
1.4-1.5px stroke, `currentColor`, no fill**, sized 12-16px.

The full inventory in the real app is about six marks: a close ×, a bell, a
chevron, the `···` overflow dots (a typographic glyph, not an SVG), the
before/after seam's `⇔`, and the arch itself.

**The one exception, on native.** The mobile app's tab bar uses the
**platform's own** icon set — SF Symbols on iOS, MaterialIcons on Android
(`sun.max`/`wb-sunny`, `hanger`/`checkroom`, `sparkles`/`auto-awesome`,
`person.2`/`group`, `person.crop.circle`/`account-circle`). That is correct and
should stay: platform chrome should look native. It does **not** license an
icon set inside a screen, on the web, or in brand material.

**Rules for new work:**
1. Prefer a word to an icon. ZAUQ labels things.
2. If a glyph is genuinely needed, hand-draw it at 1.5px stroke, no fill,
   `currentColor`, on a 12 / 16 / 24 grid.
3. Never introduce an icon set, never use emoji, never use a filled or duotone
   icon.
4. The arch mark (`ArchMark`) is available in four variants and is the only
   brand glyph.

The **avatar** is initials in a 3px brass square, not a circle and not an image.

Assets copied in: `assets/brand/favicon.svg` (the arch), `icon-512.png`,
`apple-touch-icon.png`, and the wordmark/mark PNGs in cream, ink and gold.

---

## 6. Index

```
styles.css              the global entry point — @import lines only
thumbnail.html          the project tile (brand mark + accent swatch strip)
templates/              two DC starting templates: Today brief, Landing hero
tokens/                 colours, type, spacing, layout, shape, motion, elevation, base, patterns
tokens/native.ts        the same system for React Native (no CSS vars on native)
components/             the reusable primitives (7 groups, 30 exports)
ui_kits/app/            the signed-in app: Today, Closet, Mirror, Circle
ui_kits/marketing/      the landing page
ui_kits/mobile/         the rooms on a phone: 390x844, tab bar, ActionBar
guidelines/             36 foundation specimen cards + the prose guides:
                          brand-guidelines.md   identity, lockups, ads, imagery
                          asset-index.md        every logo file and which to use
                          component-inventory.md variants, sizes, when to use which
                          motion-and-loading.md animations, states, skeletons
                          mobile-platform.md    iOS + Android: what changes and why
skills/                 build-an-app-screen.md · build-a-mobile-screen.md
                        build-brand-material.md · extend-the-system.md
assets/brand/           wordmarks, marks, favicon, app icons
assets/brand/official/   the delivered identity: icons, lockups, SVG geometry
assets/mobile/          grain, app icon, Android adaptive layers
assets/imagery/         the product photography
SKILL.md                the Agent Skills entry point
```

### Components

| Group | Exports |
|---|---|
| `brand/` | `Wordmark`, `ArchMark` |
| `actions/` | `Button`, `IconButton`, `Chip` |
| `forms/` | `Field`, `Label`, `Tape` |
| `navigation/` | `Tabs`, `Filter`, `MoreMenu`, `MenuItem` |
| `surfaces/` | `Arch`, `MirrorFrame`, `Card`, `Plaque`, `PageShell`, `SectionHead`, `Modal` |
| `data/` | `GarmentTile`, `Stat` |
| `feedback/` | `Alert`, `Badge`, `Toast`, `useFlash`, `UndoBar`, `Spinner`, `SkeletonBlock`, `ArchSkeleton`, `LoadError` |

This mirrors the codebase's own inventory (`ui.tsx` + the `index.css`
component layer + `Brand.tsx`). **Intentional additions** — three, each because
the source expressed the pattern as a CSS class rather than a component:

- **`Button`** consolidates `.btn-primary` / `.btn-ghost` / `.btn-quiet` /
  `.btn-danger` / `.btn-dark` and the `.btn-sm` modifier into one `variant` prop.
- **`Chip`** wraps `.chip` / `.chip-on`; **`Field`**/`Label`/`Alert`/`Badge`
  wrap `.field` / `.label` / `.alert-*` / `.badge-spark`.
- **`Plaque`** wraps `.plaque`, and **`Tape`** wraps `.tape`.

Nothing was invented that the product does not already do. Notably **absent on
purpose**, because the source has no such pattern: Tooltip, Accordion,
Breadcrumb, Pagination, Avatar-as-image, Switch, Radio, bottom Sheet.

### Not covered

The app has surfaces this kit does not recreate as full screens — Fitting
(the taste quiz), Trips/Packing, Journal, Store, Profile, Billing, Admin,
Basket/Wishlist/Outfits rooms, and the auth flow. They compose entirely from
the primitives above; ask if you want any of them built out.

---

## 7. Using this system

**In a mock or prototype:** link `styles.css`, then compose from the
components. The arch, plaque, tape, grain, press and animation classes ship as
`zq-`-prefixed utilities in `tokens/patterns.css` so a static HTML mock can
use them with no React.

**In production:** the product is Tailwind-based. The token names in
`tokens/colors.css` are the same ones `tailwind.config.js` already maps
(`ink`, `bone`, `surface`, `iris`/`brass`, `spark`), so values here can be
copied across directly.

**The one rule that catches most mistakes:** if you are reaching for a shadow,
a second accent colour, a rounded pill or an icon set, the answer in this
system is a hairline, brass, a 3px rectangle, or a word.
