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

**Radius is 3px, everywhere, forever** (2px for the smallest tokens, 5px for
the arch's feet). No pills, no circles. The one curved form is the arch.

**The arch geometry:** the crown is 46% of the width across and 0.373× the
width tall at any aspect, so a landscape board and a portrait mirror share one
arch. The bezel is a 2px 160° brass gradient (3px on the Mirror); the niche
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

## 5. Iconography

**ZAUQ has no icon library, and that is deliberate.** There is no Lucide, no
Heroicons, no icon font, no sprite sheet anywhere in the codebase — verified by
search. The product draws the handful of glyphs it needs as **inline SVG with a
1.4-1.5px stroke, `currentColor`, no fill**, sized 12-16px.

The full inventory in the real app is about six marks: a close ×, a bell, a
chevron, the `···` overflow dots (a typographic glyph, not an SVG), the
before/after seam's `⇔`, and the arch itself.

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
tokens/                 colours, type, spacing, shape, motion, elevation, base, patterns
components/             the reusable primitives (7 groups, 30 exports)
ui_kits/app/            the signed-in app: Today, Closet, Mirror, Circle
ui_kits/marketing/      the landing page
guidelines/             19 foundation specimen cards
assets/brand/           wordmarks, marks, favicon, app icons
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
