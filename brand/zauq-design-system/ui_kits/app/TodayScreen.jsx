import React from 'react'
import { PageShell, SectionHead } from '../../components/surfaces/PageShell.jsx'
import { GarmentTile } from '../../components/data/GarmentTile.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Chip } from '../../components/actions/Chip.jsx'
import { Alert } from '../../components/feedback/Alert.jsx'
import { Card } from '../../components/surfaces/Card.jsx'
import { Stat } from '../../components/data/Stat.jsx'
import { MoreMenu, MenuItem } from '../../components/navigation/MoreMenu.jsx'
import { Modal } from '../../components/surfaces/Modal.jsx'
import { WeekStrip } from './WeekStrip.jsx'

const IMG_TODAY = '../../assets/imagery'

const WEEK = [
  { key: 'mon', wd: 'Mon', n: 1, worn: true },
  { key: 'tue', wd: 'Tue', n: 2, worn: true },
  { key: 'wed', wd: 'Wed', n: 3, today: true },
  { key: 'thu', wd: 'Thu', n: 4, word: 'work' },
  { key: 'fri', wd: 'Fri', n: 5, word: 'dinner' },
  { key: 'sat', wd: 'Sat', n: 6, rest: true, word: 'rest' },
  { key: 'sun', wd: 'Sun', n: 7 },
]

const BRIEF = [
  { id: 'blazer', img: 'blazer', label: 'Blazer', sub: 'AED 62 / wear' },
  { id: 'tank', img: 'tank', label: 'Tank', sub: '11 wears' },
  { id: 'trousers', img: 'trousers', label: 'Trousers', sub: 'AED 40 / wear' },
  { id: 'pumps', img: 'pumps', label: 'Pumps', sub: 'New this month' },
]

const FEEDBACK = ['Too formal', 'Too casual', 'Runs warm', 'Not warm enough', 'Wrong colour']

/** Today: the brief. The day's outfit, hung in four niches, and what to do about it. */
export function TodayScreen({ onFlash, onGoMirror }) {
  const [day, setDay] = React.useState('wed')
  const [worn, setWorn] = React.useState(false)
  const [reconsider, setReconsider] = React.useState(null)

  return (
    <PageShell width="wide">
      <div className="zq-rise" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--text-accent)' }}>
            Wednesday 3 September
          </p>
          <h1 style={{ margin: 'var(--space-2) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-4)', fontWeight: 'var(--weight-medium)', lineHeight: 'var(--leading-display)' }}>
            Good morning, Akhil. <em style={{ color: 'var(--text-accent)' }}>This is laid out.</em>
          </h1>
          <p style={{ margin: 'var(--space-3) 0 0', maxWidth: '30rem', fontSize: 'var(--text-body)', color: 'var(--text-muted)' }}>
            24&deg; and clear, a client lunch at one. Everything here is clean and in the closet.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
          <Stat value="128" label="Wears logged" />
          <Stat value="9" label="Day streak" accent />
        </div>
      </div>

      <WeekStrip days={WEEK} selected={day} onSelect={setDay} />

      <div style={{ marginTop: 'var(--space-8)', display: 'grid', gap: 'var(--space-8)', gridTemplateColumns: 'minmax(0, 2.1fr) minmax(0, 1fr)' }}>
        <div>
          <SectionHead
            title="The brief"
            action={
              <MoreMenu align="right">
                <MenuItem onClick={() => onFlash('Shared. Two of your circle can see it.')}>Share this brief</MenuItem>
                <MenuItem onClick={() => onFlash('Added to Lisbon, 12-16 Sept.')}>Add to a trip</MenuItem>
                <MenuItem onClick={() => onFlash('Back to the earlier brief.')}>Go back a brief</MenuItem>
              </MoreMenu>
            }
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
            {BRIEF.map((it, i) => (
              <GarmentTile
                key={it.id}
                imageUrl={`${IMG_TODAY}/${it.img}.webp`}
                label={it.label}
                sublabel={it.sub}
                onClick={() => setReconsider(it)}
                className="zq-rise-stagger"
                style={{ '--i': i }}
              />
            ))}
          </div>

          <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Button variant="primary" onClick={() => { setWorn(true); onFlash('Logged. That’s nine days running.') }} disabled={worn}>
              {worn ? 'Worn today' : 'Wear it'}
            </Button>
            <Button variant="ghost" onClick={() => onFlash('Composing another. One moment.')}>Show me another</Button>
            <Button variant="quiet" onClick={() => onFlash('Noted. A rest day.')}>Not today</Button>
            <Button variant="quiet" onClick={onGoMirror} style={{ marginLeft: 'auto' }}>See it on you &rarr;</Button>
          </div>

          <div style={{ marginTop: 'var(--space-5)' }}>
            <Alert tone="warning">The forecast moved since this was composed. It&rsquo;s three degrees cooler than at eight.</Alert>
          </div>

          <div style={{ marginTop: 'var(--space-10)' }}>
            <SectionHead title="The evening" />
            <Card style={{ padding: 'var(--space-5)', display: 'flex', gap: 'var(--space-5)', alignItems: 'center', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, flex: 1, minWidth: '14rem', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', color: 'var(--text-strong)' }}>
                Dinner at eight? <em style={{ color: 'var(--text-accent)' }}>Swap the pumps and the blazer</em> and the day carries through.
              </p>
              <Button variant="ghost" size="sm" onClick={() => onFlash('The evening act is hung.')}>Hang it</Button>
            </Card>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <SectionHead title="Why this" />
            <Card style={{ padding: 'var(--space-4)' }}>
              {[['The weather', '24°, wind picking up'], ['The day', 'Client lunch, 1pm'], ['The closet', 'All four, clean'], ['Last worn', 'The blazer, 9 days ago']].map(([k, v], i, arr) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', padding: 'var(--space-2-5) 0', borderBottom: i === arr.length - 1 ? 'none' : 'var(--border-hair) solid var(--border-hairline)' }}>
                  <span style={{ flex: 'none', whiteSpace: 'nowrap', fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--text-faint)', alignSelf: 'center' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-body-lg)', lineHeight: 1.3, color: 'var(--text-strong)', textAlign: 'right' }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>

          <div>
            <SectionHead title="Your circle" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {[['SR', 'Sara wore the camel coat.', 'this morning'], ['DM', 'Dana asked which of two.', 'yesterday']].map(([ini, line, when]) => (
                <Card key={ini} hover style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <span style={{ display: 'flex', height: 32, width: 32, flex: 'none', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', background: 'var(--surface-wash)', color: 'var(--text-accent)', fontSize: 11, fontWeight: 700 }}>{ini}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-ui-sm)', color: 'var(--text-body)' }}>{line}</span>
                    <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-faint)' }}>{when}</span>
                  </span>
                </Card>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <Modal open={!!reconsider} onClose={() => setReconsider(null)} title={reconsider?.label ?? ''}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>
          {reconsider && (
            <div className="zq-arch-bezel" style={{ aspectRatio: '5 / 6', '--arch-h': '41.7%' }}>
              <div className="zq-arch-niche">
                <img src={`${IMG_TODAY}/${reconsider.img}.webp`} alt="" style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '7%', boxSizing: 'border-box' }} />
              </div>
            </div>
          )}
          <div>
            <p style={{ margin: 0, fontSize: 'var(--text-ui)', color: 'var(--text-muted)' }}>
              {reconsider?.sub}. Tell me what&rsquo;s wrong with it and I&rsquo;ll read the next one differently.
            </p>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {FEEDBACK.map((f) => (
                <Chip key={f} onClick={() => { setReconsider(null); onFlash('Got it. I’ll read this one differently.') }}>{f}</Chip>
              ))}
            </div>
            <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
              <Button variant="primary" size="sm" onClick={() => { setReconsider(null); onFlash('Swapped.') }}>Swap it out</Button>
              <Button variant="quiet" size="sm" onClick={() => setReconsider(null)}>Keep it</Button>
            </div>
          </div>
        </div>
      </Modal>
    </PageShell>
  )
}
