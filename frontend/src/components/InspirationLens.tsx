import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'
import { generateLooks, getLooks, recreateLook, setLookVerdict, tryOnLook, type InspirationLook, type RecreateLookResponse } from '@zauq/shared/looks'
import type { TryOn } from '@zauq/shared/types'
import { Arch, Modal } from './ui'
import { Spinner } from './Spinner'

const CHIPS: { key: string; label: string; ask?: string }[] = [
  { key: 'surprise', label: 'Surprise me' },
  { key: 'tonight', label: 'Tonight', ask: 'an evening out tonight' },
  { key: 'weekend', label: 'A weekend away', ask: 'a weekend away, easy and put together' },
  { key: 'bolder', label: 'Bolder than usual', ask: 'a step bolder than my usual' },
  { key: 'warm', label: 'Somewhere warm', ask: 'a warm place, sun and light fabrics' },
]

const WAIT_LINES = ['Sketching two looks…', 'Choosing the fabrics…', 'Painting them on a model…']

/**
 * Inspiration: looks you don't own, for the fun of it. Ask for a mood, a
 * place or a surprise; two looks arrive on a neutral model. Each has three
 * doors: see it on you (the glass, beside), make it from your closet, keep
 * it or throw it back. Kept looks wait in a row below.
 */
export function InspirationLens({
  hasPhoto,
  onRender,
  onNote,
}: {
  hasPhoto: boolean
  /** A queued look render for the glass to poll. */
  onRender: (tryOn: TryOn) => void
  onNote: (msg: string) => void
}) {
  const navigate = useNavigate()
  const [ask, setAsk] = useState('')
  const [chip, setChip] = useState<string>('surprise')
  const [looks, setLooks] = useState<InspirationLook[]>([])
  const [kept, setKept] = useState<InspirationLook[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [line, setLine] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [closetFor, setClosetFor] = useState<InspirationLook | null>(null)
  const [closet, setCloset] = useState<RecreateLookResponse | null>(null)

  useEffect(() => {
    void getLooks(true).then((r) => setKept(r.looks)).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (busy !== 'ask') return
    setLine(0)
    const t = window.setInterval(() => setLine((n) => (n + 1) % WAIT_LINES.length), 3500)
    return () => window.clearInterval(t)
  }, [busy])

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    setBusy('ask')
    setError(null)
    try {
      const text = ask.trim() || CHIPS.find((c) => c.key === chip)?.ask
      const r = await generateLooks(text ? { occasion: text } : { surprise: true })
      setLooks(r.looks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The stylist could not sketch that. Try another ask.')
    } finally {
      setBusy(null)
    }
  }

  async function verdict(look: InspirationLook, v: 'keep' | 'no') {
    const next = look.verdict === v ? null : v
    try {
      const { look: updated } = await setLookVerdict(look.id, next)
      const apply = (l: InspirationLook) => (l.id === updated.id ? updated : l)
      setLooks((ls) => ls.map(apply))
      setKept((ks) => (updated.verdict === 'keep' ? [updated, ...ks.filter((k) => k.id !== updated.id)] : ks.filter((k) => k.id !== updated.id)))
      if (next === 'keep') onNote('Kept. The stylist takes note.')
      if (next === 'no') onNote('Thrown back. Noted, and not repeated.')
    } catch {
      onNote('Could not save that.')
    }
  }

  async function seeOnMe(look: InspirationLook) {
    if (!hasPhoto) {
      onNote('Add a photo of yourself in the glass first.')
      return
    }
    setBusy(`on:${look.id}`)
    try {
      const { tryOn, cached } = await tryOnLook(look.id)
      onRender(tryOn)
      onNote(cached ? 'Already rendered. Here it is.' : 'Dressing you in it. Half a minute.')
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not render that.')
    } finally {
      setBusy(null)
    }
  }

  async function fromCloset(look: InspirationLook) {
    setClosetFor(look)
    setCloset(null)
    try {
      setCloset(await recreateLook(look.id))
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not look through the closet.')
      setClosetFor(null)
    }
  }

  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">Inspiration</p>
      <h2 className="mt-2 font-display text-3xl font-medium leading-none text-ink">
        A look <em className="text-brass">for the fun of it.</em>
      </h2>
      <p className="mt-2 max-w-xl text-sm text-ink/55">Not from your closet. A mood, a place, an evening, or a surprise. Two looks on a model; see them on you, or make them from what you own.</p>

      <form onSubmit={(e) => void submit(e)} className="mt-4">
        <label htmlFor="inspire-ask" className="sr-only">
          A mood, a place, an occasion
        </label>
        <div className="flex max-w-xl gap-2">
          <input id="inspire-ask" value={ask} onChange={(e) => setAsk(e.target.value)} className="field" placeholder="a rooftop in October, bolder than I’d dare…" disabled={busy === 'ask'} />
          <button type="submit" disabled={busy === 'ask'} className="btn-primary">
            {busy === 'ask' ? (
              <>
                <Spinner className="mr-2 h-4 w-4" /> {WAIT_LINES[line]}
              </>
            ) : (
              'Two looks'
            )}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button key={c.key} type="button" disabled={busy === 'ask'} onClick={() => { setChip(c.key); setAsk('') }} className={`chip ${chip === c.key && !ask ? 'chip-on' : ''}`}>
              {c.label}
            </button>
          ))}
        </div>
        {error && (
          <p className="mt-3 alert-error" role="alert">
            {error}
          </p>
        )}
      </form>

      {looks.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {looks.map((look) => (
            <LookCard key={look.id} look={look} busy={busy} hasPhoto={hasPhoto} onSee={() => void seeOnMe(look)} onCloset={() => void fromCloset(look)} onVerdict={(v) => void verdict(look, v)} />
          ))}
        </div>
      )}

      {kept.length > 0 && (
        <div className="mt-8 border-t border-ink/10 pt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">Kept</p>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {kept.map((k) => (
              <button key={k.id} type="button" onClick={() => setLooks((ls) => (ls.some((l) => l.id === k.id) ? ls : [k, ...ls]))} className="press w-24 shrink-0 text-left" title={k.outfit.title ?? k.occasion}>
                <Arch className="arch-photo" aspect="aspect-[3/4]">
                  {k.imageUrl ? <img src={resolveImageUrl(k.imageUrl)} alt={k.outfit.title ?? ''} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center p-2 text-center font-display text-xs italic text-ink/50">{k.outfit.title}</span>}
                </Arch>
                <p className="mt-1.5 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/70">{k.outfit.title ?? k.occasion}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <Modal open={Boolean(closetFor)} onClose={() => setClosetFor(null)} title="From my closet">
        {closetFor && (
          <div>
            <p className="font-display text-lg italic text-ink/70">{closetFor.outfit.title ?? closetFor.occasion}</p>
            {!closet ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-ink/55">
                <Spinner className="h-4 w-4" /> Looking through your closet…
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink/70">
                  {closet.pairs.length === 0
                    ? 'None of it is in your closet yet.'
                    : `${closet.pairs.length} of ${closet.pairs.length + closet.missing.length} pieces ${closet.pairs.length === 1 ? 'is' : 'are'} yours${closet.missing.length ? '; the rest is what you’d need' : ''}.`}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {closet.pairs.map((p) => (
                    <div key={p.item.id} className="text-center">
                      <Arch aspect="aspect-[5/6]">
                        <img src={resolveImageUrl(p.item.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[7%]" />
                      </Arch>
                      <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/70">{p.item.subtype ?? p.item.category}</p>
                      <p className="truncate text-[10px] text-brass">{p.band === 'sure' ? 'yours' : `close · for the ${p.piece.subtype}`}</p>
                    </div>
                  ))}
                  {closet.missing.map((m, i) => (
                    <div key={i} className="text-center">
                      <Arch aspect="aspect-[5/6]">
                        {/* The niche is bone in both themes; the ink token is not. */}
                        <span className="grid h-full place-items-center p-2 text-center font-display text-[11px] italic leading-tight" style={{ color: '#6b5f4a' }}>{m.color} {m.subtype}</span>
                      </Arch>
                      <p className="mt-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/70">{m.subtype}</p>
                      <p className="truncate text-[10px] text-[rgb(var(--c-danger))]">missing</p>
                    </div>
                  ))}
                </div>
                <div className="action-row mt-5">
                  {closet.itemIds.length > 0 && (
                    <button type="button" onClick={() => navigate(`/mirror?items=${closet.itemIds.join(',')}`)} className="btn-primary btn-sm">
                      Your version, on the rail
                    </button>
                  )}
                  {closet.missing.length > 0 && (
                    <button type="button" onClick={() => navigate('/closet/store')} className="btn-ghost btn-sm">
                      Ask the store about the rest
                    </button>
                  )}
                  <button type="button" onClick={() => setClosetFor(null)} className="btn-quiet btn-quiet-sm">
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </section>
  )
}

function LookCard({ look, busy, hasPhoto, onSee, onCloset, onVerdict }: { look: InspirationLook; busy: string | null; hasPhoto: boolean; onSee: () => void; onCloset: () => void; onVerdict: (v: 'keep' | 'no') => void }) {
  const title = look.outfit.title ?? look.occasion
  const pieces = look.outfit.pieces ?? []
  return (
    <article className="plaque p-4">
      <Arch className="arch-photo" aspect="aspect-[3/4]">
        {look.imageUrl ? (
          <img src={resolveImageUrl(look.imageUrl)} alt={title} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center p-4 text-center font-display text-sm italic text-ink/50">The picture didn’t come; the pieces did.</span>
        )}
      </Arch>
      <h3 className="mt-3 font-display text-2xl font-medium leading-tight text-ink">{title}</h3>
      <p className="mt-1 font-display text-sm italic text-ink/55">{look.rationale}</p>
      {pieces.length > 0 && (
        <ul className="mt-3 grid gap-1 text-xs text-ink/70">
          {pieces.map((p, i) => (
            <li key={i}>
              <b className="font-semibold text-ink">{p.category === 'accessory' ? 'Extra' : p.category[0].toUpperCase() + p.category.slice(1)}</b> · {p.color} {p.subtype}
              {p.material ? `, ${p.material}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div className="action-row mt-4">
        <button type="button" disabled={busy !== null} onClick={onSee} className="btn-primary btn-sm" title={hasPhoto ? undefined : 'Add a photo of yourself first'}>
          {busy === `on:${look.id}` ? 'Dressing you…' : 'See it on me'}
        </button>
        <button type="button" disabled={busy !== null} onClick={onCloset} className="btn-ghost btn-sm">
          From my closet
        </button>
        <button type="button" onClick={() => onVerdict('keep')} className={`chip ${look.verdict === 'keep' ? 'chip-on' : ''}`}>
          {look.verdict === 'keep' ? 'Kept' : 'Keep'}
        </button>
        <button type="button" onClick={() => onVerdict('no')} className={`chip ${look.verdict === 'no' ? 'chip-on' : ''}`}>
          Not for me
        </button>
      </div>
    </article>
  )
}
