import { useEffect, useRef, useState } from 'react'
import { pinFile, resolveImageUrl } from '../lib/api'
import type { EventType } from '../lib/types'
import { confirmWearPhoto, getWearPhoto, readWearPhoto, type ConfirmWearPhotoResponse, type PhotoRow, type RowDecision, type WearPhotoJob } from '../lib/wear-photo'
import { Spinner } from './Spinner'

/**
 * "This is what I wore." One photo in; every garment found in it comes back
 * as a row — yours for sure, probably yours, or new — and nothing is written
 * until each row is answered. Callers wrap it: a modal on Today, a tab in the
 * Journal's log-a-day.
 */
export function WorePhotoPanel({
  date,
  eventType,
  alreadyLogged = false,
  hasSuggestion = false,
  onLogged,
}: {
  date: string
  eventType?: EventType
  /** The day already has a wear log: offer "instead" or "as well". */
  alreadyLogged?: boolean
  /** The stylist had laid something out for the day. */
  hasSuggestion?: boolean
  onLogged: (r: ConfirmWearPhotoResponse) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [job, setJob] = useState<WearPhotoJob | null>(null)
  const [stage, setStage] = useState<'pick' | 'reading' | 'confirm' | 'saving'>('pick')
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [mode, setMode] = useState<'instead' | 'also'>('instead')
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setStage('reading')
    try {
      const { job } = await readWearPhoto(await pinFile(file), date)
      setJob(job)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The photo could not be sent.')
      setStage('pick')
    }
  }

  // The reading runs in the background; ask every two seconds until it lands.
  useEffect(() => {
    if (!job || job.status !== 'processing') return
    const t = setInterval(() => {
      void getWearPhoto(job.id)
        .then(({ job: fresh }) => {
          setJob(fresh)
          if (fresh.status === 'ready') {
            const first: Record<number, Decision> = {}
            for (const r of fresh.rows) first[r.index] = defaultFor(r)
            setDecisions(first)
            setStage('confirm')
          } else if (fresh.status === 'failed') {
            setError(fresh.error ?? 'The photo could not be read.')
            setStage('pick')
          }
        })
        .catch(() => undefined)
    }, 2000)
    return () => clearInterval(t)
  }, [job])

  async function save() {
    if (!job || stage === 'saving') return
    const rows = Object.values(decisions).map(({ index, action, itemId }) => ({ index, action, itemId }))
    if (!rows.some((r) => r.action !== 'skip')) {
      setError('Keep at least one piece to log the day.')
      return
    }
    setStage('saving')
    setError(null)
    try {
      const r = await confirmWearPhoto(job.id, { rows, mode: alreadyLogged ? mode : 'instead', eventType })
      onLogged(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log the day.')
      setStage('confirm')
    }
  }

  if (stage === 'pick' || stage === 'reading') {
    return (
      <div>
        <p className="text-sm text-ink/70">A photo of you in it, or of the pieces laid out. The closet reads which are yours; new ones can join it.</p>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => void onFile(e)} className="hidden" />
        {error && (
          <p className="mt-3 alert-error" role="alert">
            {error}
          </p>
        )}
        <div className="action-row mt-4">
          <button type="button" disabled={stage === 'reading'} onClick={() => fileRef.current?.click()} className="btn-primary btn-sm">
            {stage === 'reading' ? (
              <>
                <Spinner className="mr-2 h-4 w-4" /> Reading the photo…
              </>
            ) : (
              'Choose a photo'
            )}
          </button>
        </div>
        {stage === 'reading' && <p className="mt-3 text-xs text-ink/45">Half a minute or so. Each piece is cut out and looked for in your closet.</p>}
      </div>
    )
  }

  const rows = job?.rows ?? []
  const kept = Object.values(decisions).filter((d) => d.action !== 'skip').length
  return (
    <div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink/70">No clothes could be made out in that photo. Try one in better light, or log the day by its pieces.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <RowCard key={row.index} row={row} decision={decisions[row.index]} onChange={(d) => setDecisions((cur) => ({ ...cur, [row.index]: d }))} />
          ))}
        </ul>
      )}

      {alreadyLogged && rows.length > 0 && (
        <div className="mt-5 border-t border-ink/10 pt-4">
          <p className="label">The day was already logged</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMode('instead')} className={`chip ${mode === 'instead' ? 'chip-on' : ''}`}>
              This is what I wore instead
            </button>
            <button type="button" onClick={() => setMode('also')} className={`chip ${mode === 'also' ? 'chip-on' : ''}`}>
              As well as what was logged
            </button>
          </div>
        </div>
      )}
      {!alreadyLogged && hasSuggestion && rows.length > 0 && <p className="mt-4 text-xs text-ink/45">Logged as the day’s look, in place of what was laid out. The suggestion stays on record.</p>}

      {error && (
        <p className="mt-3 alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="action-row mt-5">
        <button type="button" disabled={stage === 'saving' || kept === 0} onClick={() => void save()} className="btn-primary btn-sm">
          {stage === 'saving' ? 'Logging…' : kept === 0 ? 'Log the day' : `Log the day · ${kept} ${kept === 1 ? 'piece' : 'pieces'}`}
        </button>
        <button type="button" disabled={stage === 'saving'} onClick={() => { setJob(null); setStage('pick') }} className="btn-quiet !h-9 !text-xs">
          Another photo
        </button>
      </div>
    </div>
  )
}

type Decision = RowDecision & { open?: boolean }

function defaultFor(row: PhotoRow): Decision {
  const top = row.matches[0]
  if (row.band === 'sure' && top) return { index: row.index, action: 'use', itemId: top.itemId }
  if (row.band === 'near' && top) return { index: row.index, action: 'use', itemId: top.itemId }
  return { index: row.index, action: 'add' }
}

function nameOf(it: { subtype: string | null; category: string; primaryColor?: string | null }): string {
  const base = (it.subtype ?? it.category).toLowerCase()
  return it.primaryColor ? `${it.primaryColor.toLowerCase()} ${base}` : base
}

function RowCard({ row, decision, onChange }: { row: PhotoRow; decision: Decision | undefined; onChange: (d: Decision) => void }) {
  const d = decision ?? defaultFor(row)
  const chosen = d.action === 'use' ? row.matches.find((m) => m.itemId === d.itemId) : undefined
  const top = row.matches[0]
  const line =
    d.action === 'skip'
      ? 'Left out of the day.'
      : d.action === 'add'
        ? 'New to the closet. It will be catalogued from this photo.'
        : chosen
          ? row.band === 'sure' && chosen === top
            ? `Your ${nameOf(chosen.item)}.`
            : `Your ${nameOf(chosen.item)}?`
          : ''

  return (
    <li className="plaque p-3">
      <div className="flex items-start gap-3">
        <div className="arch-niche h-20 w-16 shrink-0 overflow-hidden bg-bone">
          <img src={resolveImageUrl(row.cropUrl)} alt={row.description} className="h-full w-full object-contain" />
        </div>
        {chosen && d.action === 'use' && (
          <div className="arch-niche h-20 w-16 shrink-0 overflow-hidden bg-bone">
            <img src={resolveImageUrl(chosen.item.imageUrl)} alt={nameOf(chosen.item)} className="h-full w-full object-contain" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">{row.description}</p>
          <p className="mt-1 text-sm text-ink">{line}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.action === 'use' && row.band === 'near' && chosen && (
              <>
                <button type="button" onClick={() => onChange({ ...d, open: false })} className="chip chip-on">
                  Yes, that one
                </button>
                <button type="button" onClick={() => onChange({ index: row.index, action: 'add', open: true })} className="chip">
                  Not mine
                </button>
              </>
            )}
            {d.action === 'use' && row.band === 'sure' && (
              <button type="button" onClick={() => onChange({ ...d, open: !d.open })} className="chip">
                {d.open ? 'Keep it' : 'Not that one'}
              </button>
            )}
            {d.action !== 'use' && (
              <>
                <button type="button" onClick={() => onChange({ index: row.index, action: 'add', open: d.open })} className={`chip ${d.action === 'add' ? 'chip-on' : ''}`}>
                  Add to the closet
                </button>
                <button type="button" onClick={() => onChange({ index: row.index, action: 'skip', open: d.open })} className={`chip ${d.action === 'skip' ? 'chip-on' : ''}`}>
                  Skip
                </button>
                {row.matches.length > 0 && (
                  <button type="button" onClick={() => onChange({ ...d, open: !d.open })} className="chip">
                    {d.open ? 'Hide mine' : 'One of mine'}
                  </button>
                )}
              </>
            )}
          </div>
          {d.open && row.matches.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {row.matches.map((m) => (
                <button key={m.itemId} type="button" onClick={() => onChange({ index: row.index, action: 'use', itemId: m.itemId, open: false })} className={`press flex items-center gap-2 border p-1 pr-3 text-left text-xs ${d.itemId === m.itemId ? 'border-brass' : 'border-ink/15'}`}>
                  <img src={resolveImageUrl(m.item.imageUrl)} alt="" className="h-12 w-10 object-contain" />
                  <span>
                    <b className="block font-semibold text-ink">{nameOf(m.item)}</b>
                    <span className="text-ink/55">{m.reasons.join(', ') || 'the same kind'}</span>
                  </span>
                </button>
              ))}
              {d.action === 'use' && (
                <button type="button" onClick={() => onChange({ index: row.index, action: 'add', open: false })} className="chip self-center">
                  None of these
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
