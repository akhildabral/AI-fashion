import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { composeEvening, wearBrief, type BriefResponse } from '@zauq/shared/brief'
import { LookBoard } from './LookBoard'
import { Spinner } from './Spinner'
import { Eyebrow } from './ui'

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
      await wearBrief(ev.itemIds, { act: 'evening' })
      onUpdated({ ...data, evening: { ...ev, wornLogId: 'logged' } })
      onNote('Logged. Whatever’s had its turn is in the basket.')
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not log that.')
    } finally {
      setBusy(null)
    }
  }

  if (compact && !ev) {
    // Before six: a label on its own row, then the field and the button
    // sharing one, the field taking whatever width is left.
    return (
      <div className="mt-10 border-t border-ink/10 pt-6">
        <Eyebrow>This evening</Eyebrow>
        <p className="mt-2 text-sm text-ink/55">Going somewhere after? Say where, and the second look is laid out from what you’re already wearing.</p>
        <form
          className="mt-4 flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void compose()
          }}
        >
          <input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="field field-sm min-w-0 flex-1" placeholder="dinner, a show, drinks…" />
          <button type="submit" disabled={busy !== null} className="btn-ghost btn-sm shrink-0">
            {busy === 'compose' ? 'Composing…' : 'Plan tonight'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <section className="mt-10 animate-rise border-t border-ink/10 pt-6">
      <Eyebrow>This evening</Eyebrow>
      {!ev && (
        <>
          <h2 className="section-title mt-2">
            Something on <em className="text-brass-ink">tonight?</em>
          </h2>
          <p className="mt-3 max-w-md font-display text-lg italic text-ink/55">The second look keeps what you’re wearing and changes the least.</p>
          <form
            className="mt-4 flex max-w-xl gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void compose()
            }}
          >
            <input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="field field-sm min-w-0 flex-1" placeholder="dinner at eight, a show, drinks" />
            <button type="submit" disabled={busy !== null} className="btn-primary btn-sm shrink-0">
              {busy === 'compose' ? <Spinner className="h-4 w-4" /> : 'Compose'}
            </button>
          </form>
        </>
      )}
      {ev && (
        <>
          <h2 className="section-title mt-2">
            {ev.wornLogId ? (
              <>
                Tonight, <em className="text-brass-ink">worn.</em>
              </>
            ) : (
              <>
                Tonight, <em className="text-brass-ink">wear this.</em>
              </>
            )}
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink/55">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">{ev.title}</span>
            {'  ·  '}
            <span className="font-display italic text-ink/70">{ev.rationale}</span>
          </p>
          <div className="mt-6 max-w-3xl">
            <LookBoard items={ev.items} />
          </div>
          <div className="action-row mt-6">
            {!ev.wornLogId ? (
              <button type="button" disabled={busy !== null} onClick={() => void wear()} className="btn-primary">
                {busy === 'wear' ? 'Logging…' : 'Wearing it'}
              </button>
            ) : (
              <span className="inline-flex h-11 items-center rounded-[3px] border border-brass/30 bg-iris-soft px-4 text-sm font-semibold text-brass-ink">Logged for tonight</span>
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
