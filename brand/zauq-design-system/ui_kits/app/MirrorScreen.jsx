import React from 'react'
import { PageShell } from '../../components/surfaces/PageShell.jsx'
import { MirrorFrame } from '../../components/surfaces/MirrorFrame.jsx'
import { Card } from '../../components/surfaces/Card.jsx'
import { Arch } from '../../components/surfaces/Arch.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Tabs } from '../../components/navigation/Tabs.jsx'
import { MoreMenu, MenuItem } from '../../components/navigation/MoreMenu.jsx'
import { Tape } from '../../components/forms/Tape.jsx'
import { Alert } from '../../components/feedback/Alert.jsx'
import { Spinner } from '../../components/feedback/Spinner.jsx'

const IMG_MIRROR = '../../assets/imagery'

// The Mirror, as a fitting room. The glass in the centre; under it the rail —
// the pieces on you, each a switch — and the meter; after a render, the
// decision. Nothing renders until you tap.

const DRESSING_LINES = ['Taking your measure\u2026', 'Cutting the pieces\u2026', 'Fitting the shoulders\u2026', 'Setting the light\u2026', 'Checking the proportions\u2026']

const CLOSET = [
  { id: 'blazer', label: 'Blazer' },
  { id: 'tank', label: 'Tank' },
  { id: 'trousers', label: 'Trousers' },
  { id: 'pumps', label: 'Pumps' },
  { id: 'bag', label: 'Bag' },
]

const EYEBROW = { margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'var(--text-faint)' }

/** A rail tile: a piece on you, and a switch. Dimmed and struck through when off. */
function RailPiece({ piece, on, onToggle, onSwap }) {
  return (
    <div>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        title={on ? 'Take it off' : 'Put it back'}
        className="zq-press"
        style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
      >
        <Arch aspect="5/6" style={{ opacity: on ? 1 : 0.35, transition: 'opacity var(--dur-press) var(--ease-out)' }}>
          <img src={`${IMG_MIRROR}/${piece.id}.webp`} alt={piece.label} style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '10%', boxSizing: 'border-box' }} />
        </Arch>
        <span style={{ display: 'block', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xs)', color: on ? 'rgb(var(--c-ink) / 0.6)' : 'rgb(var(--c-ink) / 0.35)', textDecoration: on ? 'none' : 'line-through' }}>
          {piece.label}
        </span>
      </button>
      <button
        type="button"
        onClick={onSwap}
        className="zq-press"
        style={{ height: 28, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xs)', color: 'var(--text-accent)' }}
      >
        Swap
      </button>
    </div>
  )
}

/** The Mirror: the glass, the rail, the meter, the decision. */
export function MirrorScreen({ onFlash }) {
  const [lens, setLens] = React.useState('closet')
  const [rail, setRail] = React.useState([{ id: 'blazer', on: true }, { id: 'trousers', on: true }, { id: 'pumps', on: true }])
  const [status, setStatus] = React.useState('photo') // photo | rendering | ready | failed
  const [dressLine, setDressLine] = React.useState(0)
  const [split, setSplit] = React.useState(0)
  const [fresh, setFresh] = React.useState(false)
  const [decided, setDecided] = React.useState({})
  const rendersLeft = 7

  React.useEffect(() => {
    if (status !== 'rendering') return
    const id = window.setInterval(() => setDressLine((n) => (n + 1) % DRESSING_LINES.length), 1400)
    return () => window.clearInterval(id)
  }, [status])

  const chosen = rail.filter((r) => r.on)
  const pieces = rail.map((r) => ({ ...r, piece: CLOSET.find((c) => c.id === r.id) })).filter((r) => r.piece)
  const toggle = (id) => setRail((r) => r.map((x) => (x.id === id ? { ...x, on: !x.on } : x)))
  const addable = CLOSET.filter((c) => !rail.some((r) => r.id === c.id))

  function fire() {
    setStatus('rendering')
    setDressLine(0)
    setSplit(0)
    setDecided({})
    window.setTimeout(() => { setStatus('ready'); setFresh(true) }, 2400)
  }

  return (
    <PageShell width="wide">
      <div style={{ display: 'grid', gap: 'var(--space-10)', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        {/* ---------------- the glass ---------------- */}
        <div>
          <p className="zq-rise" style={{ margin: 0, fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow-wide)', color: 'var(--text-accent)' }}>
            The Mirror
          </p>
          <h1 className="zq-rise-1" style={{ margin: 'var(--space-2) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-4)', fontWeight: 'var(--weight-medium)' }}>
            {status === 'ready' ? <>There <em style={{ color: 'var(--text-accent)' }}>you are.</em></> : <>The <em style={{ color: 'var(--text-accent)' }}>Mirror.</em></>}
          </h1>

          <div className="zq-rise-2" style={{ marginTop: 'var(--space-6)' }}>
            <MirrorFrame>
              <div style={{ position: 'relative', aspectRatio: '3 / 4', width: '100%' }}>
                {status === 'rendering' && (
                  <>
                    <img src={`${IMG_MIRROR}/mirror.webp`} alt="" style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover', opacity: 0.25, filter: 'blur(2px)' }} />
                    <span aria-hidden className="zq-filament" style={{ position: 'absolute', left: '50%', top: 0, height: '100%', width: 1, transform: 'translateX(-50%)', background: 'linear-gradient(to bottom, transparent, rgb(var(--c-iris) / 0.6), transparent)' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-5)', padding: 'var(--space-8)', textAlign: 'center' }}>
                      <p key={dressLine} className="zq-rise" style={{ margin: 0, position: 'relative', fontFamily: 'var(--font-display)', fontSize: 'var(--text-body-lg)', fontStyle: 'italic', color: 'rgb(236 229 216 / 0.8)' }}>
                        {DRESSING_LINES[dressLine]}
                      </p>
                      <p style={{ margin: 0, position: 'relative', fontSize: 11, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-lg)', color: 'rgb(236 229 216 / 0.5)' }}>
                        Leave if you like; you&rsquo;ll hear when it&rsquo;s ready
                      </p>
                    </div>
                  </>
                )}

                {status === 'ready' && (
                  <>
                    <img src={`${IMG_MIRROR}/mirror.webp`} alt="You, in the render" className={fresh ? 'zq-mirror-reveal' : undefined} style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover' }} />
                    {split > 0 && (
                      <>
                        <img src={`${IMG_MIRROR}/morning.webp`} alt="You, before" style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover', clipPath: `inset(0 ${100 - split}% 0 0)` }} />
                        <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--c-brass)', left: `${split}%` }} />
                        <span style={{ position: 'absolute', left: 12, top: 12, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'rgb(236 229 216 / 0.8)' }}>Before</span>
                        <span style={{ position: 'absolute', right: 12, top: 12, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'rgb(236 229 216 / 0.8)' }}>After</span>
                      </>
                    )}
                    {fresh && split === 0 && (
                      <span aria-hidden className="zq-arch-sweep" style={{ pointerEvents: 'none', position: 'absolute', inset: 0, background: 'linear-gradient(122deg, transparent 45%, rgba(240,226,196,.14) 50%, transparent 55%)' }} />
                    )}
                  </>
                )}

                {status === 'failed' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', padding: 'var(--space-8)', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontWeight: 'var(--weight-medium)', color: 'rgb(236 229 216)' }}>That one didn&rsquo;t take.</p>
                    <p style={{ margin: 0, maxWidth: '28ch', fontSize: 'var(--text-ui)', color: 'rgb(236 229 216 / 0.6)' }}>Nothing was charged. Try again, or change a piece on the rail.</p>
                  </div>
                )}

                {status === 'photo' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', padding: 'var(--space-8)', textAlign: 'center' }}>
                    <img src={`${IMG_MIRROR}/morning.webp`} alt="You" style={{ height: 112, width: 112, borderRadius: 'var(--radius)', objectFit: 'cover', opacity: 0.8 }} />
                    <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-medium)', color: 'rgb(236 229 216)' }}>You&rsquo;re in the mirror.</p>
                    <p style={{ margin: 0, maxWidth: '26ch', fontSize: 'var(--text-ui)', color: 'rgb(236 229 216 / 0.6)' }}>
                      {chosen.length ? 'The pieces are on the rail. Tap See it on me.' : 'Bring pieces from Today or the Closet, or pick them here.'}
                    </p>
                  </div>
                )}
              </div>
            </MirrorFrame>

            {status === 'ready' && (
              <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-lg)', color: 'var(--text-faint)' }}>Before</span>
                <Tape min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} label="Before and after" style={{ flex: 1 }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-lg)', color: 'var(--text-faint)' }}>After</span>
              </div>
            )}
          </div>

          {status === 'failed' && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Alert tone="error">The render failed. Nothing was charged.</Alert>
            </div>
          )}
        </div>

        {/* ---------------- the rail, the meter, the decision ---------------- */}
        <div>
          <Tabs
            label="What the Mirror dresses you in"
            value={lens}
            onChange={setLens}
            items={[{ key: 'closet', label: 'Your closet' }, { key: 'inspiration', label: 'Inspiration' }]}
            style={{ marginBottom: 'var(--space-6)' }}
          />

          {lens === 'inspiration' ? (
            <Card style={{ padding: 'var(--space-5)' }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontStyle: 'italic', color: 'var(--text-body)' }}>Looks you don&rsquo;t own, on you.</p>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-ui)', color: 'var(--text-muted)' }}>
                The Inspiration lens is not recreated in this kit. See <code>InspirationLens.tsx</code> in the codebase.
              </p>
            </Card>
          ) : (
            <section>
              <div style={{ display: 'flex', height: 32, alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <p style={EYEBROW}>On you</p>
                {rail.length > 0 && <Button variant="quiet" size="sm" onClick={() => setRail([])}>Clear the rail</Button>}
              </div>

              {rail.length === 0 ? (
                <Card style={{ marginTop: 'var(--space-3)', padding: 'var(--space-5)' }}>
                  <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-body-lg)', fontStyle: 'italic', color: 'var(--text-body)' }}>Nothing on the rail yet.</p>
                  <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-ui)', color: 'var(--text-muted)' }}>Bring a look from Today or the Closet, or pick pieces from your closet here.</p>
                  <div style={{ marginTop: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-2)' }}>
                    {CLOSET.map((p) => (
                      <button key={p.id} type="button" title={p.label} onClick={() => setRail((r) => [...r, { id: p.id, on: true }])} className="zq-press" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                        <Arch aspect="5/6" style={{ opacity: 0.8 }}>
                          <img src={`${IMG_MIRROR}/${p.id}.webp`} alt={p.label} style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '10%', boxSizing: 'border-box' }} />
                        </Arch>
                      </button>
                    ))}
                  </div>
                </Card>
              ) : (
                <div style={{ marginTop: 'var(--space-3)', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
                  {pieces.map(({ id, on, piece }) => (
                    <RailPiece key={id} piece={piece} on={on} onToggle={() => toggle(id)} onSwap={() => onFlash('Three alternatives from your closet.')} />
                  ))}
                  {addable.length > 0 && (
                    <div>
                      <button type="button" title="Add a piece" onClick={() => setRail((r) => [...r, { id: addable[0].id, on: true }])} className="zq-press" style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                        <Arch aspect="5/6" style={{ opacity: 0.75 }}>
                          <span style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--text-in-niche-muted)' }}>+</span>
                        </Arch>
                        <span style={{ display: 'block', marginTop: 6, fontSize: 10, fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xs)', color: 'rgb(var(--c-ink) / 0.4)' }}>Add a piece</span>
                      </button>
                      <span aria-hidden style={{ display: 'block', height: 28 }} />
                    </div>
                  )}
                </div>
              )}

              {/* the button, then the meter as a hint line beneath it */}
              <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)' }}>
                <Button variant="primary" disabled={chosen.length === 0 || status === 'rendering'} onClick={fire}>
                  {status === 'rendering' ? 'Rendering\u2026' : 'See it on me \u00B7 1 render'}
                </Button>
              </div>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>
                <b style={{ color: 'var(--text-accent)' }}>{rendersLeft} of 20</b> left this month &middot; same pieces again is free
              </p>
            </section>
          )}

          {/* the decision */}
          {status === 'ready' && (
            <section className="zq-rise" style={{ marginTop: 'var(--space-8)', borderTop: 'var(--border-hair) solid var(--border-hairline)', paddingTop: 'var(--space-6)' }}>
              <p style={EYEBROW}>Then</p>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>
                This render: {pieces.filter((p) => p.on).map((p) => p.piece.label.toLowerCase()).join(' \u00B7 ')}
              </p>
              <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)' }}>
                {decided.wear ? (
                  <span style={{ display: 'inline-flex', height: 'var(--control-h)', alignItems: 'center', borderRadius: 'var(--radius)', border: 'var(--border-hair) solid var(--border-accent)', background: 'var(--surface-wash)', padding: '0 var(--space-4)', fontSize: 'var(--text-ui)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-accent)' }}>
                    Logged for today
                  </span>
                ) : (
                  <Button variant="primary" onClick={() => { setDecided((d) => ({ ...d, wear: true })); onFlash('Logged. That\u2019s nine days running.') }}>Wearing it</Button>
                )}
                <Button variant="ghost" disabled={Boolean(decided.keep)} onClick={() => { setDecided((d) => ({ ...d, keep: 'Kept' })); onFlash('Kept. It\u2019s in your outfits.') }}>
                  {decided.keep ?? 'Keep the outfit'}
                </Button>
                <Button variant="quiet" disabled={Boolean(decided.tomorrow)} onClick={() => { setDecided((d) => ({ ...d, tomorrow: 'Hung for tomorrow' })); onFlash('Hung for tomorrow.') }}>
                  {decided.tomorrow ?? 'Tomorrow'}
                </Button>
                <Button variant="quiet" onClick={() => onFlash('Link copied.')}>Share</Button>
                <MoreMenu up align="right" label="More for this render">
                  <MenuItem onClick={() => onFlash('Rendering again \u2014 free once.')}>Not right? Try again &mdash; free once</MenuItem>
                  <MenuItem danger onClick={() => onFlash('Flagged. We\u2019ll look at it.')}>Not my clothes</MenuItem>
                </MoreMenu>
              </div>
            </section>
          )}
        </div>
      </div>
    </PageShell>
  )
}
