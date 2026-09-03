import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Arch, GarmentTile, Modal, PageShell, Toast, useFlash, SkeletonBlock } from '../components/ui'
import { Spinner } from '../components/Spinner'
import { usePageTitle } from '../lib/usePageTitle'
import { deleteTrip, getTrip, replanTripDay, swapTripItem, updateTrip, type TripPage as TripPageData } from '../lib/brief'
import { getWardrobe } from '../lib/wardrobe'
import type { WardrobeItem } from '../lib/types'
import { resolveImageUrl } from '../lib/api'
import { tempRange } from '../lib/units'

// A trip is a page. Open it on packing day; look back on it after.

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function nights(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000) + 1
}
const name = (i: WardrobeItem) => i.subtype ?? i.category

/** Add a piece from the closet to the capsule. */
function AddPieceModal({ exclude, onClose, onAdd }: { exclude: Set<string>; onClose: () => void; onAdd: (ids: string[]) => Promise<void> }) {
  const [pieces, setPieces] = useState<WardrobeItem[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    getWardrobe()
      .then((r) => setPieces(r.items.filter((i) => i.status === 'ready' && !exclude.has(i.id))))
      .catch(() => setPieces([]))
  }, [exclude])
  return (
    <Modal open onClose={onClose} title="Add from the closet">
      {pieces === null && (
        <div className="py-8 text-center text-ink/40">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {pieces && pieces.length === 0 && <p className="rounded-[3px] border border-dashed border-ink/20 p-5 text-center text-sm text-ink/60">Everything you own is already packed.</p>}
      {pieces && pieces.length > 0 && (
        <div className="grid max-h-[46vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
          {pieces.map((p) => {
            const on = picked.includes(p.id)
            return (
              <button key={p.id} type="button" onClick={() => setPicked((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))} aria-pressed={on} className="press text-left" aria-label={`${on ? 'Remove' : 'Add'} ${name(p)}`}>
                <Arch aspect="aspect-[4/5]" bright={on}>
                  <img src={resolveImageUrl(p.imageUrl)} alt="" loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                </Arch>
                <p className="mt-1 truncate text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/55">{name(p)}</p>
              </button>
            )
          })}
        </div>
      )}
      <div className="action-row mt-5">
        <button
          type="button"
          disabled={picked.length === 0 || saving}
          onClick={() => {
            setSaving(true)
            void onAdd(picked).finally(() => setSaving(false))
          }}
          className="btn-primary disabled:opacity-40"
        >
          {saving ? 'Packing…' : picked.length ? `Pack ${picked.length} more` : 'Pack'}
        </button>
        <button type="button" onClick={onClose} className="btn-quiet">
          Cancel
        </button>
      </div>
    </Modal>
  )
}

export function TripPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { toast, flash } = useFlash()
  const [data, setData] = useState<TripPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [swapping, setSwapping] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [replanning, setReplanning] = useState<number | null>(null)
  const saveTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await getTrip(id)
      setData(r)
      setChecked(new Set(r.trip.checked))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the trip.')
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  usePageTitle(data ? data.trip.destination : 'Trip')

  // The checklist remembers: ticks save themselves, a moment after the last one.
  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        updateTrip(id, { checked: [...next] }).catch(() => flash('Couldn’t save the checklist. Try again.'))
      }, 500)
      return next
    })
  }

  async function notThis(item: WardrobeItem) {
    setSwapping(item.id)
    try {
      const r = await swapTripItem(id, item.id)
      flash(`The ${name(item)} is out; the ${name(r.swappedFor)} came in.`)
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not swap that.')
    } finally {
      setSwapping(null)
    }
  }
  async function unpack(item: WardrobeItem) {
    if (!data) return
    try {
      await updateTrip(id, { packedItemIds: data.trip.packedItemIds.filter((x) => x !== item.id) })
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not unpack that.')
    }
  }
  async function add(ids: string[]) {
    if (!data) return
    try {
      await updateTrip(id, { packedItemIds: [...data.trip.packedItemIds, ...ids] })
      setAdding(false)
      await load()
      flash(`${ids.length} more packed.`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not pack that.')
    }
  }
  async function replan(index: number) {
    setReplanning(index)
    try {
      await replanTripDay(id, index)
      await load()
      flash('That day is replanned from the capsule.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not replan that day.')
    } finally {
      setReplanning(null)
    }
  }
  async function remove() {
    try {
      await deleteTrip(id)
      navigate('/trips', { replace: true })
    } catch {
      flash('Couldn’t remove the trip. Try again.')
    }
  }

  if (error) {
    return (
      <PageShell>
        <p className="alert-error" role="alert">
          {error}
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => { setError(null); void load() }} className="btn-primary">
            Try again
          </button>
          <Link to="/trips" className="btn-ghost inline-flex">
            All trips
          </Link>
        </div>
      </PageShell>
    )
  }
  if (!data) {
    return (
      <PageShell>
        <div aria-busy="true" aria-label="Loading the trip">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="mt-3 h-12 w-2/3" />
          <SkeletonBlock className="mt-3 h-4 w-40" />
          <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="arch-bezel aspect-[5/6] animate-pulse opacity-60"><div className="arch-niche h-full w-full" /></div>
            ))}
          </div>
        </div>
      </PageShell>
    )
  }

  const { trip, capsule, days, recap } = data
  const today = localDay(new Date())
  const past = trip.endDate < today
  const on = !past && trip.startDate <= today
  const plan = trip.plan
  const capsuleIds = new Set(trip.packedItemIds)
  const ticked = capsule.filter((i) => checked.has(`item-${i.id}`)).length + (plan?.essentials ?? []).filter((e) => checked.has(`extra-${e}`)).length
  const total = capsule.length + (plan?.essentials.length ?? 0)

  return (
    <PageShell>
      <Toast msg={toast} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">
            <Link to="/trips" className="hover:underline">
              Trips
            </Link>{' '}
            · {past ? 'past' : on ? 'on now' : 'upcoming'}
          </p>
          <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
            {trip.destination}, <em className="text-brass">{nights(trip.startDate, trip.endDate)} days.</em>
          </h1>
          <p className="mt-3 animate-rise-1 text-sm text-ink/55">
            {formatDay(trip.startDate)} to {formatDay(trip.endDate)}
            {trip.activities ? ` · ${trip.activities}` : ''}
          </p>
        </div>
        <div className="action-row animate-rise-1">
          {!past && (
            <Link to="/" className="btn-ghost">
              Today’s brief
            </Link>
          )}
          {confirmRemove ? (
            <>
              <button type="button" onClick={() => void remove()} className="btn-ghost !border-[rgb(var(--c-danger))]/60 !text-[rgb(var(--c-danger))]">
                Yes, remove it
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className="btn-quiet">
                Keep it
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className="btn-quiet">
              Remove the trip
            </button>
          )}
        </div>
      </header>

      {recap && (
        <section className="plaque mt-8 animate-rise-2 p-5 pl-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">Looking back</p>
          <p className="mt-1 font-display text-2xl text-ink">
            {recap.worn} of {recap.packed} pieces worn.
            {recap.unworn.length === 0 ? ' Packed exactly right.' : recap.unworn.length === recap.packed ? ' Nothing was logged on the road.' : ` The ${recap.unworn.map(name).slice(0, 3).join(', ')} never left the case.`}
          </p>
          {recap.unworn.length > 0 && recap.unworn.length < recap.packed && <p className="mt-1 text-sm text-ink/55">Next time, pack {recap.worn || recap.packed - 1}.</p>}
          {recap.unworn.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {recap.unworn.map((i) => (
                <Arch key={i.id} aspect="aspect-[4/5]" className="w-12 opacity-70">
                  <img src={resolveImageUrl(i.imageUrl)} alt={name(i)} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                </Arch>
              ))}
            </div>
          )}
        </section>
      )}

      {plan && plan.forecast.days.length > 0 && (
        <section className="mt-8 animate-rise-2">
          <h2 className="font-display text-2xl font-medium text-ink">{plan.forecast.location}</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
            {plan.forecast.days.map((d) => (
              <div key={d.date} className="plaque min-w-[7.5rem] shrink-0 p-3 pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brass">{formatDay(d.date)}</p>
                <p className="mt-1 font-display text-xl text-ink [font-variant-numeric:tabular-nums]">
                  {tempRange(d.minC, d.maxC)}
                </p>
                <p className="mt-0.5 text-xs capitalize text-ink/55">
                  {d.description}
                  {d.rainChance ? ' · rain' : ''}
                </p>
              </div>
            ))}
          </div>
          {plan.forecast.partial && <p className="mt-1 text-xs text-ink/45">Part of the trip was beyond the forecast, so it’s packed for typical seasonal weather.</p>}
        </section>
      )}

      <section className="mt-10 animate-rise-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-medium text-ink">The capsule · {capsule.length} pieces</h2>
            {plan?.rationale && <p className="mt-1 max-w-2xl text-sm text-ink/60">{plan.rationale}</p>}
            {!past && <p className="mt-1 text-xs text-ink/45">“Not this” swaps in the closest piece you own. Unpack takes it out.</p>}
          </div>
          {!past && (
            <button type="button" onClick={() => setAdding(true)} className="btn-ghost btn-sm">
              Add from the closet
            </button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {capsule.map((item) => (
            <div key={item.id} className={`min-w-0 ${swapping === item.id ? 'opacity-50' : ''}`}>
              <GarmentTile imageUrl={item.imageUrl} label={name(item)} />
              {!past && (
                <div className="mt-1 flex justify-center gap-1">
                  <button type="button" disabled={swapping !== null} onClick={() => void notThis(item)} className="press text-[11px] font-semibold text-brass hover:underline disabled:opacity-40">
                    Not this
                  </button>
                  <span className="text-[11px] text-ink/25">·</span>
                  <button type="button" disabled={swapping !== null || capsule.length <= 1} onClick={() => void unpack(item)} className="press text-[11px] font-semibold text-ink/45 hover:text-ink hover:underline disabled:opacity-40">
                    Unpack
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {days.length > 0 && (
        <section className="mt-10 animate-rise-3">
          <h2 className="font-display text-2xl font-medium text-ink">Day by day</h2>
          <div className="card mt-4 px-5">
            {days.map((day, i) => (
              <article key={day.label} className="flex flex-col gap-2 border-t border-ink/10 py-4 first:border-t-0 sm:flex-row sm:items-center sm:gap-4">
                <div className="sm:w-40 sm:shrink-0">
                  <p className="text-sm font-semibold text-ink">{day.label}</p>
                  <p className="mt-0.5 text-xs text-ink/50">{day.note}</p>
                  {!past && (
                    <button type="button" disabled={replanning !== null} onClick={() => void replan(i)} className="press mt-1 text-[11px] font-semibold text-brass hover:underline disabled:opacity-40">
                      {replanning === i ? 'Replanning…' : 'Replan this day'}
                    </button>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  {day.items.map((item) => (
                    <Arch key={item.id} aspect="aspect-[4/5]" className="w-12">
                      <img src={resolveImageUrl(item.imageUrl)} alt={name(item)} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                    </Arch>
                  ))}
                  {day.items.length === 0 && <p className="text-xs text-ink/40">Nothing left in the capsule for this day.</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!past && (
        <section className="mt-10 animate-rise-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl font-medium text-ink">Checklist</h2>
            <p className="text-xs text-ink/45">
              {ticked} of {total} packed · it remembers
            </p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {capsule.map((item) => {
              const key = `item-${item.id}`
              const on = checked.has(key)
              return (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[3px] border border-ink/10 bg-surface px-4 py-2.5 text-sm">
                  <input type="checkbox" checked={on} onChange={() => toggle(key)} className="h-4 w-4 accent-iris" />
                  <span className={on ? 'capitalize text-ink/35 line-through' : 'capitalize text-ink/80'}>{name(item)}</span>
                </label>
              )
            })}
            {(plan?.essentials ?? []).map((extra) => {
              const key = `extra-${extra}`
              const on = checked.has(key)
              return (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[3px] border border-dashed border-brass/40 bg-iris-soft/40 px-4 py-2.5 text-sm">
                  <input type="checkbox" checked={on} onChange={() => toggle(key)} className="h-4 w-4 accent-iris" />
                  <span className={on ? 'text-ink/35 line-through' : 'text-ink/80'}>{extra}</span>
                </label>
              )
            })}
          </div>
          {(plan?.essentials.length ?? 0) > 0 && (
            <p className="mt-3 text-xs text-ink/45">
              Missing one of the dashed lines?{' '}
              <Link to="/closet/store" className="font-semibold text-brass hover:underline">
                Photograph it in the store
              </Link>{' '}
              and it joins your wishlist.
            </p>
          )}
        </section>
      )}

      {adding && <AddPieceModal exclude={capsuleIds} onClose={() => setAdding(false)} onAdd={add} />}
    </PageShell>
  )
}
