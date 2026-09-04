Switches between views of the same thing — closet collections, journal ranges, profile sections.

```jsx
<Tabs
  label="Collections"
  value={tab}
  onChange={setTab}
  items={[{ key: 'all', label: 'Everything', count: 43 }, { key: 'worn', label: 'Most worn' }]}
/>
```

Nothing is boxed: the tabs sit on the header's own hairline and only the active one gets the 2px brass rule. If the choice narrows a set rather than switching views, use `Filter`.
