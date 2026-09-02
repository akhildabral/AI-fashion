import { money } from '../lib/money'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { addCandidate, deleteWardrobeItem, getVerdict, updateWardrobeItem, type VerdictResponse } from '../lib/wardrobe'
import { PageShell, Toast, useFlash } from '../components/ui'
import { LookBoard } from '../components/LookBoard'
import { resolveImageUrl } from '../lib/api'
import type { WardrobeItem } from '../lib/types'

// In the store: hold a piece up to the camera and the whole closet answers.
// One frame, no form. The same extraction that catalogues your closet reads
// it; the pairing engine gives a number you can act on; keep it in mind,
// pass, or buy it.

type Stage = 'viewfinder' | 'reading' | 'verdict' | 'kept' | 'bought' | 'failed'

const READING_LINES = ['Cutting it out…', 'Reading the colour and cut…', 'Checking it against your closet…']

function inr(n: number): string {
  return money(n)
}

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    const d = 900
    let raf = 0
    const f = (t: number) => {
      const p = Math.min(1, (t - t0) / d)
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{v}</>
}

export function StorePage() {
  usePageTitle('In the store')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { toast, flash } = useFlash()
  const [stage, setStage] = useState<Stage>('viewfinder')
  const [preview, setPreview] = useState<string | null>(null)
  const [piece, setPiece] = useState<WardrobeItem | null>(null)
  const [verdict, setVerdict] = useState<VerdictResponse | null>(null)
  const [line, setLine] = useState(0)
  const [store, setStore] = useState('')
  const [price, setPrice] = useState('')
  const [nudge, setNudge] = useState<'2w' | 'none'>('2w')
  const [busy, setBusy] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  // Re-open a wishlist piece's verdict: /closet/store?item=…
  useEffect(() => {
    const id = params.get('item')
    if (!id) return
    setStage('reading')
    void read(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  useEffect(() => {
    if (stage !== 'reading') return
    const t = window.setInterval(() => setLine((n) => (n + 1) % READING_LINES.length), 1500)
    return () => window.clearInterval(t)
  }, [stage])

  async function read(id: string) {
    // Poll until the cut-out and tags are in, then ask for the verdict.
    for (let i = 0; i < 40; i++) {
      try {
        const r = await getVerdict(id)
        if (r.status === 'ready') {
          setPiece(r.piece)
          setVerdict(r)
          setStage('verdict')
          return
        }
        if (r.status === 'failed') {
          setStage('failed')
          return
        }
      } catch {
        /* keep polling */
      }
      await new Promise((res) => setTimeout(res, 2500))
    }
    setStage('failed')
  }

  async function onShot(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setStage('reading')
    try {
      const r = await addCandidate(file)
      const first = r.items?.[0] ?? r.item
      if (!first) throw new Error('Nothing was read from that photo.')
      setPiece(first)
      await read(first.id)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read that piece.')
      setStage('viewfinder')
    }
  }

  async function keep() {
    if (!piece) return
    setBusy(true)
    try {
      const nudgeAt = nudge === '2w' ? new Date(Date.now() + 14 * 86_400_000).toISOString() : null
      await updateWardrobeItem(piece.id, { store: store.trim() || null, seenPrice: price ? Number(price) : null, nudgeAt })
      setStage('kept')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not keep that.')
    } finally {
      setBusy(false)
    }
  }
  async function pass() {
    if (!piece) return
    setBusy(true)
    try {
      await deleteWardrobeItem(piece.id)
      flash('Passed. Nothing kept.')
      reset()
    } finally {
      setBusy(false)
    }
  }
  async function bought() {
    if (!piece) return
    setBusy(true)
    try {
      await updateWardrobeItem(piece.id, { owned: true, store: store.trim() || null, seenPrice: price ? Number(price) : null })
      setStage('bought')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not move it in.')
    } finally {
      setBusy(false)
    }
  }
  function reset() {
    setStage('viewfinder')
    setPreview(null)
    setPiece(null)
    setVerdict(null)
    setStore('')
    setPrice('')
  }

  const label = piece ? [piece.primaryColor, piece.subtype ?? piece.category].filter(Boolean).join(' ') : 'this piece'
  const v = verdict?.status === 'ready' ? verdict : null

  return (
    <PageShell narrow>
      <Toast msg={toast} />
      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={(e) => void onShot(e)} className="hidden" />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => void onShot(e)} className="hidden" />

      {/* Viewfinder: the words and the actions on one side, the frame on the other */}
      {stage === 'viewfinder' && (
        <div className="animate-rise grid gap-8 md:grid-cols-[minmax(0,1fr)_300px] md:grid-rows-[auto_auto] md:items-start md:gap-x-12 md:gap-y-6">
          <div className="min-w-0 md:col-start-1 md:row-start-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">In the store</p>
            <h1 className="mt-1 font-display text-5xl font-medium leading-[1.0] text-ink sm:text-6xl">
              Hold it <em className="text-brass">up.</em>
            </h1>
            <p className="mt-4 max-w-md font-display text-lg italic text-ink/60">One clear shot of the piece; the label can wait. Your closet answers in a moment.</p>
            <div className="action-row mt-6">
              <button type="button" onClick={() => camera.current?.click()} className="btn-primary">
                Open the camera
              </button>
              <button type="button" onClick={() => gallery.current?.click()} className="btn-ghost">
                Choose a photo
              </button>
              <button type="button" onClick={() => navigate('/closet')} className="btn-quiet">
                Back to the closet
              </button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[260px] md:col-start-2 md:row-span-2 md:row-start-1 md:max-w-none md:self-center">
            <div className="arch-bezel aspect-[3/4]">
              <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: '46% 46% 5px 5px / 28% 28% 5px 5px', background: 'radial-gradient(90% 70% at 50% 40%, #2a2620, #0b0a08 90%)' }}>
                <div className="pointer-events-none absolute inset-[16%_14%_24%]">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} className={`absolute h-5 w-5 border-brass ${i === 0 ? 'left-0 top-0 border-l-2 border-t-2' : i === 1 ? 'right-0 top-0 border-r-2 border-t-2' : i === 2 ? 'bottom-0 left-0 border-b-2 border-l-2' : 'bottom-0 right-0 border-b-2 border-r-2'}`} />
                  ))}
                </div>
                <p className="absolute inset-x-0 bottom-6 text-center font-display text-sm italic text-[#ECE5D8]/70">the piece, in the frame</p>
              </div>
            </div>
          </div>
          <div className="min-w-0 md:col-start-1 md:row-start-2">
            <ol className="max-w-md space-y-3 border-t border-ink/10 pt-6 text-sm text-ink/60">
              <li className="flex gap-3">
                <span className="w-5 shrink-0 font-display text-base text-brass">1</span>
                <span>
                  <b className="font-semibold text-ink">One shot.</b> The same reading that catalogues your closet reads the piece: colour, cut, warmth.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 shrink-0 font-display text-base text-brass">2</span>
                <span>
                  <b className="font-semibold text-ink">The closet answers.</b> How many outfits it unlocks, what it goes with, and what each wear would cost.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 shrink-0 font-display text-base text-brass">3</span>
                <span>
                  <b className="font-semibold text-ink">Keep it in mind, pass, or buy.</b> A kept piece waits on your wishlist and nudges you in a fortnight.
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Reading */}
      {stage === 'reading' && (
        <div className="animate-rise">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">In the store</p>
          <h1 className="mt-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">Reading the piece…</h1>
          <p className="mt-3 font-display text-lg italic text-ink/60" aria-live="polite">
            {READING_LINES[line]}
          </p>
          <div className="arch-bezel mt-8 aspect-[3/4] max-w-[320px]">
            <div className="arch-niche relative h-full w-full">
              {preview && <img src={preview} alt="" className="relative z-[1] h-full w-full object-cover opacity-60 blur-[1px]" />}
              <span className="animate-filament absolute left-1/2 top-0 z-[2] h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brass/70 to-transparent" />
            </div>
          </div>
        </div>
      )}

      {/* Failed */}
      {stage === 'failed' && (
        <div className="animate-rise">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">In the store</p>
          <h1 className="mt-1 font-display text-4xl font-medium leading-[1.0] text-ink">That one didn’t read.</h1>
          <p className="mt-3 max-w-md font-display text-lg italic text-ink/60">Try a shot with the whole piece in frame, on a plain background if you can.</p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => void pass().then(reset)} className="btn-primary">
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Verdict */}
      {stage === 'verdict' && v && piece && (
        <div>
          <p className="animate-rise text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">{label}</p>
          <h1 className="mt-1 animate-rise-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">
            {v.verdict.outfits >= 3 ? (
              <>
                It <em className="text-brass">earns its place.</em>
              </>
            ) : v.verdict.outfits > 0 ? (
              <>
                It <em className="text-brass">could work.</em>
              </>
            ) : (
              <>
                Not <em className="text-brass">yet.</em>
              </>
            )}
          </h1>
          <div className="mt-5 flex animate-rise-2 items-end gap-3">
            <span className="font-display text-7xl leading-none text-brass [font-variant-numeric:tabular-nums]">
              <CountUp to={v.verdict.outfits} />
            </span>
            <span className="pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/50">outfit{v.verdict.outfits === 1 ? '' : 's'} with what you own</span>
          </div>
          <p className="mt-2 animate-rise-2 text-sm text-ink/60">
            Pairs with <b className="text-ink">{v.verdict.pairs} of your {v.verdict.closetSize}</b> pieces.
            {v.verdict.outfits === 0 && v.verdict.closetSize > 0 && ' The closet needs a bottom or shoes that meet it halfway.'}
          </p>

          {/* The piece and its outfits */}
          <div className="mt-6 grid animate-rise-3 grid-cols-[96px_1fr] gap-4">
            <div className="arch-bezel aspect-[5/6]">
              <div className="arch-niche h-full w-full">
                <img src={resolveImageUrl(piece.imageUrl)} alt={label} className="relative z-[1] h-full w-full object-contain p-[8%]" />
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
              {v.outfits.map((o, i) => (
                <div key={i} className="w-[220px] flex-none">
                  <LookBoard items={[...o.items, piece]} />
                </div>
              ))}
              {v.outfits.length === 0 && <p className="self-center font-display text-base italic text-ink/50">No complete outfit yet.</p>}
            </div>
          </div>

          {v.closest && (
            <div className="plaque mt-5 animate-rise-3 p-4 pl-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Worth knowing</p>
              <p className="mt-1 text-sm text-ink">
                Closest thing you own: the {[v.closest.item.primaryColor, v.closest.item.subtype ?? v.closest.item.category].filter(Boolean).join(' ')}
                {v.closest.wears > 0 ? `, worn ${v.closest.wears}×` : ', never worn'}.{' '}
                <span className="text-ink/55">{v.closest.likeness >= 6 ? 'Close to a duplicate.' : 'Not a duplicate.'}</span>
              </p>
            </div>
          )}
          {v.unlockLine && (
            <div className="plaque mt-3 animate-rise-3 p-4 pl-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">It would unlock more</p>
              <p className="mt-1 text-sm text-ink">{v.unlockLine}</p>
            </div>
          )}

          {/* Where and how much — optional, one line */}
          <div className="mt-5 grid animate-rise-3 grid-cols-[1fr_120px] gap-2">
            <input value={store} onChange={(e) => setStore(e.target.value)} className="field" placeholder="Where you saw it (optional)" />
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className="field" placeholder="₹ price" />
          </div>

          <div className="action-row mt-5 animate-rise-3">
            <button type="button" disabled={busy} onClick={() => void keep()} className="btn-primary">
              Keep in mind
            </button>
            <button type="button" disabled={busy} onClick={() => void pass()} className="btn-ghost">
              Pass
            </button>
            <button type="button" disabled={busy} onClick={() => void bought()} className="btn-quiet ml-auto">
              I’m buying it
            </button>
          </div>
          <label className="mt-3 flex animate-rise-3 items-center gap-2 text-xs text-ink/50">
            <input type="checkbox" checked={nudge === '2w'} onChange={(e) => setNudge(e.target.checked ? '2w' : 'none')} className="h-3.5 w-3.5 accent-[#B98C3B]" />
            Nudge me in two weeks if it’s still on my mind
          </label>
        </div>
      )}

      {/* Kept */}
      {stage === 'kept' && piece && (
        <div className="animate-rise">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">Wishlist</p>
          <h1 className="mt-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">
            Kept <em className="text-brass">in mind.</em>
          </h1>
          <p className="mt-3 max-w-md font-display text-lg italic text-ink/60">
            The {label} is in your wishlist with its verdict{price ? `, ${inr(Number(price))}` : ''}
            {store.trim() ? `, seen at ${store.trim()}` : ''}. The stylist reads it too: if the brief is ever one piece short, it says which.
          </p>
          <div className="action-row mt-6">
            <button type="button" onClick={reset} className="btn-primary">
              Point at another
            </button>
            <button type="button" onClick={() => navigate('/closet/wishlist')} className="btn-ghost">
              See the wishlist
            </button>
          </div>
        </div>
      )}

      {/* Bought */}
      {stage === 'bought' && piece && (
        <div className="animate-rise">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">Closet · Pieces</p>
          <h1 className="mt-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">
            In the <em className="text-brass">closet.</em>
          </h1>
          <p className="mt-3 max-w-md font-display text-lg italic text-ink/60">The {label} is a piece now. Its outfits are in the Outfits room, and tomorrow’s brief already knows it’s there.</p>
          <div className="action-row mt-6">
            <button type="button" onClick={() => navigate(`/closet/compose?pin=${piece.id}`)} className="btn-primary">
              Wear it first with…
            </button>
            <button type="button" onClick={() => navigate('/closet')} className="btn-ghost">
              Back to the closet
            </button>
            <button type="button" onClick={reset} className="btn-quiet">
              Point at another
            </button>
          </div>
        </div>
      )}
    </PageShell>
  )
}
