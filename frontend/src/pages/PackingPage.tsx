import { useState, type FormEvent } from 'react'
import { packForTrip } from '../lib/wardrobe'
import type { PackingResponse } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { ZoomableImage } from '../components/ImageLightbox'

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Travel packing: destination + dates → a capsule packed from the real
 * wardrobe, a day-by-day outfit plan, and a checklist of essentials.
 */
export function PackingPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [activities, setActivities] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackingResponse | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setResult(null)
    setChecked({})
    try {
      const res = await packForTrip({
        destination: destination.trim(),
        startDate,
        endDate,
        activities: activities.trim() || undefined,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan your packing.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Pack for a trip
        </h1>
        <p className="mt-3 text-ink/60">
          Tell us where and when — we'll build a capsule from clothes you own, plan
          each day's outfit, and list what else to bring.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-10 rounded-2xl border border-ink/10 bg-surface p-6  sm:p-8"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="pack-destination" className="label">
              Destination
            </label>
            <input
              id="pack-destination"
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="field"
              placeholder="e.g. Lisbon"
            />
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
              onChange={(e) => setStartDate(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="pack-end" className="label">
              To
            </label>
            <input
              id="pack-end"
              type="date"
              required
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="pack-activities" className="label">
              Plans (optional)
            </label>
            <input
              id="pack-activities"
              type="text"
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              className="field"
              placeholder="e.g. hiking, a wedding"
            />
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary mt-5">
          {loading ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Packing…
            </>
          ) : (
            'Plan my packing'
          )}
        </button>
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </form>

      {result && (
        <div className="space-y-10">
          {/* Weather strip */}
          <section>
            <h2 className="mb-3 font-serif text-2xl font-semibold text-ink">
              {result.forecast.location}
            </h2>
            {result.forecast.days.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {result.forecast.days.map((d) => (
                  <div
                    key={d.date}
                    className="min-w-[7.5rem] shrink-0 rounded-xl border border-ink/10 bg-surface p-3 text-center "
                  >
                    <p className="text-xs uppercase tracking-wide text-clay">{formatDay(d.date)}</p>
                    <p className="mt-1 font-serif text-lg text-ink tabular-nums">
                      {d.minC}–{d.maxC}°
                    </p>
                    <p className="mt-0.5 text-xs capitalize text-ink/55">
                      {d.description}
                      {d.rainChance ? ' ☂' : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {result.forecast.partial && (
              <p className="mt-2 text-xs text-ink/45">
                Part of the trip is beyond the forecast horizon — packed for typical seasonal weather.
              </p>
            )}
          </section>

          {/* Capsule */}
          <section>
            <h2 className="mb-1 font-serif text-2xl font-semibold text-ink">
              The capsule · {result.plan.capsule.length} pieces
            </h2>
            <p className="mb-4 max-w-2xl text-sm text-ink/60">{result.plan.rationale}</p>
            <div className="flex flex-wrap gap-4">
              {result.plan.capsule.map((item) => (
                <div key={item.id} className="w-24 text-center">
                  <div className="aspect-square overflow-hidden rounded-xl border border-ink/10 bg-bone">
                    <ZoomableImage src={item.imageUrl} alt={item.subtype ?? item.category} />
                  </div>
                  <p className="mt-1.5 truncate text-xs capitalize text-ink/60">
                    {item.subtype ?? item.category}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Day-by-day */}
          {result.plan.days.length > 0 && (
            <section>
              <h2 className="mb-4 font-serif text-2xl font-semibold text-ink">Day by day</h2>
              <div className="space-y-3">
                {result.plan.days.map((day) => (
                  <article
                    key={day.label}
                    className="flex items-center gap-4 rounded-xl border border-ink/10 bg-surface p-4 "
                  >
                    <div className="w-36 shrink-0">
                      <p className="text-sm font-medium text-ink">{day.label}</p>
                      <p className="mt-1 text-xs text-ink/50">{day.note}</p>
                    </div>
                    <div className="flex flex-1 flex-wrap gap-2">
                      {day.items.map((item) => (
                        <div key={item.id} className="w-14">
                          <div className="aspect-square overflow-hidden rounded-lg border border-ink/10 bg-bone">
                            <ZoomableImage src={item.imageUrl} alt={item.subtype ?? item.category} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Checklist */}
          <section>
            <h2 className="mb-4 font-serif text-2xl font-semibold text-ink">Packing checklist</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {result.plan.capsule.map((item) => {
                const key = `item-${item.id}`
                const label = item.subtype ?? item.category
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink/10 bg-surface px-4 py-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[key]}
                      onChange={() => toggle(key)}
                      className="h-4 w-4 accent-ink"
                    />
                    <span className={checked[key] ? 'capitalize text-ink/35 line-through' : 'capitalize text-ink/80'}>
                      {label}
                    </span>
                  </label>
                )
              })}
              {result.plan.essentials.map((extra) => {
                const key = `extra-${extra}`
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-clay/40 bg-clay/5 px-4 py-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[key]}
                      onChange={() => toggle(key)}
                      className="h-4 w-4 accent-ink"
                    />
                    <span className={checked[key] ? 'text-ink/35 line-through' : 'text-ink/80'}>
                      {extra}
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
