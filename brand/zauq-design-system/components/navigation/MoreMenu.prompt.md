The overflow menu — every secondary action that does not earn a button.

```jsx
<MoreMenu align="right">
  <MenuItem onClick={share}>Share this look</MenuItem>
  <MenuItem onClick={pack}>Add to a trip</MenuItem>
  <MenuItem danger onClick={remove}>Let it go</MenuItem>
</MoreMenu>
```

The panel is one of the four things in ZAUQ allowed a shadow (`--shadow-float`), because it genuinely floats. It scales up from the trigger's corner — set `align` and `up` to match where the trigger sits.
