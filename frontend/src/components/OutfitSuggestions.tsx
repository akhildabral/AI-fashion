import { useState, type FormEvent } from 'react'
import { suggestOutfits, whatToWearToday } from '../lib/wardrobe'
import type { WardrobeOutfit, WardrobeWeather } from '../lib/types'
import { Spinner } from './Spinner'
import { TryOnModal } from './TryOnModal'

/** Renders one suggested outfit: its item photos in a row + the rationale. */
function OutfitRow({ outfit }: { outfit: WardrobeOutfit }) {
  const [tryOnOpen, setTryOnOpen] = useState(false)
  const itemIds = outfit.items.map((i) => i.id)

  return (
    <article className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-3">
        {outfit.items.map((item) => (
          <div key={item.id} className="w-24">
            <div className="aspect-square overflow-hidden rounded-lg border border-ink/10 bg-gradient-to-br from-bone to-clay/20">
              <img
                src={item.imageUrl}
                alt={item.subtype?.trim() || item.category}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <p className="mt-1 truncate text-center text-xs capitalize text-ink/60">
              {item.subtype?.trim() || item.category}
            </p>
          </div>
        ))}
      </div>
      {outfit.rationale && (
        <p className="mt-3 text-sm leading-relaxed text-ink/70">{outfit.rationale}</p>
      )}
      {itemIds.length > 0 && (
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => setTryOnOpen(true)} className="btn-ghost">
            Try it on
          </button>
        </div>
      )}
      {tryOnOpen && <TryOnModal itemIds={itemIds} onClose={() => setTryOnOpen(false)} />}
    </article>
  )
}

function OutfitList({ outfits }: { outfits: WardrobeOutfit[] }) {
  if (outfits.length === 0) {
    return (
      <p className="text-sm text-ink/50">
        No outfits came back — try adding more items or a different prompt.
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {outfits.map((outfit, i) => (
        <OutfitRow key={i} outfit={outfit} />
      ))}
    </div>
  )
}

/** Mix & match: an occasion → suggested outfits from owned items. */
function MixAndMatch() {
  const [occasion, setOccasion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outfits, setOutfits] = useState<WardrobeOutfit[] | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setOutfits(null)
    try {
      const res = await suggestOutfits(occasion.trim())
      setOutfits(res.outfits ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assemble outfits.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
      <h3 className="font-serif text-2xl font-semibold text-ink">Mix &amp; match</h3>
      <p className="mt-1.5 text-sm text-ink/60">
        Name an occasion and we'll assemble outfits from what you already own.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="mix-occasion" className="label">
            Occasion
          </label>
          <input
            id="mix-occasion"
            type="text"
            required
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="field"
            placeholder="e.g. dinner with friends"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Assembling…
            </>
          ) : (
            'Suggest outfits'
          )}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && outfits && (
        <div className="mt-6">
          <OutfitList outfits={outfits} />
        </div>
      )}
    </div>
  )
}

/** What to wear today: a city → weather summary + weather-aware outfits. */
function WhatToWearToday() {
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weather, setWeather] = useState<WardrobeWeather | null>(null)
  const [outfits, setOutfits] = useState<WardrobeOutfit[] | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setWeather(null)
    setOutfits(null)
    try {
      const res = await whatToWearToday(location.trim())
      setWeather(res.weather)
      setOutfits(res.outfits ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan for today.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
      <h3 className="font-serif text-2xl font-semibold text-ink">What to wear today</h3>
      <p className="mt-1.5 text-sm text-ink/60">
        Give us your city and we'll dress you for the weather.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="today-location" className="label">
            City
          </label>
          <input
            id="today-location"
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="field"
            placeholder="e.g. London"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Checking…
            </>
          ) : (
            'Plan my day'
          )}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && weather && (
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-bone/60 px-4 py-1.5 text-sm text-ink/70">
          <span className="font-medium text-ink">{weather.location}</span>
          <span aria-hidden="true">·</span>
          <span>{Math.round(weather.temperatureC)}°C</span>
          <span aria-hidden="true">·</span>
          <span>{weather.description}</span>
        </p>
      )}

      {!loading && outfits && (
        <div className="mt-6">
          <OutfitList outfits={outfits} />
        </div>
      )}
    </div>
  )
}

/** Both outfit-suggestion panels, shown on the Wardrobe page. */
export function OutfitSuggestions() {
  return (
    <div className="space-y-6">
      <MixAndMatch />
      <WhatToWearToday />
    </div>
  )
}
