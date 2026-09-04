import React from 'react'
import { RoomHeader, RoomBody, nativeType } from './MobileFurniture.jsx'
import { Card } from '../../components/surfaces/Card.jsx'
import { Arch } from '../../components/surfaces/Arch.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Chip } from '../../components/actions/Chip.jsx'
import { Badge } from '../../components/feedback/Badge.jsx'

const IMG = '../../assets/imagery'

function Avatar({ initials }) {
  return (
    <span
      style={{
        display: 'flex',
        height: 32,
        width: 32,
        flex: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius)',
        background: 'var(--surface-wash)',
        color: 'var(--text-accent)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {initials}
    </span>
  )
}

function PostHeader({ initials, name, when, note }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 16 }}>
      <Avatar initials={initials} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...nativeType.bodySm, color: 'var(--text-strong)' }}>{name}</span>
        <span style={{ display: 'block', ...nativeType.caption, color: 'var(--text-faint)' }}>{when}</span>
      </span>
      {note && <Badge>{note}</Badge>}
    </div>
  )
}

/** Circle on a phone: the feed — a look, a verdict poll, a friend's pick. */
export function CircleMobile({ onFlash }) {
  const [vote, setVote] = React.useState(null)
  return (
    <RoomBody withActionBar={false}>
      <RoomHeader eyebrow="Five invitations left" title="Circle" lead="A few people you trust." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card>
          <PostHeader initials="SR" name="Sara wore the camel coat." when="this morning" note="Wore" />
          {/* Landscape: a 3px rectangle, never an arch. */}
          <div style={{ margin: '0 16px', overflow: 'hidden', borderRadius: 'var(--radius)', border: 'var(--border-hair) solid var(--border-hairline)', aspectRatio: '4 / 3' }}>
            <img src={`${IMG}/friends.webp`} alt="" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, padding: 16 }}>
            <Chip onClick={() => onFlash('Noted.')}>Beautiful</Chip>
            <Chip onClick={() => onFlash('Noted.')}>Steal it</Chip>
          </div>
        </Card>

        <Card>
          <PostHeader initials="DM" name="Dana asked which of two." when="yesterday" note="Verdict" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px' }}>
            {[
              ['a', 'blazer'],
              ['b', 'tank'],
            ].map(([id, img]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setVote(id)
                  onFlash('Verdict in. Dana will see it.')
                }}
                className="zq-press"
                style={{ display: 'block', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
              >
                <Arch aspect="3/4" photo bright={vote === id}>
                  <img src={`${IMG}/${img}.webp`} alt={`Option ${id.toUpperCase()}`} style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                  <span
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: 8,
                      zIndex: 4,
                      display: 'flex',
                      height: 22,
                      width: 22,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius)',
                      background: vote === id ? 'var(--fill-accent)' : 'rgb(11 10 9 / 0.55)',
                      color: vote === id ? 'var(--text-on-brass)' : 'var(--brand-cream)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {id.toUpperCase()}
                  </span>
                </Arch>
              </button>
            ))}
          </div>
          <p style={{ margin: 0, padding: 16, ...nativeType.caption, color: 'var(--text-faint)' }}>
            {vote ? 'Your verdict is in. Four others have voted.' : 'Four others have voted.'}
          </p>
        </Card>

        <Card>
          <PostHeader initials="AK" name="Nadia picked a look for you." when="two days ago" note="Pick" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '0 16px' }}>
            {['blazer', 'tank', 'trousers', 'pumps'].map((p) => (
              <Arch key={p} aspect="5/6">
                <img src={`${IMG}/${p}.webp`} alt={p} style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '12%', boxSizing: 'border-box' }} />
              </Arch>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, padding: 16, alignItems: 'center' }}>
            <Button variant="primary" size="sm" onClick={() => onFlash('Hung for tomorrow.')}>
              Hang it
            </Button>
            <Button variant="quiet" size="sm" onClick={() => onFlash('Thanked.')}>
              Say thanks
            </Button>
          </div>
        </Card>
      </div>
    </RoomBody>
  )
}
