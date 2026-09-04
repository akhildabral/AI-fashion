# ZAUQ mobile UI kit

The four rooms as they are on a phone: **390 x 844** (iPhone 14/15 logical
size), the platform tab bar, and the thumb-zone ActionBar. Recreated from the
shipping Expo app (`mobile/app/(tabs)`, `mobile/src/components`,
`mobile/src/features`) and `mobile/CONVENTIONS.md`.

## What it demonstrates

- **The native type ladder**, not the web one: display 44/54, h1 32/40,
  h2 24/30, h3 20/26, lede 18/26 italic, body 16/24, label 11 (.18em), micro 10
  (.16em), stat 30/38 tabular. Serif roles keep >= 1.2x leading.
- **Gutter 20**, flat — not the web's 16 -> 24 step.
- **Two columns** of arches on every board, tile width `(390 - 40 - 12) / 2`.
- **The tab bar**: five rooms, brass tint on the active one, 48px targets.
  The real app uses SF Symbols on iOS and MaterialIcons on Android via
  `NativeTabs`; this recreation loads **Material Symbols** from Google's CDN,
  which is the Android set exactly.
- **The ActionBar**: one brass primary per screen, above the tab bar, never
  scrolling away. Bodies pad by `ACTION_BAR_HEIGHT` (72 + 62).
- **Landscape pictures are rectangles** (the Circle feed), arches are portrait.
- **The Mirror at 2/3** in a `MirrorFrame` — a standing figure.
- Film grain inside the device frame, not on the page.

## Files

| File | What |
|---|---|
| `PhoneFrame.jsx` | the 390x844 viewport, safe areas, status bar |
| `MobileFurniture.jsx` | `RoomHeader`, `RoomBody`, `ActionBar`, `TabBar`, `MobileSectionHead`, `nativeType` |
| `TodayMobile.jsx` | the brief, the week strip, why-this, the evening act |
| `ClosetMobile.jsx` | lenses, filters, the board, the ledger plaque |
| `MirrorMobile.jsx` | the render, the rail, developing state |
| `CircleMobile.jsx` | the feed: a look, a verdict poll, a friend's pick |

## Not recreated

*You* (ritual settings, journal, trips, billing), Fitting, the door/auth flow
and the sheets. They compose from the same primitives — ask if you want them.

## Reading this alongside the code

`guidelines/mobile-platform.md` is the rule set (what carries over, what must
change, the Android divergence table, Dynamic Type policy, haptics).
`tokens/native.ts` is the token export to drop into the app.
