The brand's signature container. Anything that is a garment, a render or a reflection goes in one.

```jsx
<Arch aspect="5/6">
  <img src={url} alt="Camel blazer" style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '7%' }} />
</Arch>

<Arch aspect="3/4" photo>
  <img src={photo} alt="" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
</Arch>
```

Cut-out garments sit `object-fit: contain` with 7% padding so the vitnette melts their white edges into the niche. Photographs use `photo` + `object-fit: cover`. Never put a plain rectangle where an arch belongs, and never use an arch for text.

## The niche is light in both themes

`--c-niche` is a near-white lit vitrine at night as well as by day — that is
the point of it. So **`--c-ink` and every `--text-*` alias invert underneath
an arch and must not be used inside one.** Cream-on-cream at 1.05:1 is the
failure this catches.

Anything drawn inside a niche takes theme-invariant dark ink:

```jsx
{/* wrong: disappears in the dark theme */}
<Arch aspect="5/6"><span style={{ color: 'rgb(var(--c-ink) / 0.45)' }}>+</span></Arch>

{/* right */}
<Arch aspect="5/6"><span style={{ color: 'var(--text-in-niche-muted)' }}>+</span></Arch>
```

- `--text-in-niche` (`#1A1509`) for a label or glyph
- `--text-in-niche-muted` for a secondary one
- `--brand-ink` or `--c-on-brass` are equivalent safe choices

This applies to the empty-state `+`, any overlay caption, and any placeholder
letterform. It does **not** apply to a label *under* the arch — that sits on
the page ground and themes normally. And it does not apply to `photo` arches,
whose fill is `--surface-raised` and therefore themes with everything else.
