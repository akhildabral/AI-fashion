# Component inventory — variants, sizes, and when to use which

Every component in the system, what it comes in, and the decision that picks
it. If something is not here, it does not exist in ZAUQ: check this file before
inventing a part.

Two Sizes cards render this as a scannable table: **Sizes: controls** (actions,
navigation, forms) and **Sizes: surfaces & feedback** (surfaces, data,
feedback, brand). Between them they cover all 29 exported components.

**The heights are the spine.** 44 / 36 / 32, and vertical padding is never set
on a control — the height sets it. That is what makes a mixed row of buttons,
chips and filters align with no adjustment.

| Height | Token | Use for |
|---|---|---|
| **44** | `--control-h` | the default: any primary action, any field |
| **36** | `--control-h-sm` | a row of many, a secondary action, chips, icon buttons |
| **32** | `--control-h-xs` | filter tokens — the quietest control in the system |

On Android the visual stays 44/36/32 but the **effective touch area is never
below 48dp** — add `hitSlop`, don't grow the control.

---

## Actions — `components/actions/`

### `Button`
Variants: `primary` · `ghost` · `quiet` · `danger` · `dark`. Sizes: **44**
(default) and **36** (`size="sm"`). Padding is per variant: primary 24, ghost
and danger 20, quiet 4, dark 24.

| Variant | Means | Rule |
|---|---|---|
| `primary` | act — the screen's verb | **one per row**, brass fill |
| `ghost` | the alternative | at most one per row |
| `quiet` | the escape, a text action | sits on the same height so rows align |
| `danger` | destructive | outline only; never a red fill |
| `dark` | invitation / marketing CTA | landing pages, not app chrome |

Use **36** only inside a dense row, a card footer, a sheet or a feed card.
Never mix 44 and 36 in the same row. Never two brass primaries on one screen.

### `IconButton`
**36 fixed**, square, bordered. Default content is the `···` overflow glyph;
pass a 12–16px hand-drawn SVG for anything else. Always give it `label` — it is
the accessible name. Pair with 36 buttons.

### `Chip`
**36 fixed.** States: off (bordered), on (brass fill), disabled. A chip **picks
a value** — a taste, an occasion, a reason. If it narrows a list instead, it is
a `Filter`.

---

## Navigation — `components/navigation/`

### `Tabs`
12px uppercase label, .14em tracking, a 2px brass rule under the active one,
gap 20 → 24. Switches **views of the same thing**. Optional count per tab.
Scrolls horizontally rather than wrapping.

### `Filter`
**32 fixed**, 3px radius, 10px padding. Off = transparent, on = an 8% ink wash.
**Never brass** — a row of eight brass filters would destroy the meaning of
brass. Optional count.

### `MoreMenu` + `MenuItem`
A 36 `···` trigger and a floating menu (float shadow, `zq-menu-pop`, 140ms,
origin-aware). `align="left" | "right"`, plus `up` to open above the trigger
for controls low on the screen. A custom `trigger` replaces the `···`. For everything that does not earn a
button. `MenuItem` takes `danger` for a destructive row.

---

## Forms — `components/forms/`

### `Field`
**44** (default) or **36** (`size="sm"`). Text, password, `invalid` and helper
states.
Text is 16px below 640 and 14px above — 16 prevents the iOS focus zoom. Focus
takes a brass border at 70% plus a 2px brass ring at 20%.

### `Label`
12px, .18em tracking, uppercase, **6px above its field**. Always present; a
placeholder is not a label.

### `Tape`
The range input as a brass thread: 2px track, an 18 × 26 thumb. For a value you
feel rather than type (a fit, a warmth, a budget). Never for a discrete choice
— that is a `Chip`.

---

## Surfaces — `components/surfaces/`

### `Arch`
Aspects: `2/3` · `3/4` · `4/5` · `5/6` · `1/1`. Variants: niche (default),
`photo`, `bright` (selected). **Portrait only** — the crown is a semicircle of
half the width, so anything wider stretches; a landscape picture is a 3px
rectangle.

| Aspect | Use |
|---|---|
| `2/3` | the Mirror — a standing figure |
| `3/4` | a picture, a landing tile, the brand ratio |
| `4/5` | a tall garment, a person |
| `5/6` | **the standard garment tile** |
| `1/1` | the limit — small ornamental vitrines only |

### `MirrorFrame`
The Mirror's hero: a 3px brass bezel around a dark reflective surface. Give the
child a **2/3** box.

### `Card`
Hairline border, raised fill, 3px, **no shadow**. Padding 16 (in a sidebar or a
feed) or 20 (a feature card). `hover` brass-tints the border — only if the whole
card is a link.

### `Plaque`
The engraved fact: a label, a Bodoni figure at section-head size, a note. Never
a control, never clickable.

### `PageShell` + `SectionHead`
`width="wide" | undefined | "narrow"` → 1400 / 1152 / 768. The shell owns page
padding (16/32 → 24/40). `SectionHead` is the tracked-label-over-Bodoni pair
with an optional `action` on the right.

### `Modal`
**512 wide, 88vh max, 24 padding.** One decision at a time. Scrim is 40% ink
with a 2px blur. On mobile this becomes a native sheet.

---

## Data — `components/data/`

### `GarmentTile`
An `Arch` plus a tracked label and an optional brass sublabel. States:
`selected` (arch brightens 1.18), `processing` (image dims and blurs, the word
"developing" over it). Cut-outs sit at 7% padding (9% on small landing tiles,
10–12% under 64px).

### `Stat`
A Bodoni figure with a tracked label beneath. `accent` sets it brass. 30px
figure, 22px in a dense row. Figures are always tabular.

---

## Feedback — `components/feedback/`

### `Alert`
`error` (the default) · `warning` · `success` — passed as `tone`. Coloured text
on a 10–12% wash of itself,
16 × 10 padding, one line, inline, directly above the thing it is about.

### `Badge`
Tones: `brass` (default) · `quiet` (an ink wash — "In wash", "Packed"). 10 × 2
padding, 12px. A count or a one-word state. Never a button.

### `Toast` + `useFlash`
The result of an action just taken — bottom centre, float shadow. `useFlash()`
returns `{ toast, flash }`; call `flash('Wear logged.')`. Note the hook is
lowercase, so it is available to components and the UI kits but **not** through
the compiled bundle namespace — inside a specimen card, hold the message in
`React.useState` and render `<Toast msg={msg} />` directly.

### `UndoBar`
ZAUQ does not confirm destructive actions — it performs them and offers this.

### `Spinner`
16 (default) / 20 / 24, a brass arc. **Inside a button only.** A bare centred
spinner is not a ZAUQ loading state.

### `SkeletonBlock` / `ArchSkeleton`
The shape of what is coming: blocks at 10% ink for text (7% for secondary
lines), arches for a garment grid. Pulse 2s, 80ms per-item delay. `ArchSkeleton`
takes `count`, `aspect`, `columns`.

### `LoadError`
The fetch failed: one line saying what to do, and a `Try again`.

---

## Brand — `components/brand/`

### `Wordmark`
Playfair 400, kerned ZA .24 / AU .20 / UQ .16. `size` in px (19 in app headers),
`color`. Above 88px in brand material; no rule and no tagline attached.

### `ArchMark`
The only brand glyph, in four variants: `bare` (heavier outline), `script`
(ذوق + its rule — the ceremonial face, **48px and up**), `mirror` (empty), and
`solid` (filled — the only form that survives **below 32px**). Minimum 32px
outlined, 16px solid. `size` is the width in px; the height is always 4/3 of
it.

---

## Loading and empty states — the decision

1. **Cached data exists?** Render it immediately and revalidate behind it. No
   loading state at all.
2. **First load of a known shape?** `ArchSkeleton` (grids) or `SkeletonBlock`
   (text).
3. **An action in flight?** The button keeps its label and takes a `Spinner`;
   the rest of the screen stays put.
4. **A long generation?** The `zq-filament` pulse on the arch being filled, plus
   the word *developing*.
5. **It failed?** `LoadError` with a retry.
6. **There is nothing yet?** One italic Bodoni line and the single action that
   fixes it — never an illustration, never an empty box.
