# ZAUQ mobile: conventions

Read this before touching a screen. It is short on purpose; the design
system and the web app are the spec, this is how they are applied here.

## What this app is

The ZAUQ web app (`frontend/`), rebuilt for a phone. Same backend, same
brand (the Atelier: brass / ink / bone, Bodoni Moda + Archivo, the arch as
the one curved form), same voice. Not a port of desktop layouts: every screen
is designed for a thumb and a camera. The plan lives in
`~/.claude/plans/zesty-tinkering-parnas.md` (sections 3, 4 and 5 are the
design brief per room).

## Layout of the code

```
app/                    Expo Router routes only (thin: read params, compose feature components)
  (door)/               signed-out screens
  (fitting)/            onboarding
  (tabs)/<room>/        today | closet | mirror | circle | you, each a native stack
  u/[handle].tsx        someone's public room (pushed from anywhere)
  reveal/[id].tsx       full-screen render reveal (fade)
  sheets/<name>.tsx     formSheet screens (see Sheets)
src/design/             tokens, type, motion, haptics, theme
src/components/         the primitives (below)
src/features/<room>/    the room's components, hooks and helpers
src/context/            AuthProvider, ProfileProvider, JobsProvider
src/lib/                api, session, query (keys), upload, sso, config
```

Import with `@/` from the app root (`@/src/components/Button`). API modules
and types come from the shared package by path: `@zauq/shared/brief`,
`@zauq/shared/wardrobe`, `@zauq/shared/types` and so on; the same functions
the web uses. Never call `fetch` yourself; `apiFetch` / `apiUpload` from
`@/src/lib/api` (they carry the session and renew it).

## Data

TanStack Query, always. `useQuery({ queryKey: qk.x, queryFn })` with keys
from `@/src/lib/query` (add a key there if a new one is needed). Mutations
through `useMutation` with optimistic updates for reactions, saves, wears,
and `invalidateQueries` on the keys touched. The cache persists to disk, so a
screen renders its last data at once and revalidates behind it: never block
on a spinner when cached data exists. Pull to refresh is `RefreshControl`
with `tintColor={t.brass}`.

Uploads go through `useJobs().enqueueUploads(images)` after `pickImages()`
from `@/src/lib/upload`. Renders go through `useJobs().trackRender()`.

## Primitives (use these, do not restyle them)

| Need | Component |
| --- | --- |
| Page container | `Screen` (`edges`, `padded`, `plain`); rooms use `edges={['top']}` and draw their own header |
| Text | `T` with `role` (display, h1, h2, h3, lede, body, bodySm, caption, label, micro, stat) and `tone` (ink, muted, faint, brass, onBrass, danger, success) |
| Room header / action row | `RoomHeader` (`right` is the header aside) and `ActionRow` from `Room.tsx`; `useBottomReserve()` for the scroll view's bottom padding |
| Actions | `Button` variants primary (brass, one per screen), ghost, quiet, danger, icon; `size="sm"` for rows |
| Garment in an arch | `GarmentTile` (label, sublabel, badge, selected, processing, photo, sweep) |
| Any arch | `Arch` (variant niche / photo / mirror / plain) |
| A look on its board | `LookBoard` / `FlatLay` |
| The week | `WeekStrip` |
| Lenses / filters / options | `Tabs`, `Filter`, `Chip` from `Tabs.tsx` |
| Inputs | `Field` (label, error, helper, password, compact) |
| Anything tappable that isn't a `Button` | `Press` (0.97 in 150ms, `haptic`, `visual` for the hit slop, `wrapStyle` for the animated wrapper); `usePressScale()` for a hand-rolled pressable |
| A sheet's frame | `SheetShell` from `Sheet.tsx` (`title`, `emphasis`, `lead`, `footer`, `busy`; `dense` for rows 16 apart) |
| A surface | `Card` from `Bits.tsx` (padding 16, 20 for a feature card; `onLongPress` is the 320ms context menu) |
| Inline message | `Alert` from `Bits.tsx` (error / warning / success, a wash, no border, no icon) |
| A count or a state | `Badge` from `Bits.tsx` (brass or quiet; never a button) |
| Small furniture | `SectionHead`, `Stat`, `Plaque`, `Hairline`, `LoadError`, `EmptyState` from `Bits.tsx` |
| Context menu | `MenuSheet` (+ `MoreButton` for a room header) from `MenuSheet.tsx`; opened from a long press on a tile or a card |
| Deferred delete | `UndoBar` (the message, an Undo, above the tab bar); `useUndoDelete` from `features/closet/UndoBar` |
| Consent | `Check` (the one ticked box; a value is a `Chip`) |
| The Mirror's frame | `MirrorFrame` from `Arch.tsx` (the Mirror hero only) |
| Glyphs | `MoreGlyph`, `PlusGlyph`, `BellGlyph`, `ChevronGlyph`, `CheckGlyph`, `CrossGlyph` from `Glyphs.tsx`: 16 grid, 1.5px stroke, no fill, `color` |
| Loading | `SkeletonBlock`, `ArchSkeleton` |
| Notice | `useFlash()('Wear logged.')` |
| Brand | `Wordmark` (26 cap height on a door: the 88px floor), `ArchMark` |

Tokens: `const { t } = useTheme()` then `t.ink`, `t.brass`, `alpha(t.ink, 0.45)`
for washes; `space`, `gutter`, `radius` (3), `height` (44 / 36 / 32),
`hairline`, `shadowFloat` from `@/src/design/tokens`. No other radii, no
resting shadows, no colours outside the palette, brass only for the action
or the "here" marker.

Lists of garments: `FlashList` from `@shopify/flash-list`, two columns, tile
width `(screenWidth - gutter * 2 - 12) / 2`.

## Actions on a page

The owner's rule: **no floating action bars on pages.** Nothing is pinned
above the tab bar with content scrolling under it. A screen's actions sit
inline, in the page flow, directly under the thing they act on, the way the
web lays them out:

- `ActionRow` from `Room.tsx`: a hairline, 16 to the 44-tall controls, 12
  between them, a block (32) above by default (`top` when the parent's gap
  already supplies some of it; `plain` on a surface that rules itself). One
  brass primary per row, `ghost` for the alternative, `quiet` for the escape.
- Where it goes: under the act the clock is on (Today, a day), under the rail
  (Mirror), under the board (Compose), under the hero (a piece), under the
  frame or at the end of the form it completes (the store, a new trip, a
  trip's capsule), under the plaque it acts on (the basket).
- A room-level verb with no subject on the page (Add pieces, Style by hand,
  Point at a piece, Log a day, Plan a trip) is a 36 control in the header
  aside: `RoomHeader`'s `right`.
- Scroll views end at the tab bar with the safe inset: `paddingBottom:
  useBottomReserve()`. Anything that floats (Toast, UndoBar, JobTray, the
  Today `MoreMenu`) anchors to the tab bar or the control that opened it,
  never to a bar.
- Sheets are the exception: `SheetShell`'s `footer` stays pinned with the
  primary. That is a bottom sheet's own shape.

## Motion and touch

From `@/src/design/motion`: `rise(i)` for entering containers (never on
list rows), `fadeIn`/`fadeOut` for swaps, `spring.sheet` / `spring.snap`
with the gesture velocity for anything a finger drags, `timing.press` for
press feedback. Reanimated only (`useSharedValue`, `.get()` / `.set()`),
gesture-handler only (`Gesture.Pan()`), nothing per-frame on the JS thread.
Transform and opacity only. Reduced motion is respected by every helper.

Haptics from `@/src/design/haptics`: `select()` for detents and choices,
`tap()` for reactions and toggles, `success()` / `failure()` for outcomes.
One per user action, same frame as the visual, never alone.

Touch targets 44pt on iOS and 48dp on Android: visuals stay 44 / 36 / 32 and
`hitSlopFor(visual)` from `@/src/design/tokens` makes up the difference to 48:
`visual={n}` on a `Press`, `hitSlop={hitSlopFor(n)}` on a bare `Pressable`.
`pressRetentionOffset={12}` on pressables (`Press` sets it). Long-press (320ms) opens a
contextual menu on tiles and cards.

## Sheets

Secondary flows are `formSheet` routes under `app/sheets/`, opened with
`router.push('/sheets/<name>?...')`. A sheet has a `T role="h2"` title, its
content, and its primary `Button` in the pinned footer (`SheetShell`'s
`footer`), which does not scroll. Destructive confirmations
are sheets too (never `Alert.alert` for anything that has copy worth
writing). Native `Alert` is fine for a one-line permission nudge.

## Copy

The web's voice, verbatim where the web already has the line: "Wearing it",
"developing", "Let go", "Ask the circle", "Style a friend", "Reconsider".
Rooms, not pages. The web says "See it on you" where it addresses the member
about a laid-out look (Today, the day view, the Circle pages) and "See it on
me" where the member speaks (the Mirror, a piece, an outfit, compose, the
cards); each screen keeps its own page's phrasing. No em dashes: use a comma, a colon, or a
full stop. Active-voice controls that say what happens. Errors say what to
do next. Numbers set in Bodoni (`role="stat"`), money through `money()`
from `@zauq/shared/money`, temperatures through `temp()` from
`@zauq/shared/units`.

## Accessibility

Every icon-only control has `accessibilityLabel`. Selected states use
`accessibilityState`. Nothing clips at 200% Dynamic Type (measure, wrap,
never fixed heights on text). Contrast: ink on bone always passes; brass on
bone is for large text and rules, not body copy.

## Definition of done for a screen

- Reads its data from the cache first, revalidates, handles `LoadError` and the empty state (an `EmptyState` with the one action).
- One brass primary, in an inline `ActionRow` under its subject (or the header aside) when the screen has a main verb; never a floating bar.
- Works with the keyboard up (`KeyboardAwareScrollView` from `react-native-keyboard-controller` on forms).
- `npx tsc --noEmit` and `npx eslint .` clean in `mobile/`.
- Deep-linkable: params come from the URL, never from navigation state alone.
