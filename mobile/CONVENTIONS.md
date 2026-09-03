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
| Room header / action bar | `RoomHeader`, `ActionBar` (+ `ACTION_BAR_HEIGHT` padding on the scroll view) from `Room.tsx` |
| Actions | `Button` variants primary (brass, one per screen), ghost, quiet, danger, icon; `size="sm"` for rows |
| Garment in an arch | `GarmentTile` (label, sublabel, badge, selected, processing, photo, sweep) |
| Any arch | `Arch` (variant niche / photo / mirror / plain) |
| A look on its board | `LookBoard` / `FlatLay` |
| The week | `WeekStrip` |
| Lenses / filters / options | `Tabs`, `Filter`, `Chip` from `Tabs.tsx` |
| Inputs | `Field` (label, error, helper, password, compact) |
| Small furniture | `SectionHead`, `Stat`, `Plaque`, `Hairline`, `LoadError`, `EmptyState` from `Bits.tsx` |
| Loading | `SkeletonBlock`, `ArchSkeleton` |
| Notice | `useFlash()('Wear logged.')` |
| Brand | `Wordmark`, `ArchMark` |

Tokens: `const { t } = useTheme()` then `t.ink`, `t.brass`, `alpha(t.ink, 0.45)`
for washes; `space`, `gutter`, `radius` (3), `height` (44 / 36 / 32),
`hairline`, `shadowFloat` from `@/src/design/tokens`. No other radii, no
resting shadows, no colours outside the palette, brass only for the action
or the "here" marker.

Lists of garments: `FlashList` from `@shopify/flash-list`, two columns, tile
width `(screenWidth - gutter * 2 - 12) / 2`.

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

Touch targets 44pt (use `hitSlop` when the visual is smaller).
`pressRetentionOffset={12}` on pressables. Long-press (320ms) opens a
contextual menu on tiles and cards.

## Sheets

Secondary flows are `formSheet` routes under `app/sheets/`, opened with
`router.push('/sheets/<name>?...')`. A sheet has a `T role="h2"` title, its
content, and its primary `Button` at the bottom. Destructive confirmations
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
- One brass primary, in the `ActionBar` when the screen has a main verb.
- Works with the keyboard up (`KeyboardAwareScrollView` from `react-native-keyboard-controller` on forms).
- `npx tsc --noEmit` and `npx eslint .` clean in `mobile/`.
- Deep-linkable: params come from the URL, never from navigation state alone.
