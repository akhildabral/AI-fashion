import { useEffect, useState, type FormEvent } from 'react'
import { Arch, GarmentTile, PageShell, Toast, useFlash } from '../components/ui'
import { usePageTitle } from '../lib/usePageTitle'
import { packForTrip } from '../lib/wardrobe'
import { createTrip, deleteTrip, getTrips, type Trip } from '../lib/brief'
import type { PackingResponse } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { resolveImageUrl } from '../lib/api'

// Trips: a destination and dates become a capsule packed from the closet,
// a day-by-day plan, and a checklist. Save the trip and the daily brief
// styles from the suitcase while you're away.

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function PackingPage() {
  const { toast, flash } = useFlash()
  usePageTitle('Trips')
  const today = new Date().toISOString().slice(0, 10)
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [activities, setActivities] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackingResponse | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [trips, setTrips] = useState<Trip[]>([])
  const [savingTrip, setSavingTrip] = useState(false)
  const [savedTripId, setSavedTripId] = useState<string | null>(null)

  useEffect(() => {
    getTrips().then((r) => setTrips(r.trips)).catch(() => undefined)
  }, [])

  async function handleSaveTrip() {
    if (!result) return
    setSavingTrip(true)
    try {
      const { trip } = await createTrip({
        destination: destination.trim(),
        startDate,
        endDate,
        activities: activities.trim() || null,
        packedItemIds: result.plan.capsule.map((c) => c.id),
      })
      setTrips((prev) => [...prev, trip].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)))
      setSavedTripId(trip.id)
      flash('Saved. Your brief will pack from this capsule.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the trip.')
    } finally {
      setSavingTrip(false)
    }
  }

  async function handleDeleteTrip(id: string) {
    try {
      await deleteTrip(id)
      setTrips((prev) => prev.filter((t) => t.id !== id))
      if (savedTripId === id) setSavedTripId(null)
    } catch {
      flash('Could not remove the trip — try again.')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setResult(null)
    setChecked({})
    try {
      setResult(await packForTrip({ destination: destination.trim(), startDate, endDate, activities: activities.trim() || undefined }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan your packing.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <PageShell>
      <Toast msg={toast} />
      <header>
        <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">Trips</p>
        <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
          Pack from <em className="text-brass">your closet.</em>
        </h1>
        <p className="mt-3 max-w-xl animate-rise-1 text-sm text-ink/55">Where and when. Your stylist builds the capsule from clothes you own, plans each day, and lists the rest.</p>
      </header>

      {trips.length > 0 && (
        <section className="mt-8 animate-rise-2">
          <h2 className="font-display text-2xl font-medium text-ink">Upcoming</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {trips.map((t) => (
              <div key={t.id} className="plaque flex items-center justify-between gap-3 p-4 pl-5">
                <div className="min-w-0">
                  <p className="font-display text-lg font-medium text-ink">{t.destination}</p>
                  <p className="text-xs text-ink/55">
                    {formatDay(t.startDate)} to {formatDay(t.endDate)} · {t.packedItemIds.length} pieces packed
                  </p>
                  <p className="mt-1 font-display text-xs italic text-ink/45">your brief styles from this capsule while you’re away</p>
                </div>
                <button type="button" onClick={() => void handleDeleteTrip(t.id)} className="btn-ghost btn-sm">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit} className="card mt-8 animate-rise-2 p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <input id="pack-start" type="date" required value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="pack-end" className="label">
              To
            </label>
            <input id="pack-end" type="date" required value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="pack-activities" className="label">
              Plans (optional)
            </label>
            <input id="pack-activities" type="text" value={activities} onChange={(e) => setActivities(e.target.value)} className="field" placeholder="e.g. hiking, a wedding" />
          </div>
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
                      {d.minC}–{d.maxC}°
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
              {savedTripId ? (
                <span className="inline-flex items-center rounded-[3px] border border-brass/30 bg-iris-soft px-4 py-2 text-sm font-semibold text-brass">Saved to your trips</span>
              ) : (
                <button type="button" onClick={() => void handleSaveTrip()} disabled={savingTrip} className="btn-primary btn-sm">
                  {savingTrip ? 'Saving…' : 'Save the trip'}
                </button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {result.plan.capsule.map((item) => (
                <GarmentTile key={item.id} imageUrl={item.imageUrl} label={item.subtype ?? item.category} />
              ))}
            </div>
          </section>

          {result.plan.days.length > 0 && (
            <section className="animate-rise-2">
              <h2 className="font-display text-2xl font-medium text-ink">Day by day</h2>
              <div className="card mt-4 px-5">
                {result.plan.days.map((day) => (
                  <article key={day.label} className="flex items-center gap-4 border-t border-ink/10 py-4 first:border-t-0">
                    <div className="w-36 shrink-0">
                      <p className="text-sm font-semibold text-ink">{day.label}</p>
                      <p className="mt-0.5 text-xs text-ink/50">{day.note}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                      {day.items.map((item) => (
                        <Arch key={item.id} aspect="aspect-[4/5]" className="w-12">
                          <img src={resolveImageUrl(item.imageUrl)} alt={item.subtype ?? item.category} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
                        </Arch>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="animate-rise-3">
            <h2 className="font-display text-2xl font-medium text-ink">Checklist</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {result.plan.capsule.map((item) => {
                const key = `item-${item.id}`
                const label = item.subtype ?? item.category
                return (
                  <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[3px] border border-ink/10 bg-surface px-4 py-2.5 text-sm">
                    <input type="checkbox" checked={!!checked[key]} onChange={() => toggle(key)} className="h-4 w-4 accent-[#B98C3B]" />
                    <span className={checked[key] ? 'capitalize text-ink/35 line-through' : 'capitalize text-ink/80'}>{label}</span>
                  </label>
                )
              })}
              {result.plan.essentials.map((extra) => {
                const key = `extra-${extra}`
                return (
                  <label key={key} className="flex cursor-pointer items-center gap-3 rounded-[3px] border border-dashed border-brass/40 bg-iris-soft/40 px-4 py-2.5 text-sm">
                    <input type="checkbox" checked={!!checked[key]} onChange={() => toggle(key)} className="h-4 w-4 accent-[#B98C3B]" />
                    <span className={checked[key] ? 'text-ink/35 line-through' : 'text-ink/80'}>{extra}</span>
                  </label>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  )
}
