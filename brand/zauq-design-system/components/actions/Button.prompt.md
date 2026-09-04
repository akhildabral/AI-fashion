The action. Every button in ZAUQ is this component; the variant carries the weight, not the size.

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
  <Button variant="primary">Wear it</Button>
  <Button variant="ghost">Show me another</Button>
  <Button variant="quiet">Not today</Button>
</div>
```

One brass fill per row, at most one ghost beside it, and the destructive action pushed right. Radius is 3px and never changes. Press feedback (scale 0.97) is built in.
