import { useState, type FormEvent } from 'react'
import { sendItemFeedback, suggestOutfits, whatToWearToday } from '../lib/wardrobe'
import { logWear } from '../lib/wearlog'
import type {
  EventType,
  FeedbackSignal,
  WardrobeOutfit,
  WardrobeWeather,
} from '../lib/types'
import { Spinner } from './Spinner'
import { TryOnModal } from './TryOnModal'
import { ZoomableImage } from './ImageLightbox'

const FEEDBACK_OPTIONS: { signal: FeedbackSignal; label: string }[] = [
  { signal: 'too-formal', label: 'Too formal for this' },
  { signal: 'too-casual', label: 'Too casual for this' },
  { signal: 'not-warm-enough', label: 'Not warm enough' },
  { signal: 'too-warm', label: 'Too warm' },
  { signal: 'wrong-color', label: 'Wrong color' },
  { signal: 'dont-suggest', label: "Don't suggest this item" },
]

/**
 * Inline correction at the point of pain (plan §4.3): the user complains
 * about a suggestion; the item's attributes quietly adjust.
 */
function ItemFeedbackMenu({ itemId, itemName }: { itemId: string; itemName: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  async function send(signal: FeedbackSignal) {
    setOpen(false)
    try {
      await sendItemFeedback(itemId, signal)
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    } catch {
      // Silent — feedback is best-effort.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Give feedback on ${itemName}`}
        className="mx-auto mt-0.5 block text-xs text-ink/35 transition hover:text-ink/70"
      >
        {done ? 'Got it ✓' : '⋯'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 z-20 mt-1 w-48 -translate-x-1/2 overflow-hidden rounded-xl border border-ink/10 bg-surface py-1 shadow-lg">
            {FEEDBACK_OPTIONS.map((opt) => (
              <button
                key={opt.signal}
                type="button"
                onClick={() => void send(opt.signal)}
                className="block w-full px-4 py-2 text-left text-xs text-ink/75 transition hover:bg-bone"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** One-tap wear logging — the action the whole product optimizes for. */
function WoreItButton({
  itemIds,
  eventType,
  location,
}: {
  itemIds: string[]
  eventType: EventType
  location?: string
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')

  async function handleClick() {
    if (state === 'saving' || state === 'done') return
    setState('saving')
    try {
      await logWear({ itemIds, eventType, location })
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'saving' || state === 'done'}
      className={
        state === 'done'
          ? 'inline-flex items-center rounded-full border border-sage/40 bg-sage/10 px-4 py-1.5 text-sm font-medium text-sage'
          : 'btn-ghost'
      }
    >
      {state === 'saving' && <Spinner className="mr-2 h-3.5 w-3.5" />}
      {state === 'done' ? 'Logged ✓' : state === 'error' ? 'Try again' : 'I wore this'}
    </button>
  )
}

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'casual', label: 'Casual' },
  { value: 'evening', label: 'Evening' },
  { value: 'occasion', label: 'Occasion' },
  { value: 'athletic', label: 'Athletic' },
]

/** Event-type picker: professional/work is the default, never a cage. */
function EventTypeSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: EventType
  onChange: (v: EventType) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        Setting
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as EventType)}
        className="field"
      >
        {EVENT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Renders one suggested outfit: its item photos in a row + the rationale. */
function OutfitRow({
  outfit,
  eventType,
  location,
}: {
  outfit: WardrobeOutfit
  eventType: EventType
  location?: string
}) {
  const [tryOnOpen, setTryOnOpen] = useState(false)
  const itemIds = outfit.items.map((i) => i.id)

  return (
    <article className="rounded-xl border border-ink/10 bg-surface p-4 ">
      <div className="flex flex-wrap gap-3">
        {outfit.items.map((item) => (
          <div key={item.id} className="w-24">
            <div className="aspect-square overflow-hidden rounded-lg border border-ink/10 bg-gradient-to-br from-bone to-clay/20">
              <ZoomableImage src={item.imageUrl} alt={item.subtype?.trim() || item.category} />
            </div>
            <p className="mt-1 truncate text-center text-xs capitalize text-ink/60">
              {item.subtype?.trim() || item.category}
            </p>
            <ItemFeedbackMenu itemId={item.id} itemName={item.subtype?.trim() || item.category} />
          </div>
        ))}
      </div>
      {outfit.rationale && (
        <p className="mt-3 text-sm leading-relaxed text-ink/70">{outfit.rationale}</p>
      )}
      {outfit.validation && outfit.validation.warnings.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {outfit.validation.warnings.map((w) => w.message).join(' · ')}
        </p>
      )}
      {itemIds.length > 0 && (
        <div className="mt-3 flex justify-end gap-2">
          <WoreItButton itemIds={itemIds} eventType={eventType} location={location} />
          <button type="button" onClick={() => setTryOnOpen(true)} className="btn-ghost">
            Try it on
          </button>
        </div>
      )}
      {tryOnOpen && <TryOnModal itemIds={itemIds} onClose={() => setTryOnOpen(false)} />}
    </article>
  )
}

function OutfitList({
  outfits,
  eventType,
  location,
}: {
  outfits: WardrobeOutfit[]
  eventType: EventType
  location?: string
}) {
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
        <OutfitRow key={i} outfit={outfit} eventType={eventType} location={location} />
      ))}
    </div>
  )
}

/** Mix & match: an occasion → suggested outfits from owned items. */
function MixAndMatch() {
  const [occasion, setOccasion] = useState('')
  const [eventType, setEventType] = useState<EventType>('work')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outfits, setOutfits] = useState<WardrobeOutfit[] | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setOutfits(null)
    try {
      const res = await suggestOutfits(occasion.trim(), eventType)
      setOutfits(res.outfits ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assemble outfits.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-6  sm:p-8">
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
        <EventTypeSelect id="mix-event-type" value={eventType} onChange={setEventType} />
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
          <OutfitList outfits={outfits} eventType={eventType} />
        </div>
      )}
    </div>
  )
}

/** What to wear today: a city → weather summary + weather-aware outfits. */
function WhatToWearToday() {
  const [location, setLocation] = useState('')
  const [eventType, setEventType] = useState<EventType>('work')
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
      const res = await whatToWearToday(location.trim(), eventType)
      setWeather(res.weather)
      setOutfits(res.outfits ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan for today.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-surface p-6  sm:p-8">
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
        <EventTypeSelect id="today-event-type" value={eventType} onChange={setEventType} />
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
          <OutfitList
            outfits={outfits}
            eventType={eventType}
            location={location.trim() ? location.trim() : undefined}
          />
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
