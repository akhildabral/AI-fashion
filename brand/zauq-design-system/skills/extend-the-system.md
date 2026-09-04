# Extend the ZAUQ system

For changing the system itself — adding a token, a component, a screen, or
correcting a value. The bar is high on purpose: this file is the baseline other
work is measured against.

## Before adding anything

Ask, in this order:

1. **Does a word do it?** ZAUQ labels things rather than drawing them.
2. **Does an existing primitive do it?** 30 exports already cover the product.
3. **Is this a variant, not a component?** Prefer a prop on an existing part
   over a new part.
4. **Does the real product do this?** If no surface expresses the pattern, it
   does not belong here. Inventions get trusted by consumers and recognised by
   nobody.

Anything that survives all four gets built — and listed in `readme.md` under
**Intentional additions** with a one-line reason.

## Adding a token

- Base values and semantic aliases both: `--c-*` channels (space-separated RGB
  so alpha composes), then a `--text-*` / `--surface-*` / `--border-*` /
  `--fill-*` alias that product code actually uses.
- Colour goes in `tokens/colors.css` **twice** — light `:root` and `.dark`.
  Check the niche: it stays light in both themes, so anything drawn inside one
  uses `--text-in-niche*`.
- Layout, breakpoints, measures, ratios → `tokens/layout.css`.
- New files must be `@import`ed from `styles.css`, which stays imports-only.
- Annotate anything a machine can't classify with `/* @kind color|spacing|
  radius|shadow|font|other */`.

## Adding a component

One directory, four files:

```
components/<group>/<Name>.jsx        export function <Name>(props) {…}
components/<group>/<Name>.d.ts       the props contract
components/<group>/<Name>.prompt.md  one-line what & when, a JSX example, variants
components/<group>/<group>.card.html <!-- @dsCard group="Components" … --> on line 1
```

**Only exports whose name starts with a capital letter reach the bundle**, so a
lowercase helper (a hook like `useFlash`) is reachable by sibling components
and by the UI kits' raw-JSX loader, but **not** from an `@dsCard` HTML that
reads `window.<Namespace>`. In a card, hold that state in `React.useState`
instead — destructuring a lowercase name off the namespace binds `undefined`
and the throw blanks the whole card.

React only — no npm packages, no CSS-in-JS, no stylesheet. Style with the
custom properties, inline. Give it `className` and `style` passthrough, and put
`zq-press` on anything tappable.

## Adding a screen or a template

A screen goes in `ui_kits/<product>/` as JSX composed **from the primitives** —
never a re-implementation of `Button` inside a kit. A reusable starting point
goes in `templates/<slug>/` as a `.dc.html` with
`<!-- @template name="…" description="…" -->` on line 1 and
`<helmet><script src="./ds-base.js"></script></helmet>`.

## Correcting a value

The system may correct the app — that is its job. When you do:

1. Change the token or component here.
2. Add a row to `readme.md` §4b with: what the app does, what is correct, and
   which file to change.
3. Sweep the kits, cards and templates for the old literal (grep the number).
4. Say so in the card's subtitle if the correction is visible, e.g. "corrected:
   the crown is a semicircle".

## Never

- A second accent colour, a shadow on a resting surface, a pill or a circle, an
  icon library, an emoji, a gradient background, a third typeface.
- An arch wider than 1:1, or a second arch formula.
- A magic number: if it isn't a token, add the token.
- Writing `_ds_bundle.js`, `_ds_manifest.json` or `_adherence.oxlintrc.json` —
  those are generated.
