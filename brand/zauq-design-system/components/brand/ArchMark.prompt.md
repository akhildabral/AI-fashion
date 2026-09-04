The arch mark — for app icons, avatars, splash screens and anywhere the brand signs without words.

```jsx
<ArchMark variant="script" size={64} ink="var(--brand-cream)" />
<ArchMark variant="solid" size={16} />
```

Pick by size, not by taste: `script` at 48px and up, `mirror` when the frame should read empty, `solid` below 32px. An outlined arch at favicon size greys out into a smudge — that is why `solid` exists.
