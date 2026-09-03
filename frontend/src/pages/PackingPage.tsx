import { useCallback, useEffect, useState, type FormEvent, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Arch, GarmentTile, PageShell, Tabs, SkeletonBlock, LoadError } from '../components/ui'
import { usePageTitle } from '../lib/usePageTitle'
import { packForTrip, packLook } from '@zauq/shared/wardrobe'
import { createTrip, getTrips, type Trip } from '@zauq/shared/brief'
import type { PackingResponse, WardrobeItem } from '@zauq/shared/types'
import { Spinner } from '../components/Spinner'
import { resolveImageUrl } from '../lib/api'
import { tempRange } from '@zauq/shared/units'

// Trips: a destination and dates become a capsule packed from the closet.
// Save it and the trip becomes a page: the plan, a checklist that
// remembers, and the brief dressing you from the suitcase while you're away.

const PLANS: { key: string; label: string }[] = [
  { key: 'city', label: 'City days' },
  { key: 'beach', label: 'Beach' },
  { key: 'work', label: 'Work' },
  { key: 'a wedding', label: 'A wedding' },
  { key: 'hiking', label: 'Hiking' },
  { key: 'cold weather', label: 'Cold' },
]

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function TripRow({ t, past }: { t: Trip; past?: boolean }) {
  const today = localDay(new Date())
  const on = !past && t.startDate <= today && t.endDate >= today
  return (
    <Link to={`/trips/${t.id}`} className="plaque card-hover press flex items-center justify-between gap-3 p-4 pl-5">
      <div className="min-w-0">
        <p className="font-display text-lg font-medium text-ink">{t.destination}</p>
        <p className="text-xs text-ink/55">
          {formatDay(t.startDate)} to {formatDay(t.endDate)} · {t.packedItemIds.length} pieces packed
        </p>
        <p className="mt-1 font-display text-xs italic text-ink/45">{past ? 'what you packed, and what you wore' : on ? 'on now, the brief dresses you from the capsule' : 'the plan, and a checklist that remembers'}</p>
      </div>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">Open →</span>
    </Link>
  )
}

export function PackingPage() {
  const navigate = useNavigate()
  usePageTitle('Trips')
  const today = localDay(new Date())
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [plans, setPlans] = useState<string[]>([])
  const [activities, setActivities] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackingResponse | null>(null)
  // Extra looks added per day in the preview, on top of each day's base look.
  const [extraLooks, setExtraLooks] = useState<Record<number, { id: string; items: WardrobeItem[] }[]>>({})
  const [addingLook, setAddingLook] = useState<number | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [past, setPast] = useState<Trip[]>([])
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [savingTrip, setSavingTrip] = useState(false)
  const [tripsLoaded, setTripsLoaded] = useState(false)
  const [tripsFailed, setTripsFailed] = useState(false)

  const loadTrips = useCallback(() => {
    setTripsFailed(false)
    getTrips()
      .then((r) => {
        setTrips(r.trips)
        setPast(r.past)
        setTripsLoaded(true)
      })
      .catch(() => {
        setTripsFailed(true)
        setTripsLoaded(true)
      })
  }, [])
  useEffect(() => {
    loadTrips()
  }, [loadTrips])

  const planText = [...plans, activities.trim()].filter(Boolean).join(', ')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setResult(null)
    setExtraLooks({})
    try {
      setResult(await packForTrip({ destination: destination.trim(), startDate, endDate, activities: planText || undefined }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan your packing.')
    } finally {
      setLoading(false)
    }
  }

  async function addPreviewLook(dayIndex: number) {
    if (!result) return
    setAddingLook(dayIndex)
    try {
      const capsuleIds = result.plan.capsule.map((c) => c.id)
      const base = result.plan.days[dayIndex].items.map((i) => i.id)
      const extras = (extraLooks[dayIndex] ?? []).map((l) => l.items.map((i) => i.id))
      const { items } = await packLook(capsuleIds, [base, ...extras])
      setExtraLooks((prev) => ({ ...prev, [dayIndex]: [...(prev[dayIndex] ?? []), { id: crypto.randomUUID(), items }] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add a look.')
    } finally {
      setAddingLook(null)
    }
  }
  function removePreviewLook(dayIndex: number, lookId: string) {
    setExtraLooks((prev) => ({ ...prev, [dayIndex]: (prev[dayIndex] ?? []).filter((l) => l.id !== lookId) }))
  }

  async function handleSaveTrip() {
    if (!result) return
    setSavingTrip(true)
    try {
      const { trip } = await createTrip({
        destination: destination.trim(),
        startDate,
        endDate,
        activities: planText || null,
        packedItemIds: result.plan.capsule.map((c) => c.id),
        plan: {
          rationale: result.plan.rationale,
          essentials: result.plan.essentials,
          forecast: result.forecast,
          days: result.plan.days.map((d, i) => {
            const base = d.items.map((x) => x.id)
            const looks = [
              { id: 'main', itemIds: base },
              ...(extraLooks[i] ?? []).map((l) => ({ id: l.id, itemIds: l.items.map((x) => x.id) })),
            ]
            return { label: d.label, note: d.note, itemIds: base, looks }
          }),
        },
      })
      navigate(`/trips/${trip.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the trip.')
      setSavingTrip(false)
    }
  }

  const list = tab === 'upcoming' ? trips : past

  return (
    <PageShell>
      <header>
        <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">Trips</p>
        <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
          Pack from <em className="text-brass">your closet.</em>
        </h1>
        <p className="mt-3 max-w-xl animate-rise-1 text-sm text-ink/55">Where and when. Your stylist builds the capsule from clothes you own, plans each day, and lists the rest. Save it, and the trip keeps.</p>
      </header>

      {!tripsLoaded && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading your trips">
          {[0, 1].map((i) => (
            <div key={i} className="plaque p-5">
              <SkeletonBlock className="h-5 w-2/3" />
              <SkeletonBlock className="mt-3 h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {tripsLoaded && tripsFailed && (
        <LoadError className="min-h-[24vh]" message="Couldn’t load your trips. Check your connection and try again." onRetry={loadTrips} />
      )}

      {tripsLoaded && !tripsFailed && trips.length === 0 && past.length === 0 && (
        <div className="mt-8 max-w-lg animate-rise-2">
          <p className="font-display text-2xl italic text-ink/70">No trips yet.</p>
          <p className="mt-2 text-sm text-ink/55">Name a destination and dates below, and your stylist packs a capsule from your own closet.</p>
        </div>
      )}

      {tripsLoaded && !tripsFailed && (trips.length > 0 || past.length > 0) && (
        <section className="mt-8 animate-rise-2">
          <Tabs
            label="Trips"
            value={tab}
            onChange={setTab}
            items={[
              { key: 'upcoming', label: 'Upcoming', count: trips.length },
              { key: 'past', label: 'Past', count: past.length },
            ]}
          />
          {list.length === 0 ? (
            <p className="mt-4 text-sm text-ink/50">{tab === 'upcoming' ? 'Nothing planned yet. Start one below.' : 'No trips have ended yet.'}</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {list.map((t, i) => (
                <div key={t.id} className="rise-stagger" style={{ '--i': i } as CSSProperties}>
                  <TripRow t={t} past={tab === 'past'} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <form onSubmit={handleSubmit} className="card mt-8 animate-rise-2 p-5 sm:p-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">A new trip</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="pack-destination" className="label">
              Destination
            </label>
            <input id="pack-destination" type="text" required value={destination} onChange={(e) => setDestination(e.target.value)} className="field" placeholder="e.g. Lisbon" />
          </div>
          <div>
            <label htmlFor="pack-start" className="label">
              From
            </label>
            <input
              id="pack-start"
              type="date"
              required
              value={startDate}
              min={today}
              onChange={(e) => {
                setStartDate(e.target.value)
                if (e.target.value > endDate) setEndDate(e.target.value)
              }}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="pack-end" className="label">
              To
            </label>
            <input id="pack-end" type="date" required value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="field" />
          </div>
        </div>
        <div className="mt-4">
          <p className="label">Plans</p>
          <div className="flex flex-wrap gap-2">
            {PLANS.map((p) => {
              const on = plans.includes(p.key)
              return (
                <button key={p.key} type="button" onClick={() => setPlans((s) => (on ? s.filter((x) => x !== p.key) : [...s, p.key]))} aria-pressed={on} className="chip">
                  {p.label}
                </button>
              )
            })}
          </div>
          <input id="pack-activities" type="text" value={activities} onChange={(e) => setActivities(e.target.value)} className="field field-sm mt-3 max-w-md" placeholder="Anything else: a dinner, a conference…" aria-label="Other plans" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary mt-5">
          {loading ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Packing…
            </>
          ) : (
            'Plan the capsule'
          )}
        </button>
        {error && (
          <p className="mt-4 alert-error" role="alert">
            {error}
          </p>
        )}
      </form>

      {result && (
        <div className="mt-10 space-y-10">
          <section className="animate-rise">
            <h2 className="font-display text-2xl font-medium text-ink">{result.forecast.location}</h2>
            {result.forecast.days.length > 0 && (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
                {result.forecast.days.map((d) => (
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
            )}
            {result.forecast.partial && <p className="mt-2 text-xs text-ink/45">Part of the trip is beyond the forecast horizon, so it’s packed for typical seasonal weather.</p>}
          </section>

          <section className="animate-rise-1">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-medium text-ink">The capsule · {result.plan.capsule.length} pieces</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink/60">{result.plan.rationale}</p>
              </div>
              <button type="button" onClick={() => void handleSaveTrip()} disabled={savingTrip} className="btn-primary btn-sm">
                {savingTrip ? 'Saving…' : 'Save the trip'}
              </button>
            </div>
            <p className="mt-1 text-xs text-ink/45">Save it to edit the capsule, tick things off, and have the brief dress you from it.</p>
            <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {result.plan.capsule.map((item) => (
                <div key={item.id} className="min-w-0">
                  <GarmentTile imageUrl={item.imageUrl} label={item.subtype ?? item.category} />
                </div>
              ))}
            </div>
          </section>

          {result.plan.days.length > 0 && (
            <section className="animate-rise-2">
              <h2 className="font-display text-2xl font-medium text-ink">Day by day</h2>
              <div className="card mt-4 px-5">
                {result.plan.days.map((day, i) => {
                  const looks = [
                    { id: 'main', items: day.items, removable: false },
                    ...(extraLooks[i] ?? []).map((l) => ({ id: l.id, items: l.items, removable: true })),
                  ]
                  return (
                    <article key={day.label} className="border-t border-ink/10 py-4 first:border-t-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">{day.label}</p>
                          {day.note && <p className="mt-0.5 text-xs text-ink/50">{day.note}</p>}
                        </div>
                        <button type="button" disabled={addingLook !== null} onClick={() => void addPreviewLook(i)} className="press text-[11px] font-semibold text-brass hover:underline disabled:opacity-40">
                          {addingLook === i ? '…' : '+ Add a look'}
                        </button>
                      </div>
                      <div className="mt-3 flex flex-col gap-3">
                        {looks.map((look, li) => (
                          <div key={look.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                            <div className="sm:w-32 sm:shrink-0">
                              {looks.length > 1 && (
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brass">
                                  {['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'][li] || `Look ${li + 1}`}
                                </p>
                              )}
                              {look.removable && (
                                <button type="button" onClick={() => removePreviewLook(i, look.id)} className="press mt-1 text-[11px] font-medium text-ink/45 hover:text-ink">
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                              {look.items.map((item) => (
                                <Arch key={item.id} aspect="aspect-[4/5]" className="w-12">
                                  <img src={resolveImageUrl(item.imageUrl)} alt={item.subtype ?? item.category} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                                </Arch>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {result.plan.essentials.length > 0 && (
            <section className="animate-rise-3">
              <h2 className="font-display text-2xl font-medium text-ink">And the rest</h2>
              <p className="mt-1 text-sm text-ink/55">Worth packing, not in the closet. They join the checklist once the trip is saved.</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {result.plan.essentials.map((e) => (
                  <li key={e} className="rounded-[3px] border border-dashed border-brass/40 px-3 py-1.5 text-sm text-ink/75">
                    {e}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PageShell>
  )
}
