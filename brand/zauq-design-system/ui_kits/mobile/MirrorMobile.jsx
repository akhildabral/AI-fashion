import React from 'react'
import { RoomHeader, RoomBody, ActionBar, nativeType } from './MobileFurniture.jsx'
import { MirrorFrame } from '../../components/surfaces/MirrorFrame.jsx'
import { Arch } from '../../components/surfaces/Arch.jsx'
import { Button } from '../../components/actions/Button.jsx'

const IMG = '../../assets/imagery'
const RAIL = ['blazer', 'tank', 'trousers', 'pumps', 'bag']

/** Mirror on a phone: the render at 2/3, the rail of pieces beneath it. */
export function MirrorMobile({ onFlash }) {
  const [status, setStatus] = React.useState('ready')
  const [rail, setRail] = React.useState(['blazer', 'tank', 'trousers', 'pumps'])
  const toggle = (id) => setRail((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))
  return (
    <>
      <RoomBody>
        <RoomHeader eyebrow="Four pieces on the rail" eyebrowVoice="italic" title="See it on" emphasis="me." />

        <MirrorFrame className={status === 'ready' ? 'zq-mirror-reveal' : ''}>
          <div style={{ position: 'relative', aspectRatio: 'var(--ratio-mirror)', width: '100%' }}>
            {status === 'rendering' ? (
              <div className="zq-filament" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ ...nativeType.micro, letterSpacing: '3px', color: 'var(--brand-gold)' }}>developing</span>
              </div>
            ) : (
              <img src={`${IMG}/mirror.webp`} alt="The look on you" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
            )}
          </div>
        </MirrorFrame>

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '16px 0 4px' }}>
          {RAIL.map((id) => {
            const on = rail.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={on}
                className="zq-press"
                style={{ flex: 'none', width: 64, border: 'none', background: 'none', padding: 0, cursor: 'pointer', opacity: on ? 1 : 0.35, transition: 'opacity var(--dur-press) var(--ease-out)' }}
              >
                <Arch aspect="5/6" bright={on}>
                  <img src={`${IMG}/${id}.webp`} alt={id} style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '11%', boxSizing: 'border-box' }} />
                </Arch>
                <p style={{ margin: '6px 0 0', ...nativeType.micro, textAlign: 'center', color: on ? 'var(--text-body)' : 'var(--text-faint)' }}>{id}</p>
              </button>
            )
          })}
        </div>

        <p style={{ margin: '12px 0 0', ...nativeType.bodySm, color: 'var(--text-muted)' }}>
          Tap a piece to take it off the rail. Your photo is yours — delete it any time, and every render made from it goes with it.
        </p>
      </RoomBody>

      <ActionBar>
        <Button
          variant="primary"
          onClick={() => {
            setStatus('rendering')
            onFlash('Developing. About twenty seconds.')
            setTimeout(() => setStatus('ready'), 1800)
          }}
          style={{ flex: 1 }}
        >
          {status === 'rendering' ? 'Developing…' : 'See it on me'}
        </Button>
        <Button variant="ghost" onClick={() => onFlash('Saved to your looks.')}>
          Save
        </Button>
      </ActionBar>
    </>
  )
}
