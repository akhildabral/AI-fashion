Transient confirmation, identical on every screen.

```jsx
const { toast, flash } = useFlash()
// …
flash('Logged. That’s nine days running.')
return <><Toast msg={toast} /></>
```

Four seconds, bottom centre, one at a time. For a destructive action use `UndoBar` instead — ZAUQ defers deletes rather than confirming them.
