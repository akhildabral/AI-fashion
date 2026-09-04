A figure with its name under it — ritual stats, wear counts, closet totals.

```jsx
<div style={{ display: 'flex', gap: 'var(--space-8)' }}>
  <Stat value="43" label="Pieces" />
  <Stat value="128" label="Wears logged" />
  <Stat value="9" label="Day streak" accent />
</div>
```

Always tabular numerals so a row of figures does not jitter as it updates. Use `accent` on at most one stat in a row.
