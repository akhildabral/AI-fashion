A square bordered control for a single glyph — overflow menus, close, small steppers.

```jsx
<IconButton label="More options" />
<IconButton label="Close">
  <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
</IconButton>
```

`label` is mandatory — the glyph carries no text. ZAUQ has no icon library, so pass a hand-drawn 1.5px-stroke SVG or a typographic glyph.
