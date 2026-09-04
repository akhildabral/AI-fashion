import React from 'react'
import { Wordmark } from '../../components/brand/Wordmark.jsx'
import { Arch } from '../../components/surfaces/Arch.jsx'
import { Card } from '../../components/surfaces/Card.jsx'
import { Plaque } from '../../components/surfaces/Plaque.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Doors } from './Doors.jsx'
import { BeforeAfter } from './BeforeAfter.jsx'

const IMG = '../../assets/imagery'

/** A room: an eyebrow, a Bodoni line, one sentence, and a photograph. */
function Room({ k, title, line, flip = false, children }) {
  return (
    <section style={{ borderTop: 'var(--border-hair) solid var(--border-hairline)', padding: 'var(--space-16) 0' }}>
      <div style={{ display: 'grid', gap: 'var(--space-10)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'center' }}>
        <div style={{ order: flip ? 2 : 1 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--text-accent)' }}>{k}</p>
          <h2 style={{ margin: 'var(--space-2) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-4)', fontWeight: 'var(--weight-medium)', lineHeight: 'var(--leading-display)', textWrap: 'balance' }}>{title}</h2>
          <p style={{ margin: 'var(--space-3) 0 0', maxWidth: '28rem', fontSize: 'var(--text-body)', lineHeight: 'var(--leading-body)', color: 'var(--text-muted)' }}>{line}</p>
        </div>
        <div style={{ order: flip ? 1 : 2 }}>{children}</div>
      </div>
    </section>
  )
}

function Photo({ name, alt, tall = false, children }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius)', background: 'var(--surface-raised)', aspectRatio: tall ? '3 / 4' : '4 / 3' }}>
      <img src={`${IMG}/${name}.webp`} alt={alt} loading="lazy" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
      {children}
    </div>
  )
}

const OUTFIT = [['blazer', 'Blazer'], ['tank', 'Tank'], ['trousers', 'Trousers'], ['pumps', 'Pumps']]

/**
 * The front door. A walk through the rooms — the morning, the mirror, the
 * ledger, the store, the circle — with two doors at the end. Short lines; the
 * photographs do the talking.
 */
export function LandingScreen() {
  return (
    <div style={{ margin: '0 auto', maxWidth: 'var(--shell)', padding: '0 var(--space-6)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 'var(--header-h)' }}>
        <Wordmark size={19} color="var(--text-strong)" />
        <Button variant="ghost" size="sm">Sign in</Button>
      </header>

      <section style={{ display: 'grid', alignItems: 'center', gap: 'var(--space-10)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', padding: 'var(--space-16) 0 var(--space-20)' }}>
        <div>
          <p className="zq-rise" style={{ margin: 0, fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow-wide)', color: 'var(--text-accent)' }}>
            A personal stylist for the clothes you own
          </p>
          <h1 className="zq-rise-1" style={{ margin: 'var(--space-4) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-2)', fontWeight: 'var(--weight-medium)', lineHeight: 'var(--leading-display-tight)', letterSpacing: 'var(--tracking-display)', textWrap: 'balance' }}>
            Every morning, an outfit. <em style={{ color: 'var(--text-accent)' }}>Already waiting.</em>
          </h1>
          <p className="zq-rise-2" style={{ margin: 'var(--space-5) 0 0', maxWidth: '32rem', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontStyle: 'italic', color: 'var(--text-muted)' }}>
            It knows your closet. It lays out the look, shows it on you, and keeps score of what you wear.
          </p>
          <div className="zq-rise-3" style={{ marginTop: 'var(--space-8)' }}>
            <Doors />
          </div>
        </div>
        <div className="zq-rise-2" style={{ margin: '0 auto', width: '100%', maxWidth: '24rem' }}>
          <Arch aspect="3/4" photo style={{ width: '100%' }}>
            <img src={`${IMG}/mirror.webp`} alt="A reflection in an arched brass mirror" style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'cover' }} />
          </Arch>
        </div>
      </section>

      <Room k="The morning" title={<>Open the app. <em style={{ color: 'var(--text-accent)' }}>It&rsquo;s laid out.</em></>} line="For the day you have and the weather outside, from what&rsquo;s clean.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
          {OUTFIT.map(([n, label]) => (
            <div key={n}>
              <Arch aspect="3/4" style={{ width: '100%' }}>
                <img src={`${IMG}/${n}.webp`} alt={label} loading="lazy" style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%', objectFit: 'contain', padding: '9%', boxSizing: 'border-box' }} />
              </Arch>
              <p style={{ margin: 'var(--space-2) 0 0', textAlign: 'center', fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      </Room>

      <Room flip k="The mirror" title={<>See it on you <em style={{ color: 'var(--text-accent)' }}>first.</em></>} line="Any outfit, on your own photo. Drag the seam.">
        <BeforeAfter src={`${IMG}/mirror.webp`} />
      </Room>

      <Room k="The ledger" title={<>Your closet, <em style={{ color: 'var(--text-accent)' }}>working.</em></>} line="Every wear logged. Every piece earning its keep.">
        <Photo name="closet" alt="A wardrobe lit by one lamp" tall>
          <div style={{ position: 'absolute', left: 'var(--space-4)', right: 'var(--space-4)', bottom: 'var(--space-4)' }}>
            <Plaque label="Your closet is working" value="AED 41,460" note="earned back this month" />
          </div>
        </Photo>
      </Room>

      <Room flip k="The store" title={<>Point your camera <em style={{ color: 'var(--text-accent)' }}>at it.</em></>} line="Does it go with what you own? Your closet answers before you pay.">
        <Photo name="store" alt="A phone held up to a coat in a boutique">
          <div style={{ position: 'absolute', left: 'var(--space-4)', right: 'var(--space-4)', bottom: 'var(--space-4)' }}>
            <Card style={{ padding: 'var(--space-4)' }}>
              <p style={{ margin: 0, fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'var(--text-accent)' }}>In the store</p>
              <p style={{ margin: 'var(--space-1) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', color: 'var(--text-strong)' }}>
                Goes with <em style={{ color: 'var(--text-accent)' }}>7 of your pieces</em>. Unlocks 4 outfits.
              </p>
            </Card>
          </div>
        </Photo>
      </Room>

      <Room k="The circle" title={<>A few people <em style={{ color: 'var(--text-accent)' }}>you trust.</em></>} line="Ask which. Let a friend dress you. Invite-only, five invites each.">
        <Photo name="friends" alt="Two friends comparing outfits on a phone" />
      </Room>

      <section style={{ borderTop: 'var(--border-hair) solid var(--border-hairline)', padding: 'var(--space-16) 0' }}>
        <Photo name="morning" alt="An outfit laid out on a chair at dawn">
          <span style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'rgb(236 229 216 / 0.8)' }}>The first morning</span>
        </Photo>
        <p style={{ margin: 'var(--space-10) 0 0', fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--text-accent)' }}>How it gets in</p>
        <h2 style={{ margin: 'var(--space-2) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-4)', fontWeight: 'var(--weight-medium)' }}>
          Invite-only, <em style={{ color: 'var(--text-accent)' }}>on purpose.</em>
        </h2>
        <ol style={{ margin: 'var(--space-6) 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {[['1', 'A friend&rsquo;s invite, or the waitlist.'], ['2', 'A three-minute fitting.'], ['3', 'Tomorrow, an outfit is waiting.']].map(([n, t]) => (
            <li key={n} style={{ borderTop: 'var(--border-hair) solid var(--border-control)', paddingTop: 'var(--space-3)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-6)', color: 'var(--text-accent)' }}>{n}</span>
              <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-body)', color: 'var(--text-body)' }} dangerouslySetInnerHTML={{ __html: t }} />
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 'var(--space-8)' }}>
          <Doors compact />
        </div>
      </section>

      <footer style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', borderTop: 'var(--border-hair) solid var(--border-hairline)', padding: 'var(--space-8) 0', fontSize: 'var(--text-meta)', color: 'var(--text-faint)' }}>
        <p style={{ margin: 0, maxWidth: '32rem' }}>
          <span style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--text-body)' }}>Your photo is yours.</span> Delete it any time, and every render made from it goes with it.
        </p>
        <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0 var(--space-4)' }}>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <span>Already a member? <a href="#" style={{ fontWeight: 'var(--weight-semibold)' }}>Sign in</a></span>
        </p>
      </footer>
    </div>
  )
}
