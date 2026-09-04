---
name: zauq-design
description: Use this skill to generate well-branded interfaces and assets for ZAUQ (an AI personal stylist for the clothes you already own), either for production or throwaway prototypes/mocks/ads/decks. Contains the design baseline — colours, type, spacing, layout, proportion, motion, fonts, brand assets, reusable components and UI kits.
user-invocable: true
---

Read `readme.md` first — it is the baseline: philosophy, content fundamentals,
visual foundations, layout and responsiveness, proportion and ratio, spacing
and padding, brand, iconography, plus **§4b "Corrections to the app as built"**
(where the shipping app disagrees with this system, this system is right).

Then pick the recipe for what you are making:

| Making | Read |
|---|---|
| A web app screen, a room, a flow | `skills/build-an-app-screen.md` |
| An iOS or Android screen | `skills/build-a-mobile-screen.md` + `guidelines/mobile-platform.md` + `tokens/native.ts` |
| An ad, poster, social, email, deck, cover | `skills/build-brand-material.md` + `guidelines/brand-guidelines.md` |
| A change to the system itself | `skills/extend-the-system.md` |

Files worth knowing:

- `styles.css` — the single entry point; link it and every token is available.
- `tokens/` — colours, typography, spacing, **layout** (breakpoints, measures,
  column ladders, ratios), shape (the arch geometry), motion, elevation, base,
  patterns (`zq-` utility classes for static HTML: arch, plaque, tape, press,
  rise, grain).
- `components/` — the reusable primitives, grouped; each has a `.d.ts` props
  contract and a `.prompt.md` with a usage example.
- `ui_kits/app/` and `ui_kits/marketing/` — high-fidelity recreations of the
  real product surfaces. Copy their structure; do not reinvent it.
- `templates/` — starting templates (Today brief, Landing hero).
- `tokens/native.ts` — the same system as plain objects for React Native.
- `ui_kits/mobile/` — the rooms at 390x844 with the native type ladder.
- `guidelines/` — foundation specimen cards (open them in a browser) plus the
  prose guides: `brand-guidelines.md`, `component-inventory.md` (every
  component's variants, sizes and when to use which), `motion-and-loading.md`
  (animations, interaction states, skeletons), `asset-index.md` (which logo
  file for which job), `mobile-platform.md`.
- `assets/brand/`, `assets/imagery/` — the mark, wordmarks, icons, photography.

If creating visual artifacts (slides, mocks, ads, throwaway prototypes), copy
the assets out and write static HTML that links `styles.css`. If working on
production code, copy the values and read the rules here to become an expert in
designing with this brand.

If the user invokes this skill without other guidance, ask what they want to
build, ask a few sharp questions, and act as an expert designer who outputs
HTML artifacts *or* production code depending on the need.

**The one rule that catches most mistakes:** if you are reaching for a shadow,
a second accent colour, a rounded pill, an icon set or an emoji, the answer in
ZAUQ is a hairline, brass, a 3px rectangle, or a word.
