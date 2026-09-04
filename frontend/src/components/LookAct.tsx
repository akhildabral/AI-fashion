import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { wearBrief, removeLook, composeLook, type LookSlot, type LookSlotKind } from '@zauq/shared/brief'
import { LookBoard } from './LookBoard'
import { Spinner } from './Spinner'
import { Chip, Eyebrow } from './ui'

// One look in the day's timeline — an afternoon, an evening, or a custom
// ritual. Renders its own board and logs itself as a separate wear. The first
// (main) look keeps its richer treatment on the Today page; this covers the
// rest, and the "Add a look" control composes new ones.

const SLOT_LABEL: Record<LookSlotKind, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  custom: 'A look',
}

/** The heading for a look: a custom label wins, else the slot's name. */
export function lookTitle(look: Pick<LookSlot, 'slot' | 'label'>): string {
  return look.label?.trim() || SLOT_LABEL[look.slot]
}

/** "7:30 PM" from "19:30". */
function prettyTime(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function LookAct({
  look,
  date,
  onReload,
  onNote,
  planning = false,
}: {
  look: LookSlot
  date: string
  onReload: () => void | Promise<void>
  onNote: (line: string) => void
  /** A future day being planned — no "wear" yet, just the look and its controls. */
  planning?: boolean
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const title = lookTitle(look)
  const time = prettyTime(look.time)

  async function wear() {
    setBusy('wear')
    try {
      await wearBrief(look.itemIds, { lookId: look.id }, date)
      onNote(`Logged. The ${title.toLowerCase()} look is on record.`)
      await onReload()
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not log that.')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('remove')
    try {
      await removeLook(look.id, date)
      onNote('Taken off the day.')
      await onReload()
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not remove that.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-10 animate-rise border-t border-ink/10 pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>
          {title}
          {time && <span className="ml-2 text-ink/40">{time}</span>}
        </Eyebrow>
        {look.worn && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">Logged</span>
        )}
      </div>
      <h2 className="section-title mt-2">
        {look.worn ? (
          <>You <em className="text-brass-ink">wore this.</em></>
        ) : look.occasion ? (
          <>For <em className="text-brass-ink">{look.occasion.toLowerCase()}.</em></>
        ) : (
          <>Then, <em className="text-brass-ink">wear this.</em></>
        )}
      </h2>
      {look.rationale && (
        <p className="mt-3 max-w-2xl font-display text-lg italic text-ink/55">{look.rationale}</p>
      )}
      <div className="mt-6 max-w-3xl">
        <LookBoard items={look.items} />
      </div>
      <div className="action-row mt-6">
        {!planning &&
          (!look.worn ? (
            <button type="button" disabled={busy !== null} onClick={() => void wear()} className="btn-primary">
              {busy === 'wear' ? <><Spinner className="mr-2 h-4 w-4" /> Logging…</> : 'Wearing it'}
            </button>
          ) : (
            <span className="inline-flex h-11 items-center rounded-[3px] border border-brass/30 bg-iris-soft px-4 text-sm font-semibold text-brass-ink">
              Logged for {title.toLowerCase()}
            </span>
          ))}
        <button type="button" onClick={() => navigate(`/mirror?items=${look.itemIds.join(',')}`)} className="btn-ghost">
          See it on you
        </button>
        {!look.worn && (
          <button type="button" disabled={busy !== null} onClick={() => void remove()} className="btn-quiet ml-auto">
            {busy === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
    </section>
  )
}

const PRESETS: { slot: LookSlotKind; label: string }[] = [
  { slot: 'afternoon', label: 'Afternoon' },
  { slot: 'evening', label: 'Evening' },
]

/** Compose another look for the day: a quick time-of-day preset, or a custom
 *  ritual with its own name and time (a wedding's ceremony, reception…). */
export function AddLook({
  date,
  onReload,
  onNote,
}: {
  date: string
  onReload: () => void | Promise<void>
  onNote: (line: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('')
  const [occasion, setOccasion] = useState('')

  async function add(body: { slot?: LookSlotKind; label?: string; time?: string; occasion?: string }, key: string) {
    setBusy(key)
    try {
      await composeLook(body, date)
      onNote('Another look, laid out.')
      setCustomOpen(false)
      setLabel('')
      setTime('')
      setOccasion('')
      await onReload()
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not add a look.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-10 border-t border-ink/10 pt-6">
      <Eyebrow>Add a look</Eyebrow>
      <p className="mt-2 text-sm text-ink/55">
        Another outfit for later today — an event, a change, or a ritual of its own.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Chip key={p.slot} disabled={busy !== null} onClick={() => void add({ slot: p.slot }, p.slot)}>
            {busy === p.slot ? 'Composing…' : p.label}
          </Chip>
        ))}
        <Chip disabled={busy !== null} onClick={() => setCustomOpen((v) => !v)} on={customOpen}>
          Custom…
        </Chip>
      </div>
      {customOpen && (
        <form
          className="mt-4 flex max-w-2xl flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add(
              { slot: 'custom', ...(label.trim() ? { label: label.trim() } : {}), ...(time ? { time } : {}), ...(occasion.trim() ? { occasion: occasion.trim() } : {}) },
              'custom',
            )
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="field field-sm w-40" placeholder="Ceremony" />
          <input value={time} onChange={(e) => setTime(e.target.value)} type="time" className="field field-sm w-32" aria-label="Time" />
          <input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="field field-sm min-w-0 flex-1" placeholder="what it’s for" />
          <button type="submit" disabled={busy !== null} className="btn-primary btn-sm shrink-0">
            {busy === 'custom' ? <Spinner className="h-4 w-4" /> : 'Add look'}
          </button>
        </form>
      )}
    </section>
  )
}
