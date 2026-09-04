import React from 'react'
import { PageShell } from '../../components/surfaces/PageShell.jsx'
import { Card } from '../../components/surfaces/Card.jsx'
import { Arch } from '../../components/surfaces/Arch.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Tabs } from '../../components/navigation/Tabs.jsx'
import { Filter } from '../../components/navigation/Filter.jsx'
import { MoreMenu, MenuItem } from '../../components/navigation/MoreMenu.jsx'
import { Badge } from '../../components/feedback/Badge.jsx'
import { Stat } from '../../components/data/Stat.jsx'

const IMG_CIRCLE = '../../assets/imagery'

// The Circle — a salon where friends dress each other. One ranked column of
// posts; a rail of who wore what today; the people who make it live in a
// drawer and the things that happened to you behind the bell. Every post asks
// something of you: recreate it, vote it, wear it, keep it.

const LENSES = [
  { key: 'foryou', label: 'For you' },
  { key: 'following', label: 'Following' },
  { key: 'explore', label: 'Explore' },
  { key: 'saved', label: 'Saved' },
]

const OCCASIONS = [[null, 'Everything'], ['work', 'Work'], ['casual', 'Weekend'], ['evening', 'Evening'], ['occasion', 'Occasion']]

const TODAY = [
  { id: 'me', name: 'Your look', img: 'morning' },
  { id: 'sara', name: 'Sara', img: 'friends' },
  { id: 'dana', name: 'Dana', img: 'mirror' },
  { id: 'iman', name: 'Iman', img: 'store' },
  { id: 'noor', name: 'Noor', img: 'closet' },
]

const EYEBROW = { margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'var(--text-faint)' }

/** A brass name-plate: the small caps label that titles a card. */
function Plate({ children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 'var(--radius-sm)', border: 'var(--border-hair) solid var(--border-accent)', background: 'var(--surface-wash)', padding: '2px 7px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-lg)', color: 'var(--text-accent)' }}>
      {children}
    </span>
  )
}

function Initials({ children }) {
  return (
    <span style={{ display: 'flex', height: 30, width: 30, flex: 'none', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', background: 'var(--surface-wash)', color: 'var(--text-accent)', fontSize: 11, fontWeight: 700 }}>
      {children}
    </span>
  )
}

/** Every card wears the same head: who, what it is, when, and its own menu. */
function PostHead({ ini, name, meta, plate, onNote }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-4) 0' }}>
      <Initials>{ini}</Initials>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 'var(--text-ui-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{name}</p>
        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-faint)' }}>{meta}</p>
      </div>
      {plate && <Plate>{plate}</Plate>}
      <MoreMenu align="right" label="Post options">
        <MenuItem onClick={() => onNote('Saved to your board.')}>Save it</MenuItem>
        <MenuItem onClick={() => onNote(`Muted ${name} for a while.`)}>Mute {name} for a while</MenuItem>
        <MenuItem danger onClick={() => onNote('Reported.')}>Report</MenuItem>
      </MoreMenu>
    </div>
  )
}

/** A look someone wore, and the four things it asks of you. */
function LookCard({ post, onNote }) {
  const [saved, setSaved] = React.useState(false)
  const [reacted, setReacted] = React.useState(false)
  return (
    <Card style={{ overflow: 'hidden' }}>
      <PostHead ini={post.ini} name={post.name} meta={post.meta} plate={post.plate} onNote={onNote} />
      <p style={{ margin: 'var(--space-2) 0 0', padding: '0 var(--space-4)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>
        {post.line}
      </p>
      <div style={{ marginTop: 'var(--space-3)', padding: '0 var(--space-4)' }}>
        {/* A landscape picture is a 3px rectangle — never an arch (the crown
            is a semicircle of half the width, so it stretches when w > h). */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius)', border: 'var(--border-hair) solid var(--border-hairline)', background: 'var(--surface-raised)', aspectRatio: '4 / 3' }}>
          <img src={`${IMG_CIRCLE}/${post.img}.webp`} alt="" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
        </div>
      </div>
      <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', padding: '0 var(--space-4)' }}>
        {post.items.map((it) => (
          <Arch key={it} aspect="5/6" style={{ width: 52 }}>
            <img src={`${IMG_CIRCLE}/${it}.webp`} alt="" style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '12%', boxSizing: 'border-box' }} />
          </Arch>
        ))}
      </div>
      <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-4) var(--space-4)' }}>
        <Button variant="ghost" size="sm" onClick={() => onNote('Four of your pieces match this look.')}>Make it from my closet</Button>
        <Button variant="quiet" size="sm" onClick={() => { setReacted((v) => !v); onNote(reacted ? 'Reaction removed.' : 'Noted.') }}>
          {reacted ? `✓ Noted · ${post.reactions + 1}` : `Nice one · ${post.reactions}`}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => { setSaved((v) => !v); onNote(saved ? 'Removed from your board.' : 'Saved to your board.') }}>
          {saved ? 'Saved' : 'Save'}
        </Button>
      </div>
    </Card>
  )
}

/** A verdict: a question, up to three arched options, one vote each until it settles. */
function VerdictCard({ post, onNote }) {
  const [vote, setVote] = React.useState(null)
  const total = post.counts.reduce((a, b) => a + b, 0) + (vote !== null ? 1 : 0)
  return (
    <Card style={{ overflow: 'hidden' }}>
      <PostHead ini={post.ini} name={post.name} meta={post.meta} plate={vote !== null ? 'Verdict is in' : 'Verdict'} onNote={onNote} />
      <p style={{ margin: 'var(--space-2) 0 0', padding: '0 var(--space-4)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>
        {post.question}
      </p>
      <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: '0 var(--space-4) var(--space-4)' }}>
        {post.options.map((o, i) => {
          const n = post.counts[i] + (vote === i ? 1 : 0)
          const share = total > 0 && vote !== null ? Math.round((n / total) * 100) : null
          return (
            <div key={o.id} style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => { setVote(i); onNote(`Voted ${o.id.toUpperCase()}. ${post.name} sees the tally, not the names.`) }}
                className="zq-press"
                style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
              >
                <Arch aspect="3/4" photo bright={vote === i}>
                  <img src={`${IMG_CIRCLE}/${o.img}.webp`} alt={`Option ${o.id.toUpperCase()}`} style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', left: 10, top: 10, zIndex: 4, display: 'flex', height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', background: 'var(--fill-accent)', fontSize: 11, fontWeight: 700, color: 'var(--text-on-brass)' }}>
                    {o.id.toUpperCase()}
                  </span>
                </Arch>
              </button>
              {share !== null && (
                <>
                  <div style={{ marginTop: 'var(--space-2)', height: 4, overflow: 'hidden', borderRadius: 'var(--radius-sm)', background: 'rgb(var(--c-ink) / 0.1)' }}>
                    <div style={{ height: '100%', width: `${share}%`, background: 'linear-gradient(to right, var(--c-brass-lo), var(--c-brass-hi))', transition: 'width 700ms var(--ease-out)' }} />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xs)', color: vote === i ? 'var(--text-accent)' : 'var(--text-faint)' }}>
                      {vote === i ? 'Your vote' : `Option ${o.id.toUpperCase()}`}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-ui)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{share}%</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** A pick: a friend dressed you, and it is waiting on the rail. */
function PickCard({ post, onNote }) {
  const [taken, setTaken] = React.useState(false)
  return (
    <Card style={{ overflow: 'hidden' }}>
      <PostHead ini={post.ini} name={post.name} meta={post.meta} plate="Picked for you" onNote={onNote} />
      <p style={{ margin: 'var(--space-2) 0 0', padding: '0 var(--space-4)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>
        {post.line}
      </p>
      <div style={{ marginTop: 'var(--space-3)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', padding: '0 var(--space-4)' }}>
        {post.items.map((it) => (
          <Arch key={it} aspect="5/6">
            <img src={`${IMG_CIRCLE}/${it}.webp`} alt="" style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '10%', boxSizing: 'border-box' }} />
          </Arch>
        ))}
      </div>
      <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', padding: '0 var(--space-4) var(--space-4)' }}>
        <Button variant="primary" size="sm" disabled={taken} onClick={() => { setTaken(true); onNote('On the rail in the Mirror.') }}>
          {taken ? 'On the rail' : 'Put it on the rail'}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => onNote(`Thanked ${post.name}.`)}>Thank {post.name}</Button>
      </div>
    </Card>
  )
}

const FEED = [
  { type: 'verdict', id: 'v1', ini: 'DM', name: 'Dana', meta: 'asked you · 4h left', question: 'Which one for the dinner on Friday?', options: [{ id: 'a', img: 'mirror' }, { id: 'b', img: 'friends' }], counts: [4, 2] },
  { type: 'look', id: 'l1', ini: 'SR', name: 'Sara', meta: 'wore it today', plate: 'Wore today', line: 'The camel coat, third time this month. Worth every dirham.', img: 'friends', items: ['blazer', 'trousers', 'pumps'], reactions: 7 },
  { type: 'pick', id: 'p1', ini: 'IK', name: 'Iman', meta: 'dressed you · yesterday', line: 'For the client lunch. Trust me on the flats.', items: ['tank', 'trousers', 'pumps', 'bag'] },
  { type: 'look', id: 'l2', ini: 'NA', name: 'Noor', meta: 'wore it yesterday', plate: 'Wore', line: 'Rest day, but the linen earned an outing.', img: 'closet', items: ['tank', 'trousers'], reactions: 3 },
]

/** The Circle: the today rail, one door to post, four lenses, one ranked column. */
export function CircleScreen({ onFlash }) {
  const [lens, setLens] = React.useState('foryou')
  const [occasion, setOccasion] = React.useState(null)

  const feed = lens === 'saved' ? FEED.filter((p) => p.type === 'look') : lens === 'following' ? FEED.slice(1) : FEED

  return (
    <PageShell>
      <header>
        <p className="zq-rise" style={{ margin: 0, fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow-wide)', color: 'var(--text-accent)' }}>
          The Circle
        </p>
        <h1 className="zq-rise-1" style={{ margin: 'var(--space-1-5) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-3)', fontWeight: 'var(--weight-medium)' }}>Circle</h1>
      </header>

      <div style={{ marginTop: 'var(--space-8)', display: 'grid', gap: 'var(--space-10)', gridTemplateColumns: 'minmax(0, 1fr) 300px', alignItems: 'start' }}>
        {/* ================= main column ================= */}
        <div style={{ maxWidth: '42rem' }}>
          {/* the today rail */}
          <section aria-label="Today in your circle" className="zq-rise-1">
            <div style={{ display: 'flex', gap: 'var(--space-4)', overflowX: 'auto', paddingBottom: 'var(--space-2)', scrollbarWidth: 'none' }}>
              {TODAY.map((t, i) => (
                <button key={t.id} type="button" onClick={() => onFlash(i === 0 ? 'Share what you wore today.' : `${t.name}’s profile.`)} className="zq-press" style={{ width: 64, flexShrink: 0, border: 'none', background: 'none', padding: 0, textAlign: 'center', cursor: 'pointer' }}>
                  <Arch aspect="4/5" photo>
                    <img src={`${IMG_CIRCLE}/${t.img}.webp`} alt="" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                  </Arch>
                  <p style={{ margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-micro)', color: 'var(--text-muted)' }}>{t.name}</p>
                </button>
              ))}
            </div>
          </section>

          {/* one door to post */}
          <div className="zq-rise-1" style={{ marginTop: 'var(--space-4)' }}>
            <MoreMenu
              align="left"
              label="Post to your circle"
              trigger={
                <span style={{ display: 'inline-flex', height: 'var(--control-h)', alignItems: 'center', gap: 'var(--space-2)', borderRadius: 'var(--radius)', background: 'var(--fill-accent)', padding: '0 var(--space-6)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-ui)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-on-brass)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                  Post to your circle
                  <span aria-hidden style={{ opacity: 0.5 }}>&#9662;</span>
                </span>
              }
            >
              <MenuItem onClick={() => onFlash('Shared to your circle.')}>Share a look</MenuItem>
              <MenuItem onClick={() => onFlash('Asked. Your circle will vote.')}>Ask the circle</MenuItem>
              <MenuItem onClick={() => onFlash('Pick pieces from their closet.')}>Style a friend</MenuItem>
            </MoreMenu>
          </div>

          {/* the lens */}
          <div style={{ marginTop: 'var(--space-6)' }}>
            <Tabs label="Feed" value={lens} onChange={setLens} items={LENSES} />
          </div>

          {lens === 'explore' && (
            <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-1)' }}>
              {OCCASIONS.map(([k, l]) => (
                <Filter key={l} on={occasion === k} onClick={() => setOccasion(k)}>{l}</Filter>
              ))}
              <span aria-hidden style={{ margin: '0 var(--space-1)', height: 16, width: 1, background: 'var(--border-field)' }} />
              <Filter on={false}>Kindred taste</Filter>
            </div>
          )}

          {/* one ranked column */}
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {feed.length === 0 ? (
              <div style={{ padding: 'var(--space-12) 0', textAlign: 'center' }}>
                <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-6)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>Your board is empty</p>
                <p style={{ margin: 'var(--space-2) 0 var(--space-5)', fontSize: 'var(--text-ui)', color: 'var(--text-muted)' }}>Tap Save on any look you&rsquo;d wear. It waits here for when you need the idea.</p>
                <Button variant="primary" onClick={() => setLens('foryou')}>Back to the feed</Button>
              </div>
            ) : (
              feed.map((post, i) => (
                <div key={post.id} className="zq-rise-stagger" style={{ '--i': i }}>
                  {post.type === 'verdict' && <VerdictCard post={post} onNote={onFlash} />}
                  {post.type === 'look' && <LookCard post={post} onNote={onFlash} />}
                  {post.type === 'pick' && <PickCard post={post} onNote={onFlash} />}
                </div>
              ))
            )}
            {feed.length > 0 && (
              <Button variant="ghost" style={{ margin: '0 auto' }} onClick={() => onFlash('That’s everything for now.')}>Show more</Button>
            )}
          </div>
        </div>

        {/* ================= side column ================= */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <Card style={{ padding: 'var(--space-4)' }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>You in the circle</p>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-5)' }}>
              <Stat value="6" label="Following" />
              <Stat value="4" label="Followers" />
              <Stat value="3" label="Picks" />
            </div>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button variant="primary" size="sm" onClick={() => onFlash('Three invitations left.')} style={{ width: '100%' }}>Invite a friend</Button>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button variant="ghost" size="sm" onClick={() => onFlash('Following, and followers.')} style={{ flex: 1 }}>People</Button>
                <Button variant="ghost" size="sm" onClick={() => onFlash('Your public profile.')} style={{ flex: 1 }}>Your profile</Button>
              </div>
            </div>
          </Card>

          <Card style={{ padding: 'var(--space-4)' }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>Kindred taste</p>
            <p style={{ margin: 'var(--space-1) 0 var(--space-4)', fontSize: 'var(--text-meta)', color: 'var(--text-muted)' }}>People whose closet reads like yours.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[['LH', 'Layla', '82% match'], ['RQ', 'Rania', '74% match']].map(([ini, name, match]) => (
                <div key={ini} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <Initials>{ini}</Initials>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 'var(--text-ui-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>{name}</p>
                    <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-accent)' }}>{match}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onFlash(`Following ${name}.`)}>Follow</Button>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: 'var(--space-4)' }}>
            <p style={EYEBROW}>Behind the bell</p>
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-ui-sm)', lineHeight: 'var(--leading-body)', color: 'var(--text-muted)' }}>
              Things that happened to you &mdash; verdicts closing, picks waiting, new followers &mdash; live in the notifications bell, not the feed.
            </p>
            <div style={{ marginTop: 'var(--space-3)' }}><Badge tone="quiet">2 waiting</Badge></div>
          </Card>
        </aside>
      </div>
    </PageShell>
  )
}
