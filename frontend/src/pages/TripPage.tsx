import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Arch, ArchSkeleton, EmptyState, GarmentTile, LoadError, Modal, PageHead, PageShell, SectionHead, Toast, useFlash, SkeletonBlock } from '../components/ui'
import { usePageTitle } from '../lib/usePageTitle'
import { addChecklistItem, addTripLook, deleteTrip, getTrip, removeChecklistItem, removeTripLook, replanTripDay, setTripLookItems, swapTripItem, updateTrip, type TripPage as TripPageData } from '@zauq/shared/brief'
import { getWardrobe } from '@zauq/shared/wardrobe'
import type { WardrobeItem } from '@zauq/shared/types'
import { resolveImageUrl } from '../lib/api'
import { tempRange } from '@zauq/shared/units'

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

// The checklist reads best packed by kind — all the tops, then bottoms, shoes…
const CHECKLIST_ORDER: [string, string[]][] = [
  ['Tops', ['top']],
  ['Bottoms', ['bottom']],
  ['Dresses', ['dress']],
  ['Outerwear', ['outerwear']],
  ['Shoes', ['footwear']],
  ['Accessories', ['accessory', 'bag']],
]
function checklistGroups(items: WardrobeItem[]): [string, WardrobeItem[]][] {
  const groups: [string, WardrobeItem[]][] = []
  const used = new Set<string>()
  for (const [label, cats] of CHECKLIST_ORDER) {
    const g = items.filter((it) => cats.includes(it.category))
    g.forEach((it) => used.add(it.id))
    if (g.length) groups.push([label, g])
  }
  const rest = items.filter((it) => !used.has(it.id))
  if (rest.length) groups.push(['Other', rest])
  return groups
}

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
      {pieces === null && <ArchSkeleton count={8} aspect="aspect-[4/5]" className="grid grid-cols-4 gap-2 sm:grid-cols-6" />}
      {pieces && pieces.length === 0 && <EmptyState line="Everything you own is already packed." />}
      {pieces && pieces.length > 0 && (
        <div className="grid max-h-[46vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
          {pieces.map((p) => {
            const on = picked.includes(p.id)
            return (
              <button key={p.id} type="button" onClick={() => setPicked((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))} aria-pressed={on} className="press text-left" aria-label={`${on ? 'Remove' : 'Add'} ${name(p)}`}>
                <Arch aspect="aspect-[4/5]" bright={on}>
                  <img src={resolveImageUrl(p.imageUrl)} alt="" loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                </Arch>
                <p className="mt-1 truncate text-center text-[10px] font-semibold uppercase tracking-label-xs text-ink/55">{name(p)}</p>
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
  const [newItem, setNewItem] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [picker, setPicker] = useState<{ index: number; lookId: string; selected: string[] } | null>(null)
  const [savingPicker, setSavingPicker] = useState(false)
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
  async function replan(index: number, lookId?: string) {
    setReplanning(index)
    try {
      await replanTripDay(id, index, lookId)
      await load()
      flash('That look is replanned from the capsule.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not replan that look.')
    } finally {
      setReplanning(null)
    }
  }
  async function addLook(index: number) {
    setReplanning(index)
    try {
      await addTripLook(id, index)
      await load()
      flash('Another look for that day, from the capsule.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not add a look.')
    } finally {
      setReplanning(null)
    }
  }
  async function removeLook(index: number, lookId: string) {
    setReplanning(index)
    try {
      await removeTripLook(id, index, lookId)
      await load()
      flash('Taken off the day.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not remove that look.')
    } finally {
      setReplanning(null)
    }
  }
  async function addItem() {
    const text = newItem.trim()
    if (!text) return
    setSavingItem(true)
    try {
      await addChecklistItem(id, text)
      setNewItem('')
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not add that.')
    } finally {
      setSavingItem(false)
    }
  }
  async function removeCustom(text: string) {
    try {
      await removeChecklistItem(id, text)
      await load()
    } catch {
      flash('Could not remove that.')
    }
  }
  function togglePiece(itemId: string) {
    setPicker((p) => (p ? { ...p, selected: p.selected.includes(itemId) ? p.selected.filter((x) => x !== itemId) : [...p.selected, itemId] } : p))
  }
  async function savePicker() {
    if (!picker || picker.selected.length === 0) return
    setSavingPicker(true)
    try {
      await setTripLookItems(id, picker.index, picker.lookId, picker.selected)
      setPicker(null)
      await load()
      flash('Look built.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save that look.')
    } finally {
      setSavingPicker(false)
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
        <LoadError message={error} onRetry={() => { setError(null); void load() }} />
        <p className="text-center">
          <Link to="/trips" className="btn-quiet">
            All trips
          </Link>
        </p>
      </PageShell>
    )
  }
  if (!data) {
    return (
      <PageShell>
        <div aria-busy="true" aria-label="Loading the trip">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-2/3" />
          <SkeletonBlock className="mt-3 h-4 w-40 !bg-ink/[0.07]" />
          <ArchSkeleton count={6} className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6 lg:gap-6" />
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
      <PageHead
        eyebrow={
          <>
            <Link to="/trips" className="hover:underline">
              Trips
            </Link>{' '}
            · {past ? 'past' : on ? 'on now' : 'upcoming'}
          </>
        }
        title={
          <>
            {trip.destination}, <em className="text-accent-text">{nights(trip.startDate, trip.endDate)} days.</em>
          </>
        }
        line={
          <>
            {formatDay(trip.startDate)} to {formatDay(trip.endDate)}
            {trip.activities ? ` · ${trip.activities}` : ''}
          </>
        }
        aside={
          <div className="action-row">
            {!past && (
              <Link to="/" className="btn-ghost">
                Today’s brief
              </Link>
            )}
            {confirmRemove ? (
              <>
                <button type="button" onClick={() => void remove()} className="btn-danger">
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
        }
      />

      {recap && (
        <section className="plaque mt-8 animate-rise-2 p-5 pl-6">
          <p className="eyebrow">Looking back</p>
          <p className="mt-2 font-display text-2xl font-medium text-ink">
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
        <section className="mt-10 animate-rise-2">
          <SectionHead title={plan.forecast.location} />
          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
            {plan.forecast.days.map((d) => (
              <div key={d.date} className="plaque min-w-[7.5rem] shrink-0 p-3 pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-label text-accent-text">{formatDay(d.date)}</p>
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
        <SectionHead
          className={plan?.rationale || !past ? '!mb-1' : ''}
          title={`The capsule · ${capsule.length} pieces`}
          action={
            !past ? (
              <button type="button" onClick={() => setAdding(true)} className="btn-ghost btn-sm">
                Add from the closet
              </button>
            ) : undefined
          }
        />
        {plan?.rationale && <p className="max-w-2xl text-sm text-ink/60">{plan.rationale}</p>}
        {!past && <p className="mt-1 text-xs text-ink/45">“Not this” swaps in the closest piece you own. Unpack takes it out.</p>}
        <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6 lg:gap-6">
          {capsule.map((item) => (
            <div key={item.id} className={`min-w-0 ${swapping === item.id ? 'opacity-50' : ''}`}>
              <GarmentTile imageUrl={item.imageUrl} label={name(item)} />
              {!past && (
                <div className="mt-1 flex justify-center gap-1">
                  <button type="button" disabled={swapping !== null} onClick={() => void notThis(item)} className="press text-[11px] font-semibold text-accent-text hover:underline disabled:opacity-50">
                    Not this
                  </button>
                  <span className="text-[11px] text-ink/25">·</span>
                  <button type="button" disabled={swapping !== null || capsule.length <= 1} onClick={() => void unpack(item)} className="press text-[11px] font-semibold text-ink/55 hover:text-ink hover:underline disabled:opacity-50">
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
          <SectionHead title="Day by day" />
          <div className="card px-5">
            {days.map((day, i) => (
              <article key={day.label} className="border-t border-ink/10 py-4 first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{day.label}</p>
                    {day.note && <p className="mt-0.5 text-xs text-ink/50">{day.note}</p>}
                  </div>
                  {!past && (
                    <button type="button" disabled={replanning !== null} onClick={() => void addLook(i)} className="press text-[11px] font-semibold text-brass hover:underline disabled:opacity-40">
                      {replanning === i ? '…' : '+ Add a look'}
                    </button>
                  )}
                </div>
                {day.verdict?.ok === false && (
                  <Alert tone="warning" className="mt-4">
                    {[...(day.verdict.violations ?? []), ...(day.verdict.warnings ?? [])].map((r) => r?.message).filter(Boolean).join(' · ') || 'Nothing in the closet makes this complete.'}
                  </Alert>
                )}
                <div className="mt-3 flex flex-col gap-3">
                  {day.looks.map((look, li) => (
                    <div key={look.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                      <div className="sm:w-40 sm:shrink-0">
                        {(day.looks.length > 1 || look.label || look.time) && (
                          <p className="text-[11px] font-semibold uppercase tracking-label-sm text-accent-text">
                            {look.label || ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'][li] || `Look ${li + 1}`}
                            {look.time && <span className="ml-1.5 normal-case tracking-normal text-ink/40">{look.time}</span>}
                          </p>
                        )}
                        {look.occasion && <p className="mt-0.5 text-xs text-ink/50">{look.occasion}</p>}
                        {!past && (
                          <div className="mt-1 flex flex-wrap gap-x-3">
                            <button type="button" onClick={() => setPicker({ index: i, lookId: look.id, selected: look.items.map((it) => it.id) })} className="press text-[11px] font-semibold text-brass hover:underline">
                              Pick pieces
                            </button>
                            <button type="button" disabled={replanning !== null} onClick={() => void replan(i, look.id)} className="press text-[11px] font-medium text-ink/45 hover:text-ink disabled:opacity-40">
                              {replanning === i ? 'Replanning…' : 'Auto'}
                            </button>
                            {day.looks.length > 1 && (
                              <button type="button" disabled={replanning !== null} onClick={() => void removeLook(i, look.id)} className="press text-[11px] font-medium text-ink/45 hover:text-ink disabled:opacity-40">
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                        {look.items.map((item) => (
                          <Arch key={item.id} aspect="aspect-[4/5]" className="w-12">
                            <img src={resolveImageUrl(item.imageUrl)} alt={name(item)} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                          </Arch>
                        ))}
                        {look.items.length === 0 && <p className="text-xs text-ink/40">Nothing left in the capsule for this look.</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!past && (
        <section className="mt-10 animate-rise-3">
          <SectionHead
            title="Checklist"
            action={
              <p className="text-xs text-ink/45 [font-variant-numeric:tabular-nums]">
                {ticked} of {total} packed · it remembers
              </p>
            }
          />
          {/* Progress: the case filling up */}
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-ink/10" role="progressbar" aria-valuenow={ticked} aria-valuemax={total}>
            <div className="h-full rounded-[3px] bg-brass transition-[width] duration-300 ease-out" style={{ width: `${total ? Math.round((ticked / total) * 100) : 0}%` }} />
          </div>
          {/* Packed by kind, then the things to pick up */}
          <div className="mt-8 flex flex-col gap-8">
            {checklistGroups(capsule).map(([label, items]) => {
              const done = items.filter((it) => checked.has(`item-${it.id}`)).length
              return (
                <div key={label}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-label-xs text-ink/45">
                    {label} <span className="text-ink/30 [font-variant-numeric:tabular-nums]">{done}/{items.length}</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((item) => {
                      const key = `item-${item.id}`
                      const on = checked.has(key)
                      return (
                        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[3px] border border-ink/10 bg-surface px-4 py-2.5 text-sm">
                          <input type="checkbox" checked={on} onChange={() => toggle(key)} className="h-4 w-4 accent-iris" />
                          <span className={on ? 'capitalize text-ink/35 line-through' : 'capitalize text-ink/80'}>{name(item)}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {(plan?.essentials ?? []).length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-label-xs text-accent-text">
                  To pick up <span className="opacity-50 [font-variant-numeric:tabular-nums]">{(plan?.essentials ?? []).filter((e) => checked.has(`extra-${e}`)).length}/{plan?.essentials.length}</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
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
              </div>
            )}
            {(plan?.custom ?? []).length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-label-xs text-ink/45">
                  Yours <span className="text-ink/30 [font-variant-numeric:tabular-nums]">{(plan?.custom ?? []).filter((e) => checked.has(`extra-${e}`)).length}/{plan?.custom?.length}</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(plan?.custom ?? []).map((extra) => {
                    const key = `extra-${extra}`
                    const on = checked.has(key)
                    return (
                      <label key={key} className="group flex cursor-pointer items-center gap-3 rounded-[3px] border border-ink/10 bg-surface px-4 py-2.5 text-sm">
                        <input type="checkbox" checked={on} onChange={() => toggle(key)} className="h-4 w-4 accent-iris" />
                        <span className={on ? 'text-ink/35 line-through' : 'text-ink/80'}>{extra}</span>
                        <button type="button" onClick={(e) => { e.preventDefault(); void removeCustom(extra) }} className="ml-auto text-ink/25 transition hover:text-ink" aria-label={`Remove ${extra}`}>×</button>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            {/* Add your own — one place to track the whole trip */}
            <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); void addItem() }}>
              <label htmlFor="trip-own-item" className="sr-only">
                Add your own
              </label>
              <input id="trip-own-item" value={newItem} onChange={(e) => setNewItem(e.target.value)} className="field field-sm min-w-0 flex-1" placeholder="Add your own: passport, meds, a gift…" />
              <button type="submit" disabled={savingItem || !newItem.trim()} className="btn-ghost btn-sm shrink-0">{savingItem ? 'Adding…' : 'Add'}</button>
            </form>
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

      <Modal open={picker !== null} onClose={() => setPicker(null)} title="Build this look">
        {picker && (
          <>
            <p className="text-sm text-ink/55">Tap the pieces for this look — from what you packed.</p>
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {capsule.map((item) => (
                <GarmentTile key={item.id} imageUrl={item.imageUrl} label={name(item)} selected={picker.selected.includes(item.id)} onClick={() => togglePiece(item.id)} />
              ))}
            </div>
            <div className="action-row mt-5">
              <button type="button" disabled={savingPicker || picker.selected.length === 0} onClick={() => void savePicker()} className="btn-primary">
                {savingPicker ? 'Saving…' : `Use ${picker.selected.length} piece${picker.selected.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" onClick={() => setPicker(null)} className="btn-quiet">Cancel</button>
            </div>
          </>
        )}
      </Modal>
    </PageShell>
  )
}
