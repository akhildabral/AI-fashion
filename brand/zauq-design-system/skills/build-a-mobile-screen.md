# Build a ZAUQ mobile screen

For iOS and Android. Read `guidelines/mobile-platform.md` for the rule set and
`ui_kits/mobile/` for the worked examples; this is the recipe.

## 1. Start from the room, not the page

A screen is a room in a tab: `Today · Closet · Mirror · Circle · You`, each its
own native stack. Anything secondary is a **sheet** (`formSheet` route), not a
pushed page — including destructive confirmations.

```
Screen (edges=['top'])
  RoomHeader   eyebrow · Bodoni title + brass italic emphasis · lead
  RoomBody     gutter 20, padded by ACTION_BAR_HEIGHT (72 + 62)
  ActionBar    one brass primary, thumb zone, never scrolls away
  TabBar       the platform's own
```

## 2. Use the native ladder, in dp

display 44/54 · h1 32/40 · h2 24/30 · h3 20/26 · lede 18/26 italic · body 16/24
· bodySm 14/20 · caption 12/16 · label 11 (.18em upper) · micro 10 (.16em
upper) · stat 30/38 tabular. Bodoni at **500**, serif leading ≥ 1.2×.

No rem, no percentages on type, no viewport units. Display roles cap at 1.3×
Dynamic Type; body and UI scale to 200% — measure and wrap, never a fixed
height on text.

## 3. Layout

Gutter **20**, flat. Boards are **two columns**, tile width
`(screenWidth - gutter*2 - 12) / 2`, gap 12. Space scale 4 · 8 · 12 · 16 · 20 ·
24 · 32 · 40 · 48. Lists are `FlashList`, cache-first: render last data at once
and revalidate behind it — never block on a spinner when the cache has
something.

## 4. Touch

Visual heights stay 44 / 36 / 32. **Effective touch is never below 48 × 48 on
Android** — add `hitSlop`, don't grow the control. `pressRetentionOffset={12}`
on every pressable. Long-press (320ms) opens the context menu on tiles and
cards — that is the mobile replacement for the `···` overflow.

## 5. Shapes and pictures

Garments in `Arch` at 5/6 (cut-out, `contain`, 7% padding; 11–12% under 64pt).
People and renders at 4/5. The Mirror at **2/3** inside `MirrorFrame`.
Anything landscape — a feed photo, a scene — is a **3px rectangle with a
hairline**, never an arch. Inside a niche, use the in-niche inks: the niche
stays light in both themes.

## 6. Feedback

- Press: `scale(0.97)` (150ms) **plus one haptic**, same frame.
- Entrances: `rise(i)` on containers only, never on virtualised rows.
- Swaps: `fadeIn`/`fadeOut` inside the same container.
- Dragged things: `spring.snap`/`spring.sheet` fed the gesture velocity.
- Notice: `useFlash()('Wear logged.')`.
- Loading: `ArchSkeleton` / `SkeletonBlock` — the shape of what's coming.
- Empty: one italic Bodoni line and the single action.
- Destructive: do it, then an `UndoBar`.

Reanimated only, UI thread only, transform and opacity only. Nothing animates
layout; nothing per-frame on JS.

## 7. Accessibility

Every icon-only control gets `accessibilityLabel`; selected states use
`accessibilityState`. Nothing clips at 200% Dynamic Type. **Brass on bone is
for large text and rules, never body copy** — it does not pass contrast at
small sizes.

## 8. Icons

The tab bar uses the **platform's own** set — SF Symbols on iOS, MaterialIcons
on Android (`sun.max` / `wb-sunny`, `hanger` / `checkroom`, `sparkles` /
`auto-awesome`, `person.2` / `group`, `person.crop.circle` /
`account-circle`). That is the single sanctioned icon set in the whole system,
and only for platform chrome. Inside a screen, ZAUQ still prefers a word; a
needed glyph is hand-drawn at 1.5px stroke, `currentColor`, no fill.

## 9. Done when

1. Cache-first, with `LoadError` and an empty state that has one action.
2. One brass primary, in the ActionBar if the screen has a main verb.
3. ≥ 44pt visual, ≥ 48dp effective touch everywhere.
4. Nothing clips at 200% type.
5. Labels and `accessibilityState` on every control.
6. One haptic per action.
7. Keyboard-up layout works; safe areas respected top and bottom.
8. Both themes checked, niche contents included.
9. Deep-linkable: params from the URL, not navigation state.
