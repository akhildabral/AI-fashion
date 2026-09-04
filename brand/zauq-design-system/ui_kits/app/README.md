# UI kit — the ZAUQ app

A click-through recreation of the signed-in app, built from
`frontend/src/pages/{TodayPage,ClosetPage,MirrorPage,CirclePage}.tsx`,
`frontend/src/components/{Header,WeekStrip,CircleCards,ui}.tsx` and the
`index.css` component layer.

Open `index.html`. The four rooms switch in the header; the **pull cord** to
the left of the bell toggles atelier-by-night and gallery-by-day.

| File | Surface |
|---|---|
| `AppHeader.jsx` | The sticky header: wordmark, four rooms on a hairline, light cord, bell, account menu |
| `WeekStrip.jsx` | The week as a timeline — seven days on one hairline, today underlined in brass |
| `TodayScreen.jsx` | The brief: four garment niches, why-this panel, wear/another/not-today, the evening act, the reconsider modal |
| `ClosetScreen.jsx` | The board: collections tabs, category filters, search, the ROI plaque, gap suggestions |
| `MirrorScreen.jsx` | The fitting room: the glass in the centre; the lens tabs, the rail of pieces (each a switch, each with Swap), the render meter, and the decision row |
| `CircleScreen.jsx` | The salon: the today rail, one Post-to-your-circle door, four lenses (For you / Following / Explore / Saved), and one ranked column of look, verdict and pick cards |

**What is faked:** all data is local constants; uploads, renders and votes are
`setTimeout`. Real behaviour (async matting, the rules validator, job polling
for `status: ready`) lives in the codebase, not here.

**Deliberately not recreated**, and marked as such in the UI rather than
invented: the Mirror's **Inspiration lens** (`InspirationLens.tsx`), its
photo-door and lookbook modals (`PhotoManager.tsx`), compare mode, and the
Circle's **people drawer** and compose sheets (`PeopleDrawer.tsx`,
`InviteSheet.tsx`, `StyleFriendModal.tsx`, `ComposeModals.tsx`). Their entry
points are present; the surfaces behind them are not.

**Interactions that do work:** room switching, theme toggle, day selection,
collection tabs, category filters, closet search, the reconsider modal; in the
Mirror — lens tabs, rail switches, adding and clearing the rail, the render
sequence with its rotating atelier lines, the before/after tape, and the
decision row; in the Circle — the today rail, the post menu, the four lenses,
the Explore occasion filters, verdict voting with its tally bars, save and
react on a look, and taking a pick to the rail. Plus every overflow menu and
every toast.
