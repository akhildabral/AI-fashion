# UI kit — the marketing site

A recreation of `frontend/src/pages/LandingPage.tsx` — the front door.

Open `index.html`.

| File | Surface |
|---|---|
| `LandingScreen.jsx` | The whole page: hero, five rooms, the invite-only steps, the footer |
| `Doors.jsx` | The two doors — the waitlist form and the invite-code form |
| `BeforeAfter.jsx` | The draggable seam over an arched photograph |

**Structure:** an eyebrow, a Bodoni line with one italic brass phrase, one
supporting sentence, and a photograph — repeated five times for the morning,
the mirror, the ledger, the store and the circle, each separated by a hairline
rather than a background change.

**Interactions:** the waitlist form submits to a local success state, the
invite-code field expands, and the before/after seam drags.

**Note on copy:** this kit carries the product's own waitlist and invite-only
language, because that is what the codebase says. The ad creatives elsewhere in
this project deliberately drop it in favour of *Sign up* / *Learn more* — if
the site follows, update `Doors.jsx` and the "How it gets in" section.
