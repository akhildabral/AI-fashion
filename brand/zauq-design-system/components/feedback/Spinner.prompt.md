The waiting and failure states.

```jsx
{loading ? <ArchSkeleton count={8} /> : error ? <LoadError onRetry={reload} /> : <Grid />}
<Button variant="primary">{busy ? <Spinner /> : 'Join'}</Button>
```

Loading a grid always uses `ArchSkeleton`, never a centred spinner — the shape of what is coming should already be on screen. `Spinner` is only for inside a button.
