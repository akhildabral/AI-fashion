The container every screen sits in, plus the section head that divides it.

```jsx
<PageShell>
  <SectionHead title="Sitting idle" action={<Button variant="quiet" size="sm">See all</Button>} />
  {/* … */}
</PageShell>
```

Three widths only. Auth, legal and prose use `narrow`; the closet board and header use `wide`; everything else takes the default.
