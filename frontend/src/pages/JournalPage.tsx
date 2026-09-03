import { money } from '../lib/money'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { copyText } from '../lib/clipboard'
import { usePageTitle } from '../lib/usePageTitle'
import { deleteWearLog, getWearInsights, getWearLog, logWear, rateWearLog } from '../lib/wearlog'
import { WorePhotoPanel } from '../components/WorePhotoPanel'
import { getResaleDraft, getWardrobe } from '../lib/wardrobe'
import { getOutfits, type Outfit } from '../lib/outfits'
import { getRitualStats, type RitualStats } from '../lib/brief'
import type { EventType, ResaleDraftResponse, WardrobeItem, WearInsightsResponse, WearLogEntry } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { ShareButton } from '../components/ShareButton'
import { clearLookPhoto, setLookPhoto, shareLook, unshareLook } from '../lib/circle'
import { Arch, GarmentTile, Modal, PageShell, Stat, Toast, useFlash } from '../components/ui'
import { resolveImageUrl } from '../lib/api'
import { temp } from '../lib/units'

// The record: what was actually worn, day by day, with the holes showing.
// It is the dataset every brief learns from, so it reads like a ledger you
// can fill in, not a feed.

const OCCASIONS: { key: EventType; label: string }[] = [
  { key: 'work', label: 'Work' },
  { key: 'casual', label: 'Weekend' },
  { key: 'evening', label: 'Evening' },
  { key: 'occasion', label: 'Occasion' },
  { key: 'athletic', label: 'Athletic' },
]
const occasionLabel = (k: string | null) => OCCASIONS.find((o) => o.key === k)?.label ?? (k ? k[0].toUpperCase() + k.slice(1) : null)

const pad = (n: number) => String(n).padStart(2, '0')
/** Local YYYY-MM-DD. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + by, 1))
}

/** Resale: turn a piece that isn't earning its place into a listing. */
function ResaleModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [result, setResult] = useState<ResaleDraftResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    getResaleDraft(itemId)
      .then((res) => !cancelled && setResult(res))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not draft a listing.'))
    return () => {
      cancelled = true
    }
  }, [itemId])

  function copyAll() {
    if (!result) return
    const text = `${result.draft.title}\n\n${result.draft.description}\n\nAsking price: ${result.draft.suggestedPrice}`
    void copyText(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <Modal open onClose={onClose} title="A listing, drafted">
      {!result && !error && (
        <div className="flex min-h-[20vh] flex-col items-center justify-center gap-3 text-ink/60">
          <Spinner className="h-6 w-6" />
          <p className="font-display text-sm italic">Writing your listing…</p>
        </div>
      )}
      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-5">
          <div className="flex gap-4">
            <Arch aspect="aspect-[4/5]" className="w-20 shrink-0">
              <img src={resolveImageUrl(result.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[8%]" />
            </Arch>
            <div>
              <p className="font-display text-lg font-medium text-ink">{result.draft.title}</p>
              <p className="mt-1 text-sm text-brass">Ask {result.draft.suggestedPrice}</p>
            </div>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink/75">{result.draft.description}</p>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">Before you list</p>
            <ul className="space-y-1 text-sm text-ink/70">
              {result.draft.conditionChecklist.map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={copyAll} className="btn-primary w-full">
            {copied ? 'Copied' : 'Copy the listing'}
          </button>
        </div>
      )}
    </Modal>
  )
}

/** Log any day: an outfit you keep, or pieces, and the kind of day it was. */
function LogDayModal({ date, onClose, onLogged, onNote }: { date: string; onClose: () => void; onLogged: (log: WearLogEntry) => void; onNote: (msg: string) => void }) {
  const today = dayKey(new Date())
  const [day, setDay] = useState(date)
  const [occasion, setOccasion] = useState<EventType>('work')
  const [source, setSource] = useState<'outfits' | 'pieces' | 'photo'>('outfits')
  const [outfits, setOutfits] = useState<Outfit[] | null>(null)
  const [pieces, setPieces] = useState<WardrobeItem[] | null>(null)
  const [outfitId, setOutfitId] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void getOutfits()
      .then((r) => {
        setOutfits(r.outfits)
        if (r.outfits.length === 0) setSource('pieces')
      })
      .catch(() => setOutfits([]))
    void getWardrobe()
      .then((r) => setPieces(r.items.filter((i) => i.status === 'ready')))
      .catch(() => setPieces([]))
  }, [])

  const ready = source === 'outfits' ? Boolean(outfitId) : picked.length > 0
  const dow = new Date(`${day}T12:00:00`).getDay()
  useEffect(() => {
    // A sensible default from the weekday; changeable in a tap.
    setOccasion(dow === 0 || dow === 6 ? 'casual' : 'work')
  }, [dow])

  async function save() {
    if (!ready || saving) return
    setSaving(true)
    try {
      const { log } = await logWear({
        wornOn: new Date(`${day}T12:00:00`).toISOString(),
        eventType: occasion,
        ...(source === 'outfits' ? { outfitId: outfitId! } : { itemIds: picked }),
      })
      onLogged(log)
      onNote(`${formatDay(log.wornOn)} logged.`)
      onClose()
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not log that day.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Log a day">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <label htmlFor="log-day" className="label">
            The day
          </label>
          <input id="log-day" type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="field field-sm" />
        </div>
        <div>
          <p className="label">The kind of day</p>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <button key={o.key} type="button" onClick={() => setOccasion(o.key)} aria-pressed={occasion === o.key} className="chip">
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tabs mt-5" role="tablist" aria-label="Log with">
        <button type="button" role="tab" aria-selected={source === 'outfits'} onClick={() => setSource('outfits')} className="tab">
          An outfit
        </button>
        <button type="button" role="tab" aria-selected={source === 'pieces'} onClick={() => setSource('pieces')} className="tab">
          Pieces{picked.length ? ` · ${picked.length}` : ''}
        </button>
        <button type="button" role="tab" aria-selected={source === 'photo'} onClick={() => setSource('photo')} className="tab">
          A photo
        </button>
      </div>

      {source === 'photo' && (
        <div className="mt-4">
          <WorePhotoPanel
            date={day}
            eventType={occasion}
            onLogged={(r) => {
              onLogged(r.log)
              onNote(r.added.length ? `${formatDay(r.log.wornOn)} logged, ${r.added.length} new ${r.added.length === 1 ? 'piece' : 'pieces'} joining the closet.` : `${formatDay(r.log.wornOn)} logged from the photo.`)
              onClose()
            }}
          />
        </div>
      )}

      {source === 'outfits' && (
        <div className="mt-4">
          {outfits === null && (
            <div className="py-8 text-center text-ink/40">
              <Spinner className="h-5 w-5" />
            </div>
          )}
          {outfits && outfits.length === 0 && <p className="rounded-[3px] border border-dashed border-ink/20 p-5 text-center text-sm text-ink/60">No kept outfits yet. Log with pieces instead.</p>}
          {outfits && outfits.length > 0 && (
            <div className="grid max-h-[40vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
              {outfits.map((o) => (
                <button key={o.id} type="button" onClick={() => setOutfitId(o.id)} aria-pressed={outfitId === o.id} className="press text-left">
                  <Arch aspect="aspect-[4/5]" bright={outfitId === o.id}>
                    <div className="relative z-[1] grid h-full w-full grid-cols-2 gap-1 p-[8%]">
                      {o.items.slice(0, 4).map((i) => (
                        <img key={i.id} src={resolveImageUrl(i.imageUrl)} alt="" className="h-full w-full object-contain" />
                      ))}
                    </div>
                  </Arch>
                  <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/55">{occasionLabel(o.eventType)} · {o.items.length} pieces</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {source === 'pieces' && (
        <div className="mt-4">
          {pieces === null && (
            <div className="py-8 text-center text-ink/40">
              <Spinner className="h-5 w-5" />
            </div>
          )}
          {pieces && pieces.length === 0 && <p className="rounded-[3px] border border-dashed border-ink/20 p-5 text-center text-sm text-ink/60">Nothing in the closet yet.</p>}
          {pieces && pieces.length > 0 && (
            <div className="grid max-h-[40vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
              {pieces.map((p) => {
                const idx = picked.indexOf(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => setPicked((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : s.length >= 12 ? s : [...s, p.id]))} aria-pressed={idx >= 0} className="press relative text-left" aria-label={`${idx >= 0 ? 'Remove' : 'Choose'} ${p.subtype ?? p.category}`}>
                    <Arch aspect="aspect-[4/5]" bright={idx >= 0}>
                      <img src={resolveImageUrl(p.imageUrl)} alt="" loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                    </Arch>
                    {idx >= 0 && <span className="absolute right-1 top-1 z-[3] flex h-5 w-5 items-center justify-center rounded-[3px] bg-iris text-[10px] font-bold text-on-brass">{idx + 1}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {source !== 'photo' && (
      <div className="action-row mt-5">
        <button type="button" disabled={!ready || saving} onClick={() => void save()} className="btn-primary disabled:opacity-40">
          {saving ? 'Logging…' : `Log ${formatDay(`${day}T12:00:00`)}`}
        </button>
        <button type="button" onClick={onClose} className="btn-quiet">
          Cancel
        </button>
      </div>
      )}
    </Modal>
  )
}

/** One day: the photo if there is one, the pieces, and "Again?". */
function DayCard({ log, onChange, onRemove, onNote }: { log: WearLogEntry; onChange: (log: WearLogEntry) => void; onRemove: (log: WearLogEntry) => void; onNote: (msg: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const shared = Boolean(log.sharedAt)

  async function rate(v: 1 | 5) {
    const next = log.rating === v ? null : v
    setBusy('rate')
    try {
      await rateWearLog(log.id, next)
      onChange({ ...log, rating: next })
    } catch {
      onNote('Couldn’t save that. Try again.')
    } finally {
      setBusy(null)
    }
  }
  async function toggleShare() {
    setBusy('share')
    try {
      if (shared) {
        await unshareLook(log.id)
        onChange({ ...log, sharedAt: null })
        onNote('Taken off the circle.')
      } else {
        await shareLook(log.id)
        onChange({ ...log, sharedAt: new Date().toISOString() })
        onNote('On the circle.')
      }
    } catch {
      onNote('Couldn’t change that. Try again.')
    } finally {
      setBusy(null)
    }
  }
  async function photo(file: File | null) {
    if (!file) return
    setBusy('photo')
    try {
      const r = await setLookPhoto(log.id, file)
      onChange({ ...log, photoUrl: r.photoUrl })
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not add the photo.')
    } finally {
      setBusy(null)
    }
  }
  async function removePhoto() {
    setBusy('photo')
    try {
      await clearLookPhoto(log.id)
      onChange({ ...log, photoUrl: null })
    } catch {
      onNote('Could not remove the photo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article id={`day-${dayKey(new Date(log.wornOn))}`} className="card scroll-mt-24 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brass">{formatDay(log.wornOn)}</p>
        <p className="text-xs text-ink/45">
          {occasionLabel(log.eventType)}
          {log.weather ? ` · ${temp(log.weather.temperatureC)} ${log.weather.description}` : ''}
          {shared ? ' · on the circle' : ''}
        </p>
      </div>
      <div className="mt-3 flex gap-4">
        {log.photoUrl && (
          <div className="w-24 shrink-0 sm:w-28">
            <Arch aspect="aspect-[4/5]" className="arch-photo">
              <img src={resolveImageUrl(log.photoUrl)} alt="" className="relative z-[1] h-full w-full object-cover" />
            </Arch>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap content-start gap-2">
          {log.items.map((item) => (
            <Arch key={item.id} aspect="aspect-[4/5]" className="w-12 sm:w-14">
              <img src={resolveImageUrl(item.imageUrl)} alt={item.subtype?.trim() || item.category} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
            </Arch>
          ))}
          {log.items.length === 0 && <p className="text-sm text-ink/40">Pieces no longer in your closet.</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-ink/10 pt-3">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/40">Again?</span>
        <button type="button" disabled={busy === 'rate'} onClick={() => void rate(5)} aria-pressed={log.rating === 5} className="filter press">
          Yes
        </button>
        <button type="button" disabled={busy === 'rate'} onClick={() => void rate(1)} aria-pressed={log.rating === 1} className="filter press">
          Not this one
        </button>
        <span className="filter-sep" />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void photo(e.target.files?.[0] ?? null)} />
        {log.photoUrl ? (
          <button type="button" disabled={busy === 'photo'} onClick={() => void removePhoto()} className="btn-quiet !h-8 !text-xs">
            Remove the photo
          </button>
        ) : (
          <button type="button" disabled={busy === 'photo'} onClick={() => fileRef.current?.click()} className="btn-quiet !h-8 !text-xs">
            {busy === 'photo' ? 'Adding…' : 'Add a photo'}
          </button>
        )}
        <button type="button" disabled={busy === 'share'} onClick={() => void toggleShare()} className={`!h-8 !text-xs ${shared ? 'btn-ghost !border-brass/60 !text-brass' : 'btn-quiet'}`}>
          {busy === 'share' ? '…' : shared ? 'On the circle ✓' : 'Share to the circle'}
        </button>
        <ShareButton target={{ kind: 'look', id: log.id, title: 'What I wore', text: `What I wore on ${formatDay(log.wornOn)}.`, url: shared ? `${window.location.origin}/look/${log.id}` : undefined }} onDone={(l) => l && onNote(l)} className="press inline-flex h-8 items-center px-2 text-xs text-ink/50 transition-colors hover:text-ink" />
        <button type="button" onClick={() => onRemove(log)} className="btn-quiet ml-auto !h-8 !text-xs !text-ink/40">
          Remove
        </button>
      </div>
    </article>
  )
}

/** The month, with the holes showing. */
function MonthStrip({ month, days, onMonth, onPick }: { month: string; days: Set<string>; onMonth: (m: string) => void; onPick: (day: string, logged: boolean) => void }) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const count = new Date(y, m, 0).getDate()
  const today = dayKey(new Date())
  const thisMonth = monthKey(new Date())
  const lead = (first.getDay() + 6) % 7 // Monday first
  const logged = [...days].filter((d) => d.startsWith(month)).length
  const past = month < thisMonth ? count : Number(today.slice(-2))
  return (
    <section className="mt-8 animate-rise-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} className="btn-quiet !h-8 !w-8 !px-0" aria-label="Earlier month">
            ‹
          </button>
          <h2 className="font-display text-2xl font-medium text-ink">{formatMonth(month)}</h2>
          <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} className="btn-quiet !h-8 !w-8 !px-0 disabled:opacity-30" aria-label="Later month">
            ›
          </button>
        </div>
        <p className="text-xs text-ink/45">
          {logged} of {past} days logged{past > logged ? ' · tap a dashed day to fill it' : ''}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-1.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/35">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const key = `${month}-${pad(i + 1)}`
          const isLogged = days.has(key)
          const future = key > today
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              onClick={() => onPick(key, isLogged)}
              aria-label={`${key}${isLogged ? ', logged' : ', not logged'}`}
              className={`press relative aspect-square rounded-[3px] border text-xs font-semibold [font-variant-numeric:tabular-nums] transition-colors ${
                isLogged ? 'border-ink/25 text-ink hover:border-brass' : future ? 'border-transparent text-ink/20' : 'border-dashed border-ink/20 text-ink/40 hover:border-brass hover:text-ink'
              } ${key === today ? 'ring-1 ring-brass' : ''}`}
            >
              {i + 1}
              {isLogged && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 bg-brass" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function JournalPage() {
  usePageTitle('The record')
  const { toast, flash } = useFlash()
  const [params, setParams] = useSearchParams()
  const itemFilter = params.get('item')
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [occasion, setOccasion] = useState<EventType | null>(null)
  const [logs, setLogs] = useState<WearLogEntry[] | null>(null)
  const [days, setDays] = useState<Set<string>>(new Set())
  const [insights, setInsights] = useState<WearInsightsResponse | null>(null)
  const [ritual, setRitual] = useState<RitualStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resaleItemId, setResaleItemId] = useState<string | null>(null)
  const [logging, setLogging] = useState<string | null>(null)
  const [pending, setPending] = useState<{ log: WearLogEntry; timer: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await getWearLog({ month, item: itemFilter ?? undefined, occasion: occasion ?? undefined })
      setLogs(r.logs)
      setDays(new Set(r.days ?? []))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your record.')
    }
  }, [month, itemFilter, occasion])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    getWearInsights().then(setInsights).catch(() => undefined)
    getRitualStats().then(setRitual).catch(() => undefined)
  }, [])

  // A filtered piece, named from the first day it appears in.
  const filteredItem = useMemo(() => (itemFilter ? logs?.flatMap((l) => l.items).find((i) => i.id === itemFilter) ?? null : null), [itemFilter, logs])

  function upsert(log: WearLogEntry) {
    setLogs((prev) => {
      const rest = (prev ?? []).filter((l) => l.id !== log.id)
      return [...rest, log].sort((a, b) => (a.wornOn < b.wornOn ? 1 : -1))
    })
    setDays((prev) => new Set([...prev, dayKey(new Date(log.wornOn))]))
  }
  function logged(log: WearLogEntry) {
    // The server resolves the pieces; re-read the month rather than guess.
    const m = monthKey(new Date(log.wornOn))
    if (m !== month) setMonth(m)
    else void load()
    getWearInsights().then(setInsights).catch(() => undefined)
    getRitualStats().then(setRitual).catch(() => undefined)
  }
  function remove(log: WearLogEntry) {
    if (pending) {
      window.clearTimeout(pending.timer)
      void deleteWearLog(pending.log.id).catch(() => undefined)
    }
    setLogs((prev) => prev?.filter((l) => l.id !== log.id) ?? prev)
    const timer = window.setTimeout(() => {
      void deleteWearLog(log.id)
        .then(() => void load())
        .catch(() => {
          flash('Couldn’t remove that day. Try again.')
          upsert(log)
        })
      setPending(null)
    }, 6000)
    setPending({ log, timer })
  }
  function undo() {
    if (!pending) return
    window.clearTimeout(pending.timer)
    upsert(pending.log)
    setPending(null)
  }
  function pickDay(day: string, isLogged: boolean) {
    if (isLogged) {
      document.getElementById(`day-${day}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else setLogging(day)
  }

  const loading = logs == null && !error
  const mostWorn = insights ? [...insights.items].filter((i) => i.wearCount > 0).sort((a, b) => b.wearCount - a.wearCount).slice(0, 6) : []
  const orphans = insights ? insights.items.filter((i) => i.orphan).slice(0, 6) : []
  const filtered = Boolean(itemFilter || occasion)

  return (
    <PageShell>
      <Toast msg={toast} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">The record</p>
          <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
            What you <em className="text-brass">actually wore.</em>
          </h1>
          <p className="mt-3 max-w-xl animate-rise-1 text-sm text-ink/55">Every brief learns from this. Fill the days, and tell the stylist what to bring back.</p>
        </div>
        <button type="button" onClick={() => setLogging(dayKey(new Date()))} className="btn-primary animate-rise-1">
          Log a day
        </button>
      </header>

      {error && (
        <p className="mt-6 alert-error" role="alert">
          {error}
        </p>
      )}

      {(ritual || insights) && (
        <section className="plaque mt-8 animate-rise-2 p-5 pl-6">
          <div className="flex flex-wrap gap-8">
            {ritual && <Stat value={ritual.streak} label="day streak" />}
            {ritual && <Stat value={`${ritual.rotationPct}%`} label="in rotation" />}
            {ritual && <Stat value={money(ritual.monthlyPayback)} label="back this month" />}
          </div>
          {insights && (
            <p className="mt-3 border-t border-ink/10 pt-3 text-xs text-ink/50">
              {insights.totals.logged} {insights.totals.logged === 1 ? 'day' : 'days'} logged · {insights.totals.items} pieces · {insights.totals.orphans} idle 90+ days ·{' '}
              <Link to="/closet" className="font-semibold text-brass hover:underline">
                the ledger, in your Closet
              </Link>
            </p>
          )}
        </section>
      )}

      <MonthStrip month={month} days={days} onMonth={setMonth} onPick={pickDay} />

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" aria-pressed={occasion === null} onClick={() => setOccasion(null)} className="filter press">
            All days
          </button>
          {OCCASIONS.slice(0, 4).map((o) => (
            <button key={o.key} type="button" aria-pressed={occasion === o.key} onClick={() => setOccasion((cur) => (cur === o.key ? null : o.key))} className="filter press">
              {o.label}
            </button>
          ))}
          {itemFilter && (
            <>
              <span className="filter-sep" />
              <button
                type="button"
                aria-pressed
                onClick={() => {
                  params.delete('item')
                  setParams(params, { replace: true })
                }}
                className="filter press"
                title="Show every day"
              >
                {filteredItem ? `The ${filteredItem.subtype ?? filteredItem.category}` : 'One piece'} ×
              </button>
            </>
          )}
        </div>

        {loading && (
          <div className="flex min-h-[20vh] items-center justify-center text-ink/50">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {logs && logs.length === 0 && (
          <div className="mt-4 rounded-[3px] border border-dashed border-ink/20 px-6 py-12 text-center">
            <p className="font-display text-2xl font-medium text-ink">{filtered ? 'Nothing here' : `Nothing logged in ${formatMonth(month)}`}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">{filtered ? 'No day matches that. Clear the filter, or log one.' : 'Tap a day above, or “Wearing it” on today’s brief, and the record starts here.'}</p>
            {!filtered && (
              <Link to="/" className="btn-ghost mt-5 inline-flex">
                Open today’s brief
              </Link>
            )}
          </div>
        )}
        {logs && logs.length > 0 && (
          <div className="mt-4 grid gap-3">
            {logs.map((log) => (
              <DayCard key={log.id} log={log} onChange={upsert} onRemove={remove} onNote={flash} />
            ))}
          </div>
        )}
      </section>

      {mostWorn.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-medium text-ink">Workhorses</h2>
          <p className="mt-1 text-sm text-ink/55">The pieces doing the most work, and what each wear has cost so far.</p>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
            {mostWorn.map((item) => (
              <Link key={item.itemId} to={`/journal?item=${item.itemId}`} className="press block min-w-0">
                <GarmentTile imageUrl={item.imageUrl} label={item.subtype ?? item.category} sublabel={`${item.wearCount}× worn${item.costPerWear != null ? ` · ${money(item.costPerWear)}/wear` : ''}`} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {orphans.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-medium text-ink">Sitting idle</h2>
          <p className="mt-1 text-sm text-ink/55">Not worn in over ninety days. Ask for a look built around one, or let it go and draft the listing.</p>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
            {orphans.map((item) => (
              <div key={item.itemId} className="min-w-0 opacity-80">
                <GarmentTile imageUrl={item.imageUrl} label={item.subtype ?? item.category} />
                <button type="button" onClick={() => setResaleItemId(item.itemId)} className="press mt-1 w-full text-center text-[11px] font-semibold text-brass hover:underline">
                  Draft a listing
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {pending && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[3px] border border-brass/40 bg-surface px-4 py-2.5 text-sm text-ink" role="status">
          <span>{formatDay(pending.log.wornOn)} removed.</span>
          <button type="button" onClick={undo} className="font-semibold text-brass hover:underline">
            Undo
          </button>
        </div>
      )}

      {resaleItemId && <ResaleModal itemId={resaleItemId} onClose={() => setResaleItemId(null)} />}
      {logging && <LogDayModal date={logging} onClose={() => setLogging(null)} onLogged={logged} onNote={flash} />}
    </PageShell>
  )
}
