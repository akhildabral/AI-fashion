import React from 'react'
import { PageShell, SectionHead } from '../../components/surfaces/PageShell.jsx'
import { GarmentTile } from '../../components/data/GarmentTile.jsx'
import { Tabs } from '../../components/navigation/Tabs.jsx'
import { Filter } from '../../components/navigation/Filter.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Field } from '../../components/forms/Field.jsx'
import { Plaque } from '../../components/surfaces/Plaque.jsx'
import { Badge } from '../../components/feedback/Badge.jsx'
import { Card } from '../../components/surfaces/Card.jsx'
import { ArchSkeleton } from '../../components/feedback/Spinner.jsx'

const IMG_CLOSET = '../../assets/imagery'

const ITEMS = [
  { id: 1, img: 'blazer', label: 'Camel blazer', sub: 'AED 62 / wear', cat: 'outer', coll: 'most-worn' },
  { id: 2, img: 'tank', label: 'Silk tank', sub: '11 wears', cat: 'top', coll: 'most-worn' },
  { id: 3, img: 'trousers', label: 'Wide trousers', sub: 'AED 40 / wear', cat: 'bottom', coll: 'most-worn' },
  { id: 4, img: 'pumps', label: 'Black pumps', sub: 'New this month', cat: 'footwear', coll: 'new' },
  { id: 5, img: 'bag', label: 'Structured bag', sub: 'Not worn yet', cat: 'accessory', coll: 'never-worn' },
  { id: 6, img: 'blazer', label: 'Navy blazer', sub: 'Possible twin', cat: 'outer', coll: 'twins' },
  { id: 7, img: 'tank', label: 'Cotton tank', sub: 'Idle 94 days', cat: 'top', coll: 'orphans' },
  { id: 8, img: 'trousers', label: 'Linen trousers', sub: 'Idle 120 days', cat: 'bottom', coll: 'orphans' },
  { id: 9, img: 'pumps', label: 'Suede flats', sub: '4 wears', cat: 'footwear', coll: null },
  { id: 10, img: 'bag', label: 'Woven tote', sub: '7 wears', cat: 'accessory', coll: null },
]

const COLLECTIONS = [
  { key: 'all', label: 'Everything', count: 43 },
  { key: 'most-worn', label: 'Most worn' },
  { key: 'never-worn', label: 'Never worn', count: 12 },
  { key: 'orphans', label: 'Sitting idle', count: 8 },
  { key: 'new', label: 'New this month' },
  { key: 'twins', label: 'Possible twins', count: 3 },
]

const CATS = [['top', 'Tops', 12], ['bottom', 'Bottoms', 9], ['outer', 'Outerwear', 6], ['footwear', 'Shoes', 8], ['accessory', 'Accessories', 8]]

/** The Closet: the whole wardrobe as a board of arched niches, and what it's worth. */
export function ClosetScreen({ onFlash }) {
  const [coll, setColl] = React.useState('all')
  const [cats, setCats] = React.useState([])
  const [q, setQ] = React.useState('')
  const [uploading, setUploading] = React.useState(false)

  const toggle = (k) => setCats((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))
  const shown = ITEMS.filter((it) =>
    (coll === 'all' || it.coll === coll) &&
    (cats.length === 0 || cats.includes(it.cat)) &&
    (q === '' || it.label.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <PageShell width="wide">
      <div className="zq-rise" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--text-accent)' }}>Forty-three pieces</p>
          <h1 style={{ margin: 'var(--space-2) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-4)', fontWeight: 'var(--weight-medium)' }}>
            The closet, <em style={{ color: 'var(--text-accent)' }}>drawn to scale.</em>
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Field placeholder="Search the closet" value={q} onChange={(e) => setQ(e.target.value)} size="sm" style={{ width: '13rem' }} />
          <Button variant="primary" size="sm" onClick={() => { setUploading(true); onFlash('Three photos developing.'); setTimeout(() => setUploading(false), 2600) }}>
            Add pieces
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Plaque label="Your closet is working" value="AED 41,460" note="earned back this month" />
      </div>

      <div style={{ marginTop: 'var(--space-8)' }}>
        <Tabs label="Collections" value={coll} onChange={setColl} items={COLLECTIONS} />
      </div>

      <div style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
        {CATS.map(([k, l, n]) => (
          <Filter key={k} on={cats.includes(k)} onClick={() => toggle(k)} count={n}>{l}</Filter>
        ))}
        <span aria-hidden style={{ margin: '0 var(--space-1)', height: 16, width: 1, background: 'var(--border-field)' }} />
        <Filter on={false}>Clean only</Filter>
        {cats.length > 0 && <Button variant="quiet" size="sm" onClick={() => setCats([])}>Clear</Button>}
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        {uploading ? (
          <ArchSkeleton count={10} columns="repeat(auto-fill, minmax(150px, 1fr))" />
        ) : shown.length === 0 ? (
          <p style={{ padding: 'var(--space-12) 0', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-6)', fontStyle: 'italic', color: 'var(--text-faint)' }}>
            Nothing in the closet matches that.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
            {shown.map((it, i) => (
              <div key={it.id} style={{ position: 'relative' }}>
                <GarmentTile
                  imageUrl={`${IMG_CLOSET}/${it.img}.webp`}
                  label={it.label}
                  sublabel={it.sub}
                  onClick={() => onFlash(`${it.label}. Worn 6 times.`)}
                  className="zq-rise-stagger"
                  style={{ '--i': i }}
                />
                {it.coll === 'new' && <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 4 }}><Badge>New</Badge></span>}
                {it.coll === 'orphans' && <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 4 }}><Badge tone="quiet">Idle</Badge></span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 'var(--space-12)' }}>
        <SectionHead title="What the closet is missing" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
          {[
            ['A mid layer in cream', 'Unlocks 6 outfits you can\u2019t build today.'],
            ['Flat shoes for work', 'Four briefs stalled on footwear this month.'],
            ['One more bottom in navy', 'Your tops outnumber your bottoms two to one.'],
          ].map(([t, l]) => (
            <Card key={t} hover style={{ padding: 'var(--space-4)' }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', color: 'var(--text-strong)' }}>{t}</p>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-ui-sm)', color: 'var(--text-muted)' }}>{l}</p>
            </Card>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
