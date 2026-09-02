import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { composeEvening, wearBrief, type BriefResponse } from '../lib/brief'
import { LookBoard } from './LookBoard'
import { Spinner } from './Spinner'

// Act two. From six, or whenever the day has a second half: the second look
// that keeps what you're wearing and changes the least. After the morning is
// worn, the recap sits above it.

export function EveningAct({ data, onUpdated, onNote, compact = false }: { data: BriefResponse; onUpdated: (r: BriefResponse) => void; onNote: (line: string) => void; compact?: boolean }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [occasion, setOccasion] = useState('')
  const ev = data.evening ?? null

  async function compose() {
    setBusy('compose')
    try {
      const r = await composeEvening(occasion.trim() || undefined)
      onUpdated(r)
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not compose tonight.')
    } finally {
      setBusy(null)
    }
  }
  async function wear() {
    if (!ev) return
    setBusy('wear')
    try {
      await wearBrief(ev.itemIds, 'evening')
      onUpdated({ ...data, evening: { ...ev, wornLogId: 'logged' } })
      onNote('Logged. Whatever’s had its turn is in the basket.')
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not log that.')
    } finally {
      setBusy(null)
    }
  }

  if (compact && !ev) {
    // Before six: one line, one door.
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-5">
        <p className="text-sm text-ink/55">
          <span className="font-semibold uppercase tracking-[0.14em] text-ink/45">Act two</span> · Something on tonight?
        </p>
        <input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="field field-sm !w-56" placeholder="dinner, a show, drinks…" />
        <button type="button" disabled={busy !== null} onClick={() => void compose()} className="btn-ghost btn-sm">
          {busy === 'compose' ? 'Composing…' : 'Plan tonight'}
        </button>
      </div>
    )
  }

  return (
    <section className="mt-10 animate-rise border-t border-ink/10 pt-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">Act two · tonight</p>
      {!ev && (
        <>
          <h2 className="mt-1 font-display text-3xl font-medium leading-[1.0] text-ink sm:text-4xl">
            Something on <em className="text-brass">tonight?</em>
          </h2>
          <p className="mt-3 max-w-md font-display text-lg italic text-ink/55">The second look keeps what you’re wearing and changes the least.</p>
          <form
            className="mt-4 flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void compose()
            }}
          >
            <input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="field field-sm" placeholder="dinner at eight, a show, drinks" />
            <button type="submit" disabled={busy !== null} className="btn-primary btn-sm">
              {busy === 'compose' ? <Spinner className="h-4 w-4" /> : 'Compose'}
            </button>
          </form>
        </>
      )}
      {ev && (
        <>
          <h2 className="mt-1 font-display text-3xl font-medium leading-[1.0] text-ink sm:text-4xl">
            {ev.wornLogId ? (
              <>
                Tonight, <em className="text-brass">worn.</em>
              </>
            ) : (
              <>
                Tonight, <em className="text-brass">wear this.</em>
              </>
            )}
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink/55">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">{ev.title}</span>
            {'  ·  '}
            <span className="font-display italic text-ink/70">{ev.rationale}</span>
          </p>
          <div className="mt-5 max-w-3xl">
            <LookBoard items={ev.items} />
          </div>
          <div className="action-row mt-5">
            {!ev.wornLogId ? (
              <button type="button" disabled={busy !== null} onClick={() => void wear()} className="btn-primary">
                {busy === 'wear' ? 'Logging…' : 'Wearing it'}
              </button>
            ) : (
              <span className="inline-flex h-11 items-center rounded-[3px] border border-brass/30 bg-iris-soft px-4 text-sm font-semibold text-brass">Logged for tonight</span>
            )}
            <button type="button" onClick={() => navigate(`/mirror?items=${ev.itemIds.join(',')}`)} className="btn-ghost">
              See it on you
            </button>
            {!ev.wornLogId && (
              <button type="button" disabled={busy !== null} onClick={() => void compose()} className="btn-quiet">
                Another
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
