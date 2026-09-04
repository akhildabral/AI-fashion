# ZAUQ on mobile

**One design system, two layers.** iOS and Android do not get their own design
system — the brand, palette, type, proportion, motion vocabulary, voice and
component *inventory* are identical. What changes is the substrate: React Native
has no CSS custom properties, no `rem`, no `:hover`, no viewport, and two
platforms with their own touch and navigation laws.

This file is that layer. The token export is `tokens/native.ts`; the shipping
app it was reconciled against is `mobile/` (Expo Router + Reanimated, with iOS
and Android projects and `mobile/CONVENTIONS.md`).

---

## 1. What carries over unchanged

Palette (both themes, hex-for-hex) · brass means "act" or "here" and nothing
else · radius **3** on every rectangle · the arch as the only curve, portrait
only · **no shadow on anything at rest** (one float shadow for sheets, menus,
toasts) · the lit niche stays light in both themes · film grain over every
screen · control heights **44 / 36 / 32** · `scale(0.97)` on press · rise 12px
+ fade, 55ms stagger capped at 8 · three easing curves · tracked uppercase
Archivo label over a Bodoni line · tabular figures · British voice, no emoji.

## 2. What must change, and the rule

| | Web | Native |
|---|---|---|
| Tokens | CSS custom properties | `tokens/native.ts` (plain objects) |
| Units | rem / % / viewport | **dp/pt numbers only**; no percentage type |
| Gutter | 16 → 24 at 640 | **20**, flat |
| Space scale | 4…64 | 4, 8, 12, 16, 20, 24, 32, 40, 48 |
| Body text | 15px | **16pt** (the platform floor for reading) |
| Hover | lifts text, tints borders | **does not exist** — press and haptics do that work |
| Focus ring | 2px brass outline | screen-reader focus + `accessibilityState` |
| Nav | header with four rooms | **bottom tab bar**, five tabs |
| Modal | centred 512px box | **native `formSheet`**, content-height detents |
| Overflow menu | `···` + floating menu | **long-press (320ms) context menu** |
| Scroll | page scroll | `FlashList`, cache-first, `RefreshControl` tinted brass |
| Grid | 2 → 3 → 5 → 6 columns | **2 columns**, tile `(width − gutter·2 − 12) / 2` |
| Grain | `body::before` SVG noise | `assets/grain.png`, same opacity/blend |

## 3. Touch, and the Android floor

Visuals stay 44 / 36 / 32 — but **the touch area is never smaller than 48 × 48
on Android** (`MIN_TOUCH.android`). Where the visual is smaller, add `hitSlop`;
do not enlarge the control. `pressRetentionOffset={12}` on every pressable.

This is the one place the systems genuinely differ: a 32pt filter token is
legal on the web and on iOS, and illegal on Android without hit-slop.

## 4. Type on a phone

The native ladder (`type` in `tokens/native.ts`):

| Role | Size / leading | Face |
|---|---|---|
| display | 44 / 54, tracking −0.5 | Bodoni **500** |
| h1 | 32 / 40 | Bodoni 500 |
| h2 | 24 / 30 | Bodoni 500 |
| h3 | 20 / 26 | Bodoni 500 |
| lede | 18 / 26 | Bodoni 400 *italic* |
| body | 16 / 24 | Archivo 400 |
| bodySm | 14 / 20 | Archivo 400 |
| caption | 12 / 16 | Archivo 400 |
| label | 11 / 14, .18em, upper | Archivo 600 |
| micro | 10 / 12, .16em, upper | Archivo 600 |
| stat / statSm | 30 / 38 · 22 / 28, tabular | Bodoni 500 |
| wordmark | 22 / 28, kerned | Playfair 400 |

Serif roles keep **≥ 1.2× leading**: native `Text` clips anything above the
line box, and Bodoni's ascenders and figures stand tall.

**Dynamic Type:** UI and body roles scale to 200%. Display roles cap at
**1.3×** — a 44pt Bodoni line at 2× pushes a room's header off screen. Never a
fixed height on a text container; measure and wrap.

Fonts ship as real TTFs (`@expo-google-fonts/*`), loaded at boot — unlike the
web, which links the hosted stylesheet.

## 5. Navigation and structure

The four rooms become a **bottom tab bar** (Today · Closet · Mirror · Circle ·
You), each tab its own native stack. The web's light-cord theme toggle lives in
*You*, not in the tab bar.

- Secondary flows are **sheets** (`formSheet` routes): an `h2` title, the
  content, the primary `Button` at the bottom.
- Destructive confirmations are sheets too — never a system alert for anything
  with copy worth writing. A native `Alert` is only for a one-line permission
  nudge.
- Deep-linkable: params come from the URL, never from navigation state.
- A screen's main verb lives in a persistent **ActionBar** at the bottom, with
  one brass primary. Pad the scroll view by its height.

## 6. Motion and haptics

Reanimated only, UI thread only, transform and opacity only — nothing animates
layout, nothing runs per frame on JS. `rise(i)` for entering containers, never
on virtualised rows; `fadeIn/fadeOut` for swaps inside a container;
`spring.sheet` / `spring.snap` fed the gesture's velocity for anything a finger
drags. Reduced motion is respected by every helper.

**Haptics** are the native addition to the vocabulary: `select()` for detents
and choices, `tap()` for reactions and toggles, `success()` / `failure()` for
outcomes, `thud()` for a fired destructive action. One per user action, in the
same frame as the visual, **never the only feedback**.

## 7. Platform divergence: the Android question

Android's material conventions expect elevation on cards and a ripple on press.
ZAUQ bans both. **The brand wins:** no resting elevation, no ripple — press is
`scale(0.97)` plus a haptic, on both platforms. What we *do* adopt from Android
is the touch floor (48dp), the system back gesture, and the adaptive icon.

Written out, so nobody re-litigates it per screen:

| Android convention | ZAUQ |
|---|---|
| Card elevation | **No** — hairline border, `--surface-raised` fill |
| Ripple | **No** — `scale(0.97)` + `tap()` |
| FAB | **No** — the ActionBar's brass primary |
| Material shapes / pills | **No** — 3px, and the arch |
| 48dp touch floor | **Yes** |
| Back gesture / hardware back | **Yes** — every screen pops predictably |
| Adaptive icon (fore/back/mono) | **Yes** — see below |
| Dynamic colour (Material You) | **No** — the palette is the brand |

## 8. Icons, splash, adaptive icon

From the delivered identity (`guidelines/brand-guidelines.md` §3):

- **App icon, both stores:** the **English** icon — arch + ZAUQ + gold rule
  (`assets/brand/official/zauq-icon-en-dark.png`), 1024 master.
- **Android adaptive:** gold arch foreground on an ink background, plus a
  monochrome layer; keep the mark inside the safe zone (≈0.42 of the canvas).
- **Splash:** the ceremonial lockup on ink, 200px and up only.
- **Notification / small:** the **solid** arch — outlines grey out when
  downsampled.

## 9. Definition of done for a mobile screen

1. Cache-first: renders last data at once, revalidates behind it, and handles
   `LoadError` and an empty state with one action.
2. One brass primary, in the ActionBar when the screen has a main verb.
3. Every touch target ≥ 44pt visual, ≥ 48dp effective on Android.
4. Nothing clips at 200% Dynamic Type.
5. Icon-only controls have `accessibilityLabel`; selected states use
   `accessibilityState`.
6. Brass on bone is for large text and rules — **never body copy** (it does not
   pass contrast at small sizes).
7. One haptic per action, in the same frame as the visual.
8. Works with the keyboard up; safe-area insets respected top and bottom.
9. Both themes checked, including anything drawn inside a niche.
