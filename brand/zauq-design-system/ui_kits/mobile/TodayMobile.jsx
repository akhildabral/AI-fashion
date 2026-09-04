import React from 'react'
import { RoomHeader, RoomBody, ActionBar, MobileSectionHead, nativeType } from './MobileFurniture.jsx'
import { GarmentTile } from '../../components/data/GarmentTile.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Card } from '../../components/surfaces/Card.jsx'
import { Alert } from '../../components/feedback/Alert.jsx'
import { Chip } from '../../components/actions/Chip.jsx'

const IMG = '../../assets/imagery'

const BRIEF = [
  { id: 'blazer', label: 'Blazer', sub: 'AED 62 / wear' },
  { id: 'tank', label: 'Tank', sub: '11 wears' },
  { id: 'trousers', label: 'Trousers', sub: 'AED 40 / wear' },
  { id: 'pumps', label: 'Pumps', sub: 'New' },
]

const WEEK = [
  ['Mon', 1, 'worn'],
  ['Tue', 2, 'worn'],
  ['Wed', 3, 'today'],
  ['Thu', 4, ''],
  ['Fri', 5, ''],
  ['Sat', 6, 'rest'],
  ['Sun', 7, ''],
]

const WHY = [
  ['The weather', '24°, wind picking up'],
  ['The day', 'Client lunch, 1pm'],
  ['The closet', 'All four, clean'],
]

/** Today on a phone: the brief in two columns, the reasoning below, one verb in the thumb zone. */
export function TodayMobile({ onFlash }) {
  const [worn, setWorn] = React.useState(false)
  const [day, setDay] = React.useState(3)
  return (
    <>
      <RoomBody>
        <RoomHeader
          eyebrow="Wednesday 3 September"
          title="Good morning."
          emphasis="This is laid out."
          lead="24° and clear, a client lunch at one."
        />

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {WEEK.map(([wd, n, state]) => {
            const on = n === day
            return (
              <button
                key={wd}
                type="button"
                onClick={() => setDay(n)}
                className="zq-press"
                style={{
                  flex: 'none',
                  width: 44,
                  padding: '8px 0 10px',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  background: on ? 'var(--fill-wash)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  position: 'relative',
                }}
              >
                <span style={{ ...nativeType.micro, color: on ? 'var(--text-strong)' : 'var(--text-faint)' }}>{wd}</span>
                <span style={{ ...nativeType.bodySm, fontFamily: 'var(--font-display)', fontSize: 17, color: on ? 'var(--text-strong)' : 'var(--text-muted)' }}>{n}</span>
                <span
                  style={{
                    height: 4,
                    width: 4,
                    borderRadius: 2,
                    background: state === 'worn' ? 'var(--fill-accent)' : state === 'rest' ? 'rgb(var(--c-ink) / 0.2)' : 'transparent',
                  }}
                />
                {state === 'today' && <span style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 'var(--rule-active)', background: 'var(--c-brass)' }} />}
              </button>
            )
          })}
        </div>

        <MobileSectionHead title="The brief" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {BRIEF.map((it, i) => (
            <GarmentTile
              key={it.id}
              imageUrl={`${IMG}/${it.id}.webp`}
              label={it.label}
              sublabel={it.sub}
              onClick={() => onFlash(`${it.label}. Long-press for the menu.`)}
              className="zq-rise-stagger"
              style={{ '--i': i }}
            />
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <Alert tone="warning">It’s three degrees cooler than at eight.</Alert>
        </div>

        <MobileSectionHead title="Why this" />
        <Card>
          <div style={{ padding: '4px 16px' }}>
            {WHY.map(([k, v], i) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: i === WHY.length - 1 ? 'none' : 'var(--border-hair) solid var(--border-hairline)',
                }}
              >
                <span style={{ ...nativeType.micro, color: 'var(--text-faint)', alignSelf: 'center' }}>{k}</span>
                <span style={{ ...nativeType.bodySm, fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-strong)', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <MobileSectionHead title="The evening" />
        <Card>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, ...nativeType.h3, color: 'var(--text-strong)' }}>
              Dinner at eight? <em style={{ color: 'var(--text-accent)' }}>Swap the pumps.</em>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Chip onClick={() => onFlash('The evening act is hung.')}>Hang it</Chip>
              <Chip onClick={() => onFlash('Not tonight.')}>Not tonight</Chip>
            </div>
          </div>
        </Card>
      </RoomBody>

      <ActionBar>
        <Button
          variant="primary"
          disabled={worn}
          onClick={() => {
            setWorn(true)
            onFlash('Logged. That’s nine days running.')
          }}
          style={{ flex: 1 }}
        >
          {worn ? 'Worn today' : 'Wear it'}
        </Button>
        <Button variant="ghost" onClick={() => onFlash('Composing another.')}>
          Another
        </Button>
      </ActionBar>
    </>
  )
}
