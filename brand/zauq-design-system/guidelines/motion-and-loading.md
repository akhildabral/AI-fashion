# Motion, loading and skeletons

The whole vocabulary. Three curves, four signature animations, one press
behaviour, and a loading state that is always the *shape of what is coming*.

---

## 1. Curves and durations

```
--ease-out      cubic-bezier(.23, 1, .32, 1)      entrances, UI
--ease-in-out   cubic-bezier(.77, 0, .175, 1)     on-screen movement
--ease-drawer   cubic-bezier(.32, .72, 0, 1)      sheets
--ease-rise     cubic-bezier(.2, .7, .2, 1)       the rise entrance
```

| Token | ms | For |
|---|---|---|
| `--dur-press` | 150 | press feedback, colour and border transitions |
| `--dur-menu` | 140 | a menu or popover appearing |
| `--dur-rise` | 600 | an entrance |
| `--dur-sweep` | 700 | the arch sweep |
| `--dur-mirror` | 850 | the mirror reveal |

**Nothing bounces.** No spring overshoot, no elastic, no scale-up-past-1.
Nothing spins except a `Spinner` inside a button. Transform and opacity only —
never animate layout, width, height or top/left.

Everything is disabled under `prefers-reduced-motion` (and `ReduceMotion.System`
on native). Reduced motion removes the movement, not the feedback: haptics and
state changes still fire.

---

## 2. Entrances

**Rise** — 12px up and a fade, 600ms, `--ease-rise`. This is the only entrance
in ZAUQ.

```html
<div class="zq-rise">…</div>          <!-- immediately -->
<div class="zq-rise-1">…</div>        <!-- +60ms  (…-2 +120, -3 +180, -4 +240) -->
```

**Staggered grids** — 55ms per item, **capped at 8** so a long grid never
crawls in:

```html
<div class="zq-rise-stagger" style="--i: 0">…</div>
<div class="zq-rise-stagger" style="--i: 1">…</div>
```

Use rise on **containers and small groups**. Never on virtualised list rows
(native) or on anything that re-renders often — the animation restarts and the
page flickers.

---

## 3. The four signature animations

| Class | What it is | When |
|---|---|---|
| `zq-arch-sweep` | a brass sheen crossing an arch, 700ms | a garment revealed for the first time — a new piece, a fresh brief |
| `zq-mirror-reveal` | blur + scale resolving into focus, 850ms | a render arriving in the Mirror |
| `zq-filament` | a slow 5.5s opacity pulse | while the figure is being dressed — a long generation |
| `zq-menu-pop` | 140ms origin-aware scale + fade | `MoreMenu`, popovers |

Each has exactly one job. The sweep is a *reveal*, not decoration: sweeping
every tile on every load turns the room into a slot machine.

---

## 4. Interaction states

| State | Behaviour |
|---|---|
| **Hover** | brass-tints a border, or lifts text from 55% → 100% ink. Never a colour change on a fill, except primary → brass-deep |
| **Press** | `scale(0.97)` in 150ms via `.zq-press` — **every tappable, no exceptions** (plus one haptic on native) |
| **Focus** | 2px brass outline at 70%, offset 2; fields also take a 2px brass ring at 20% |
| **Selected** | an arch brightens (`brightness(1.18) saturate(1.05)`); a chip fills brass; a tab takes the 2px brass rule |
| **Disabled** | `opacity: 0.5`, `cursor: not-allowed` — never a greyed colour |
| **Destructive** | no confirmation dialog: perform it, then show `UndoBar` |

There is no hover on native. Press and haptics carry that whole load.

---

## 5. Loading — the decision, in order

1. **Cached data exists** → render it immediately and revalidate behind it.
   **No loading state at all.** This is the most common correct answer.
2. **First load of a known shape** → a skeleton of that shape:
   `ArchSkeleton` for a garment grid, `SkeletonBlock` for text.
3. **An action in flight** → the button keeps its label and takes a `Spinner`;
   nothing else on the screen moves or dims.
4. **A long generation** (a render, a brief being composed) → `zq-filament` on
   the arch being filled, plus the word *developing* in tracked micro type.
5. **It failed** → `LoadError`: one line saying what to do, and a retry.
6. **There is genuinely nothing yet** → one italic Bodoni line and the single
   action that fixes it. No illustration, no empty box, no "no data".

**Never**: a bare centred spinner, a full-screen overlay, a progress bar for
something you can't measure, or a layout that jumps when the data lands (the
skeleton must occupy the real dimensions).

---

## 6. Skeleton specifications

| | Value |
|---|---|
| Fill | `rgb(var(--c-ink) / 0.1)` — 0.07 for secondary lines |
| Radius | 3px (an arch skeleton keeps the arch shape) |
| Pulse | `opacity 1 → .5 → 1`, 2s, `cubic-bezier(.4, 0, .6, 1)`, infinite |
| Per-item delay | 80ms, so a grid breathes rather than throbs |
| Arch skeleton opacity | 0.6 overall, so it reads as absent rather than empty |
| Count | match the real content: 6 tiles if the grid shows 6 |

```jsx
<ArchSkeleton count={6} aspect="5/6" />
<SkeletonBlock style={{ height: 44, width: '72%' }} />
<SkeletonBlock style={{ height: 16, width: '56%' }} />
```

A skeleton is **aria-hidden** for blocks and `aria-busy` on the container; a
screen reader should hear "loading", not a description of grey boxes.

---

## 7. Native differences

Reanimated only, UI thread only. `rise(i)` mirrors `zq-rise-stagger`;
`fadeIn`/`fadeOut` (220/150ms) replace CSS transitions for swaps inside a
container; `spring.snap` and `spring.sheet` (dampingRatio 0.8, no overshoot) are
for anything a finger drags — pass the gesture's velocity. Press is 150ms and
`PRESS_SCALE` 0.97, same as web.

The haptic is part of the motion, not an extra: `select()` for detents,
`tap()` for toggles and reactions, `success()` / `failure()` for outcomes,
`thud()` for a fired destructive action. One per action, same frame as the
visual, never the only feedback.
