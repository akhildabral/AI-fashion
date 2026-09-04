import { money } from '@zauq/shared/money'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { copyText } from '../lib/clipboard'
import { usePageTitle } from '../lib/usePageTitle'
import { deleteWearLog, getWearInsights, getWearLog, logWear, rateWearLog } from '@zauq/shared/wearlog'
import { WorePhotoPanel } from '../components/WorePhotoPanel'
import { getResaleDraft, getWardrobe } from '@zauq/shared/wardrobe'
import { getOutfits, type Outfit } from '@zauq/shared/outfits'
import { getRitualStats, type RitualStats } from '@zauq/shared/brief'
import type { EventType, ResaleDraftResponse, WardrobeItem, WearInsightsResponse, WearLogEntry } from '@zauq/shared/types'
import { ShareButton } from '../components/ShareButton'
import { clearLookPhoto, setLookPhoto, shareLook, unshareLook } from '@zauq/shared/circle'
import { Alert, Arch, ArchSkeleton, Chip, EmptyState, Filter, GarmentTile, IconButton, Modal, PageHead, PageShell, SectionHead, Stat, Tabs, Toast, UndoBar, useFlash, SkeletonBlock } from '../components/ui'
import { resolveImageUrl } from '../lib/api'
import { temp } from '@zauq/shared/units'

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
        // The shape of the listing to come, and the word for the wait.
        <div aria-busy="true" aria-label="Writing your listing">
          <div className="flex gap-4">
            <div className="arch-bezel aspect-[4/5] w-20 shrink-0 animate-pulse opacity-60"><div className="arch-niche h-full w-full" /></div>
            <div className="flex-1">
              <SkeletonBlock className="h-5 w-2/3" />
              <SkeletonBlock className="mt-2 h-4 w-1/3 !bg-ink/[0.07]" />
            </div>
          </div>
          <SkeletonBlock className="mt-5 h-4 w-full !bg-ink/[0.07]" />
          <SkeletonBlock className="mt-2 h-4 w-5/6 !bg-ink/[0.07]" />
          <p className="mt-5 font-display text-sm italic text-ink/60">Writing your listing…</p>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
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
            <p className="mb-2 eyebrow">Before you list</p>
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
              <Chip key={o.key} on={occasion === o.key} onClick={() => setOccasion(o.key)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <Tabs
        className="mt-8"
        label="Log with"
        value={source}
        onChange={setSource}
        items={[
          { key: 'outfits', label: 'An outfit' },
          { key: 'pieces', label: 'Pieces', count: picked.length || undefined },
          { key: 'photo', label: 'A photo' },
        ]}
      />

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
          {outfits === null && <ArchSkeleton count={4} aspect="aspect-[4/5]" className="grid grid-cols-3 gap-3 sm:grid-cols-4" />}
          {outfits && outfits.length === 0 && <EmptyState line="No kept outfits yet. Log with pieces instead." />}
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
          {pieces === null && <ArchSkeleton count={8} aspect="aspect-[4/5]" className="grid grid-cols-4 gap-2 sm:grid-cols-6" />}
          {pieces && pieces.length === 0 && <EmptyState line="Nothing in the closet yet." />}
          {pieces && pieces.length > 0 && (
            <div className="grid max-h-[40vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
              {pieces.map((p) => {
                const idx = picked.indexOf(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => setPicked((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : s.length >= 12 ? s : [...s, p.id]))} aria-pressed={idx >= 0} className="press relative text-left" aria-label={`${idx >= 0 ? 'Remove' : 'Choose'} ${p.subtype ?? p.category}`}>
                    <Arch aspect="aspect-[4/5]" bright={idx >= 0}>
                      <img src={resolveImageUrl(p.imageUrl)} alt="" loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                    </Arch>
                    {idx >= 0 && <span className="absolute right-1 top-1 z-[3] flex h-5 w-5 items-center justify-center rounded-[3px] bg-iris text-[10px] font-semibold text-on-brass">{idx + 1}</span>}
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
const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Group adjacent logs that fall on the same day (logs arrive newest-first,
 *  so same-day entries are contiguous) — a day can hold several looks. */
function groupByDay(logs: WearLogEntry[]): [string, WearLogEntry[]][] {
  const groups: [string, WearLogEntry[]][] = []
  for (const log of logs) {
    const k = dayKey(new Date(log.wornOn))
    const last = groups[groups.length - 1]
    if (last && last[0] === k) last[1].push(log)
    else groups.push([k, [log]])
  }
  return groups
}

function DayCard({ log, onChange, onRemove, onNote, heading = 'date' }: { log: WearLogEntry; onChange: (log: WearLogEntry) => void; onRemove: (log: WearLogEntry) => void; onNote: (msg: string) => void; heading?: 'date' | 'time' }) {
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
    <article id={`day-${dayKey(new Date(log.wornOn))}`} className="card scroll-mt-24 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-label text-accent-text">{heading === 'time' ? timeOfDay(log.wornOn) : formatDay(log.wornOn)}</p>
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
      {/* The foot sits on one height, 36: "Again?" picks a value (chips), the rest are quiet actions. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-ink/10 pt-3">
        <span className="mr-1 text-xs font-semibold uppercase tracking-label-lg text-ink/45">Again?</span>
        <Chip disabled={busy === 'rate'} on={log.rating === 5} onClick={() => void rate(5)}>
          Yes
        </Chip>
        <Chip disabled={busy === 'rate'} on={log.rating === 1} onClick={() => void rate(1)}>
          Not this one
        </Chip>
        <span className="filter-sep" />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void photo(e.target.files?.[0] ?? null)} />
        {log.photoUrl ? (
          <button type="button" disabled={busy === 'photo'} onClick={() => void removePhoto()} className="btn-quiet btn-quiet-sm">
            Remove the photo
          </button>
        ) : (
          <button type="button" disabled={busy === 'photo'} onClick={() => fileRef.current?.click()} className="btn-quiet btn-quiet-sm">
            {busy === 'photo' ? 'Adding…' : 'Add a photo'}
          </button>
        )}
        <button type="button" disabled={busy === 'share'} onClick={() => void toggleShare()} aria-pressed={shared} className="btn-quiet btn-quiet-sm">
          {busy === 'share' ? '…' : shared ? 'Take it off the circle' : 'Share to the circle'}
        </button>
        <ShareButton target={{ kind: 'look', id: log.id, title: 'What I wore', text: `What I wore on ${formatDay(log.wornOn)}.`, url: shared ? `${window.location.origin}/look/${log.id}` : undefined }} onDone={(l) => l && onNote(l)} className="btn-quiet btn-quiet-sm" />
        <button type="button" onClick={() => onRemove(log)} className="btn-quiet btn-quiet-sm ml-auto">
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
    <section className="mt-10 animate-rise-2">
      {/* The section head: the month as the Bodoni line, the two 36 icon buttons beside it, the count pushed right. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <IconButton label="Earlier month" onClick={() => onMonth(shiftMonth(month, -1))}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 1L3 6l5 5" /></svg>
          </IconButton>
          <h2 className="section-title">{formatMonth(month)}</h2>
          <IconButton label="Later month" onClick={() => onMonth(shiftMonth(month, 1))} disabled={month >= thisMonth}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 1l5 5-5 5" /></svg>
          </IconButton>
        </div>
        <p className="text-xs text-ink/45 [font-variant-numeric:tabular-nums]">
          {logged} of {past} days logged{past > logged ? ' · tap a dashed day to fill it' : ''}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-label text-ink/35">
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
      <PageHead
        eyebrow="The record"
        title={
          <>
            What you <em className="text-accent-text">actually wore.</em>
          </>
        }
        line="Every brief learns from this. Fill the days, and tell the stylist what to bring back."
        aside={
          <button type="button" onClick={() => setLogging(dayKey(new Date()))} className="btn-primary">
            Log a day
          </button>
        }
      />

      {error && <Alert className="mt-6">{error}</Alert>}

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

      <section className="mt-10">
        {/* Filters narrow the month: an ink wash when on, never brass. */}
        <div className="flex flex-wrap items-center gap-1">
          <Filter on={occasion === null} onClick={() => setOccasion(null)}>
            All days
          </Filter>
          {OCCASIONS.slice(0, 4).map((o) => (
            <Filter key={o.key} on={occasion === o.key} onClick={() => setOccasion((cur) => (cur === o.key ? null : o.key))}>
              {o.label}
            </Filter>
          ))}
          {itemFilter && (
            <>
              <span className="filter-sep" />
              <Filter
                on
                onClick={() => {
                  params.delete('item')
                  setParams(params, { replace: true })
                }}
              >
                {filteredItem ? `The ${filteredItem.subtype ?? filteredItem.category}` : 'One piece'} ×
              </Filter>
            </>
          )}
        </div>

        {loading && (
          <div className="mt-4 grid gap-3" aria-busy="true" aria-label="Loading your record">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-4">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="mt-3 h-24 w-full" />
              </div>
            ))}
          </div>
        )}
        {logs && logs.length === 0 && (
          <EmptyState
            className="mt-8"
            line={filtered ? 'Nothing here. No day matches that. Clear the filter, or log one.' : `Nothing logged in ${formatMonth(month)}. Tap a day above, or “Wearing it” on today’s brief, and the record starts here.`}
            action={
              !filtered ? (
                <Link to="/" className="btn-ghost">
                  Open today’s brief
                </Link>
              ) : undefined
            }
          />
        )}
        {logs && logs.length > 0 && (
          <div className="mt-4 grid gap-3">
            {groupByDay(logs).map(([dayK, dayLogs], i) =>
              dayLogs.length > 1 ? (
                // A day with several looks — one header, then each look by time.
                <div key={dayK} className="rise-stagger" style={{ '--i': i } as CSSProperties}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-label text-accent-text">
                    {formatDay(dayLogs[0].wornOn)} <span className="text-ink/40">· {dayLogs.length} looks</span>
                  </p>
                  <div className="grid gap-2 border-l border-brass/25 pl-4">
                    {dayLogs.map((log) => (
                      <DayCard key={log.id} log={log} heading="time" onChange={upsert} onRemove={remove} onNote={flash} />
                    ))}
                  </div>
                </div>
              ) : (
                <div key={dayK} className="rise-stagger" style={{ '--i': i } as CSSProperties}>
                  <DayCard log={dayLogs[0]} onChange={upsert} onRemove={remove} onNote={flash} />
                </div>
              ),
            )}
          </div>
        )}
      </section>

      {mostWorn.length > 0 && (
        <section className="mt-10">
          <SectionHead className="!mb-1" title="Workhorses" />
          <p className="text-sm text-ink/55">The pieces doing the most work, and what each wear has cost so far.</p>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6 lg:gap-6">
            {mostWorn.map((item) => (
              <Link key={item.itemId} to={`/journal?item=${item.itemId}`} className="press block min-w-0">
                <GarmentTile imageUrl={item.imageUrl} label={item.subtype ?? item.category} sublabel={`${item.wearCount}× worn${item.costPerWear != null ? ` · ${money(item.costPerWear)}/wear` : ''}`} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {orphans.length > 0 && (
        <section className="mt-10">
          <SectionHead className="!mb-1" title="Sitting idle" />
          <p className="text-sm text-ink/55">Not worn in over ninety days. Ask for a look built around one, or let it go and draft the listing.</p>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6 lg:gap-6">
            {orphans.map((item) => (
              <div key={item.itemId} className="min-w-0 opacity-80">
                <GarmentTile imageUrl={item.imageUrl} label={item.subtype ?? item.category} />
                <button type="button" onClick={() => setResaleItemId(item.itemId)} className="btn-quiet btn-quiet-sm mt-1 w-full justify-center">
                  Draft a listing
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* A removed day is gone, not confirmed: the undo bar is the way back. */}
      {pending && <UndoBar message={`${formatDay(pending.log.wornOn)} removed.`} onUndo={undo} />}

      {resaleItemId && <ResaleModal itemId={resaleItemId} onClose={() => setResaleItemId(null)} />}
      {logging && <LogDayModal date={logging} onClose={() => setLogging(null)} onLogged={logged} onNote={flash} />}
    </PageShell>
  )
}
