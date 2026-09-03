import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { Arch } from '../components/ui'
import { money } from '../lib/money'

// The front door. A walk through the rooms — the morning, the mirror, the
// ledger, the store, the circle — with two doors: the waitlist, and a
// friend's invite. Short lines; the photographs do the talking.

const A = '/landing'

function Doors({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch<{ message: string }>('/auth/waitlist', { method: 'POST', body: { email: email.trim() }, auth: false })
      setDone(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the waitlist.')
    } finally {
      setBusy(false)
    }
  }

  function comeIn(e: FormEvent) {
    e.preventDefault()
    const c = code.trim().toLowerCase().replace(/^.*\/join\//, '')
    if (c) navigate(`/join/${encodeURIComponent(c)}`)
  }

  if (done) {
    return (
      <div className="max-w-md rounded-[3px] border border-brass/30 bg-iris-soft/60 px-5 py-4">
        <p className="font-display text-lg font-medium text-ink">You’re on the list.</p>
        <p className="mt-1 text-sm text-ink/60">{done}</p>
      </div>
    )
  }

  return (
    <div className={`flex max-w-md flex-col gap-3 ${compact ? '' : ''}`}>
      <form onSubmit={join} className="flex gap-2">
        <label htmlFor={compact ? 'email-2' : 'email'} className="sr-only">
          Email
        </label>
        <input id={compact ? 'email-2' : 'email'} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="field min-w-0 flex-1" />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {busy ? <Spinner className="h-4 w-4" /> : 'Join the waitlist'}
        </button>
      </form>
      {error && <p className="alert-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <button type="button" onClick={() => setCodeOpen((v) => !v)} className="press font-semibold text-brass underline-offset-4 hover:underline">
          Have an invite? Come in →
        </button>
        <span className="text-ink/45">Invite-only while we grow.</span>
      </div>
      {codeOpen && (
        <form onSubmit={comeIn} className="flex gap-2">
          <label htmlFor={compact ? 'code-2' : 'code'} className="sr-only">
            Invite code
          </label>
          <input id={compact ? 'code-2' : 'code'} autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="your friend’s code or link" className="field field-sm min-w-0 flex-1" />
          <button type="submit" className="btn-ghost btn-sm shrink-0">
            Come in
          </button>
        </form>
      )}
    </div>
  )
}

/** Drag the seam: the photo before the Mirror, and after. */
function BeforeAfter() {
  const [cut, setCut] = useState(52)
  return (
    <Arch aspect="aspect-[3/4]" className="arch-photo w-full">
      <div className="relative h-full w-full select-none">
        <img src={`${A}/mirror.webp`} alt="" width={1024} height={1024} className="absolute inset-0 z-[1] h-full w-full object-cover grayscale brightness-[0.55] blur-[1px]" />
        <img src={`${A}/mirror.webp`} alt="Dressed, in the Mirror" width={1024} height={1024} className="absolute inset-0 z-[2] h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${cut}%)` }} />
        <div aria-hidden className="absolute inset-y-0 z-[3] w-0.5 bg-brass" style={{ left: `${cut}%`, transform: 'translateX(-1px)' }}>
          <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[3px] bg-brass text-[11px] font-bold text-on-brass">⇔</span>
        </div>
        <span className="absolute bottom-3 left-3 z-[3] text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ECE5D8]/85">Before</span>
        <span className="absolute bottom-3 right-3 z-[3] text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ECE5D8]/85">After</span>
        <input type="range" min={8} max={92} value={cut} onChange={(e) => setCut(Number(e.target.value))} aria-label="Before and after" className="absolute inset-0 z-[4] h-full w-full cursor-ew-resize opacity-0" />
      </div>
    </Arch>
  )
}

function Room({ k, title, line, children, flip = false }: { k: string; title: React.ReactNode; line: string; children: React.ReactNode; flip?: boolean }) {
  return (
    <section className="border-t border-ink/10 py-12 sm:py-16">
      <div className={`grid items-center gap-10 md:grid-cols-2 ${flip ? 'md:[&>*:first-child]:order-2' : ''}`}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">{k}</p>
          <h2 className="mt-2 font-display text-3xl font-medium leading-[1.04] text-ink sm:text-4xl [text-wrap:balance]">{title}</h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink/60">{line}</p>
        </div>
        <div>{children}</div>
      </div>
    </section>
  )
}

function Photo({ name, alt, tall = false, children }: { name: string; alt: string; tall?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-[3px] bg-surface ${tall ? 'aspect-[3/4]' : 'aspect-[4/3]'}`}>
      <img src={`${A}/${name}.webp`} alt={alt} width={1024} height={1024} loading="lazy" className="h-full w-full object-cover" />
      {children}
    </div>
  )
}

const OUTFIT = [
  ['blazer', 'Blazer'],
  ['tank', 'Tank'],
  ['trousers', 'Trousers'],
  ['pumps', 'Pumps'],
] as const

export function LandingPage() {
  usePageTitle('Every morning, an outfit')
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* ---- hero: the mirror, and the doors ---- */}
      <section className="grid items-center gap-10 py-12 md:grid-cols-[1.05fr_0.95fr] md:py-20">
        <div>
          <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">A personal stylist for the clothes you own</p>
          <h1 className="mt-4 animate-rise-1 font-display text-5xl font-medium leading-[0.98] tracking-[-0.01em] text-ink sm:text-6xl lg:text-7xl [text-wrap:balance]">
            Every morning, an outfit. <em className="text-brass">Already waiting.</em>
          </h1>
          <p className="mt-5 max-w-lg animate-rise-2 font-display text-lg italic text-ink/60 sm:text-xl">It knows your closet. It lays out the look, shows it on you, and keeps score of what you wear.</p>
          <div className="mt-8 animate-rise-3">
            <Doors />
          </div>
        </div>
        <div className="mx-auto w-full max-w-sm animate-rise-2 md:max-w-none">
          <Arch aspect="aspect-[3/4]" className="arch-photo w-full">
            <img src={`${A}/mirror.webp`} alt="A reflection in an arched brass mirror" width={1024} height={1024} className="relative z-[1] h-full w-full object-cover" />
          </Arch>
        </div>
      </section>

      {/* ---- the morning ---- */}
      <Room k="The morning" title={<>Open the app. <em className="text-brass">It’s laid out.</em></>} line="For the day you have and the weather outside, from what’s clean.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {OUTFIT.map(([n, label]) => (
            <div key={n}>
              <Arch aspect="aspect-[3/4]" className="w-full">
                <img src={`${A}/${n}.webp`} alt={label} width={480} height={600} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[9%]" />
              </Arch>
              <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/55">{label}</p>
            </div>
          ))}
        </div>
      </Room>

      {/* ---- the mirror ---- */}
      <Room flip k="The mirror" title={<>See it on you <em className="text-brass">first.</em></>} line="Any outfit, on your own photo. Drag the seam.">
        <BeforeAfter />
      </Room>

      {/* ---- the ledger ---- */}
      <Room k="The ledger" title={<>Your closet, <em className="text-brass">working.</em></>} line="Every wear logged. Every piece earning its keep.">
        <Photo name="closet" alt="A wardrobe lit by one lamp" tall>
          <div className="plaque absolute inset-x-4 bottom-4 p-4 pl-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">Your closet is working</p>
            <p className="mt-1 font-display text-4xl font-medium text-brass [font-variant-numeric:tabular-nums]">
              {money(41460, { currency: 'AED' })} <span className="font-sans text-sm font-normal text-ink/55">earned back this month</span>
            </p>
          </div>
        </Photo>
      </Room>

      {/* ---- the store ---- */}
      <Room flip k="The store" title={<>Point your camera <em className="text-brass">at it.</em></>} line="Does it go with what you own? The closet answers before you buy.">
        <Photo name="store" alt="A phone held up to a coat in a boutique">
          <div className="card absolute inset-x-4 bottom-4 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">In the store</p>
            <p className="mt-1 font-display text-lg text-ink">
              Goes with <em className="text-brass">7 of your pieces</em>. Unlocks 4 outfits.
            </p>
          </div>
        </Photo>
      </Room>

      {/* ---- the circle ---- */}
      <Room k="The circle" title={<>A few people <em className="text-brass">you trust.</em></>} line="Ask which. Let a friend dress you. Invite-only, five invites each.">
        <Photo name="friends" alt="Two friends comparing outfits on a phone" />
      </Room>

      {/* ---- how it gets in ---- */}
      <section className="border-t border-ink/10 py-12 sm:py-16">
        <Photo name="morning" alt="An outfit laid out on a chair at dawn">
          <span className="absolute bottom-3 left-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ECE5D8]/80">The first morning</span>
        </Photo>
        <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">How it gets in</p>
        <h2 className="mt-2 font-display text-3xl font-medium leading-[1.04] text-ink sm:text-4xl">
          Invite-only, <em className="text-brass">on purpose.</em>
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ['1', 'A friend’s invite, or the waitlist.'],
            ['2', 'A three-minute fitting.'],
            ['3', 'Tomorrow, an outfit is waiting.'],
          ].map(([n, t]) => (
            <li key={n} className="border-t border-ink/20 pt-3">
              <span className="font-display text-2xl text-brass">{n}</span>
              <p className="mt-1 text-[15px] text-ink/75">{t}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <Doors compact />
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 py-8 text-xs text-ink/45">
        <p className="max-w-lg">
          <span className="font-semibold text-ink/70">Your photo is yours.</span> Delete it any time, and every render made from it goes with it.
        </p>
        <p className="flex flex-wrap items-center gap-x-4">
          <Link to="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-ink">
            Terms
          </Link>
          <span>
            Already a member?{' '}
            <Link to="/login" className="font-semibold text-brass underline-offset-4 hover:underline">
              Sign in
            </Link>
          </span>
        </p>
      </footer>
    </div>
  )
}
