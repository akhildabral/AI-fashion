# Build an app screen with ZAUQ

A recipe for any product surface — a new room, a settings page, an onboarding
step. Follow it in order; the checks at the end are the ones that catch drift.

## 1. Decide what kind of surface it is

| Surface | Shell | Measure |
|---|---|---|
| A room (Today, Closet, Mirror, Circle) | `PageShell width="wide"` | 1400 |
| A normal page (journal, trips, profile) | `PageShell` | 1152 |
| Auth, legal, settings, one-column prose | `PageShell width="narrow"` | 768 |
| A decision | `Modal` | 512, max-height 88vh |

Page padding belongs to the shell: 16/32, stepping to 24/40 at 640. Never set
it on the screen.

## 2. Write the head, then the body

Every section in ZAUQ is the same pair: a **tracked uppercase Archivo label**
over a **Bodoni line**.

```jsx
<PageShell width="wide">
  <p style={{ fontSize: 'var(--text-nano)', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--text-accent)' }}>
    Wednesday 3 September
  </p>
  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-4)' }}>
    Good morning, Akhil. <em style={{ color: 'var(--text-accent)' }}>This is laid out.</em>
  </h1>
  <SectionHead title="The brief" action={<MoreMenu>…</MoreMenu>} />
</PageShell>
```

One italic brass clause per headline — the emphasis, never the whole line.

## 3. Lay it out

- One column below 768. Two columns above: `--room-split`
  (`minmax(0,1fr) 340px`), gap 48 → 64 at 1280.
- Tile grids declare a **ladder**, not a width: 2 → 3 (`sm`) → 5 (`lg`) → 6
  (`xl`) for a board; 3 → 4 (`md`) for the brief. Every track `minmax(0,1fr)`.
- Gaps: 16 base → 24 at `lg`. Sections 48 → 64.
- Vertical rhythm: 8 label→line, 16 element→element, 32 block→block, 40
  group→group.

## 4. Compose from the primitives — do not re-implement them

`Arch` `MirrorFrame` `Card` `Plaque` `PageShell` `SectionHead` `Modal` ·
`Button` `IconButton` `Chip` · `Field` `Label` `Tape` · `Tabs` `Filter`
`MoreMenu` `MenuItem` · `GarmentTile` `Stat` · `Alert` `Badge` `Toast`
`useFlash` `UndoBar` `Spinner` `SkeletonBlock` `ArchSkeleton` `LoadError` ·
`Wordmark` `ArchMark`.

The control vocabulary is fixed, and brass means one thing:

- **Action** — one brass primary per row; ghost outline for the alternative;
  quiet text for the escape.
- **Tab** — switches views of the same thing; brass rule under the active one.
- **Filter** — narrows a set; an ink wash when on, **never brass**.
- **Chip** — picks a value; brass fill when chosen.
- **Overflow** — `···` and a floating menu for everything that doesn't earn a
  button.

All sit on 44 / 36 / 32, so any mixed row aligns with no adjustment.

## 5. Images and shapes

- A garment: `Arch` at `5/6` (or `3/4`), cut-out, `contain`, 7% padding.
- A person or a render: `Arch` at `4/5`; the Mirror at `2/3` in `MirrorFrame`.
- A scene or anything landscape: a **3px rectangle** with a hairline border —
  never an arch. The crown is a semicircle of half the width, so it stretches.
- Anything drawn *inside* a niche uses `--text-in-niche` /
  `--text-in-niche-muted` — the niche stays light in both themes.

## 6. States, in this order

Loading → the shape of what's coming (`ArchSkeleton`, `SkeletonBlock`), never a
bare spinner. Empty → one italic Bodoni line plus a way forward. Error → what
to do, not what failed. Destructive → do it, then offer `UndoBar`. Success →
a `Toast` via `useFlash`.

Hover lifts text 55% → 100% or brass-tints a border. Press is
`scale(0.97)` on **every** tappable. Focus is a 2px brass outline at 70%,
offset 2. Disabled is `opacity .5`.

## 7. Motion

Entrances rise 12px and fade over 600ms (`zq-rise`, `zq-rise-1…4`); grids
stagger 55ms per item via `zq-rise-stagger` and `style={{'--i': i}}`, capped at
8. Three curves only: `--ease-out`, `--ease-in-out`, `--ease-drawer`. Nothing
bounces, nothing spins except a spinner inside a button.

## 8. Check before you call it done

1. One brass primary per row; no brass filters.
2. Every rectangle 3px; nothing arched wider than 1:1.
3. No shadow on anything at rest — only menus, modals, toasts, the undo bar.
4. No emoji, no icon set; a word instead of a glyph wherever possible.
5. Numbers are tabular; figures are specific.
6. Both themes: toggle `.dark` and check niche contents and hairlines.
7. 44px minimum touch target; nothing below 12px type in the app.
8. Film grain still on (it lives on `body::before` in `tokens/base.css`).
