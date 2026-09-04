Every garment in the closet, the brief and the packing capsule is one of these.

```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-4)' }}>
  {items.map((it, i) => (
    <GarmentTile key={it.id} imageUrl={it.url} label={it.subtype} sublabel="AED 62 / wear"
      className="zq-rise-stagger" style={{ '--i': i }} onClick={() => open(it)} />
  ))}
</div>
```

Default aspect is 5/6 — gently tall, which garments between 0.7 and 1.1 fill well while `contain` keeps their true proportions. Stagger a grid with `.zq-rise-stagger` and `--i`.
