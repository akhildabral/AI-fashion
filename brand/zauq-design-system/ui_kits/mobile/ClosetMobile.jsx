import React from 'react'
import { RoomHeader, RoomBody, ActionBar, nativeType, GUTTER } from './MobileFurniture.jsx'
import { GarmentTile } from '../../components/data/GarmentTile.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Filter } from '../../components/navigation/Filter.jsx'
import { Tabs } from '../../components/navigation/Tabs.jsx'
import { Stat } from '../../components/data/Stat.jsx'
import { Plaque } from '../../components/surfaces/Plaque.jsx'

const IMG = '../../assets/imagery'
const PIECES = ['blazer', 'tank', 'trousers', 'pumps', 'bag', 'blazer', 'trousers', 'tank']
const LENSES = [
  { key: 'all', label: 'All' },
  { key: 'worn', label: 'Most worn' },
  { key: 'never', label: 'Never worn' },
  { key: 'idle', label: 'Sitting idle' },
]

/** Closet on a phone: two columns of arches, lenses as tabs, the ledger as a plaque. */
export function ClosetMobile({ onFlash }) {
  const [lens, setLens] = React.useState('all')
  const [on, setOn] = React.useState('clean')
  return (
    <>
      <RoomBody>
        <RoomHeader eyebrow="38 pieces · 6 worn this week" title="Closet" right={<Stat value="41,460" label="AED back" accent />} />

        <div style={{ margin: `0 -${GUTTER}px`, padding: `0 ${GUTTER}px` }}>
          <Tabs items={LENSES} value={lens} onChange={setLens} label="Collections" />
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '12px 0 4px', overflowX: 'auto' }}>
          {['clean', 'in the wash', 'let go'].map((f) => (
            <Filter key={f} on={on === f} onClick={() => setOn(f)}>
              {f}
            </Filter>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 8 }}>
          {PIECES.map((p, i) => (
            <GarmentTile
              key={`${p}-${i}`}
              imageUrl={`${IMG}/${p}.webp`}
              label={p}
              sublabel={i % 3 === 0 ? 'AED 62 / wear' : `${11 - i} wears`}
              onClick={() => onFlash('Long-press for the piece menu.')}
              className="zq-rise-stagger"
              style={{ '--i': i }}
            />
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <Plaque label="Your closet is working" value="AED 41,460" note="earned back this month" />
        </div>

        <p style={{ margin: '16px 0 0', ...nativeType.lede, color: 'var(--text-muted)' }}>
          Four pieces have sat idle since June. Let them go, or give them a morning.
        </p>
      </RoomBody>

      <ActionBar>
        <Button variant="primary" onClick={() => onFlash('Camera open. Photograph the rail.')} style={{ flex: 1 }}>
          Add pieces
        </Button>
        <Button variant="quiet" onClick={() => onFlash('Sorted by cost per wear.')}>
          Sort
        </Button>
      </ActionBar>
    </>
  )
}
