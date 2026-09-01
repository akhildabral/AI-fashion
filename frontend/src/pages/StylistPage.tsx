import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/useAuth'
import { useProfile } from '../context/useProfile'
import type { GenerateResponse, Look } from '../lib/types'
import { LookCard } from '../components/LookCard'
import { Spinner } from '../components/Spinner'

const OCCASIONS = ['Work', 'Date night', 'Brunch', 'Wedding guest', 'Travel']

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unisex', label: 'Unisex' },
] as const

const GENDER_KEY = 'ai-fashion-style-for'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'good morning'
  if (h < 17) return 'good afternoon'
  return 'good evening'
}

function todayLine(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

function LookSkeleton() {
  return (
    <div className="card overflow-hidden shadow-sm">
      <div className="aspect-[3/4] animate-pulse bg-ink/5" />
      <div className="flex flex-col gap-4 p-6">
        <div className="h-7 w-2/3 animate-pulse rounded bg-ink/5" />
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-ink/5" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-ink/5" />
        </div>
      </div>
    </div>
  )
}

export function StylistPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const needsQuiz = !profile?.styleSignals?.signals?.length
  const [occasion, setOccasion] = useState('')
  const [gender, setGender] = useState<string>(
    () => localStorage.getItem(GENDER_KEY) ?? 'female',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [looks, setLooks] = useState<Look[] | null>(null)
  const [activeChip, setActiveChip] = useState<string | null>(null)

  const name = (() => {
    const raw = user?.handle ?? user?.email?.split('@')[0] ?? 'there'
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  })()

  async function generate(occasionText: string) {
    if (!occasionText.trim()) return
    setError(null)
    setLoading(true)
    setLooks(null)
    try {
      const res = await apiFetch<GenerateResponse>('/generate', {
        method: 'POST',
        body: { occasion: occasionText.trim(), gender },
      })
      setLooks(res.looks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a look.')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setActiveChip(null)
    void generate(occasion)
  }

  function handleChip(chip: string) {
    setActiveChip(chip)
    setOccasion(chip)
    void generate(chip)
  }

  function handleGender(value: string) {
    setGender(value)
    localStorage.setItem(GENDER_KEY, value)
  }

  function handleFavoriteChange(updated: Look) {
    setLooks((prev) =>
      prev ? prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)) : prev,
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {needsQuiz && (
        <Link
          to="/quiz"
          className="mb-8 flex animate-rise items-center justify-between gap-4 rounded-2xl border border-iris/20 bg-iris-soft px-6 py-4 transition hover:border-iris/50"
        >
          <div>
            <p className="font-display text-lg font-bold text-ink">
              Take the 60-second style quiz
            </p>
            <p className="mt-0.5 text-sm text-ink/60">
              Eight quick picks teach your stylist what you actually like.
            </p>
          </div>
          <span aria-hidden="true" className="text-xl text-iris">
            →
          </span>
        </Link>
      )}

      <div className="max-w-2xl">
        <p className="animate-rise text-sm text-ink/55">
          {todayLine()} · <span className="font-serif italic">{greeting()}, {name}</span>
        </p>
        <h1 className="mt-2 animate-rise-1 font-display text-5xl font-extrabold leading-[0.98] tracking-tight text-ink sm:text-6xl">
          What are you <em className="block not-italic text-iris">dressing for?</em>
        </h1>

        <form
          onSubmit={handleSubmit}
          className="mt-8 flex animate-rise-2 items-center gap-3 rounded-2xl border border-ink/10 bg-surface p-2 pl-5 shadow-lift"
        >
          <input
            id="occasion"
            type="text"
            required
            value={occasion}
            onChange={(e) => {
              setOccasion(e.target.value)
              setActiveChip(null)
            }}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-ink outline-none placeholder:text-ink/35"
            placeholder="Dinner in the city, smart-casual…"
          />
          <button type="submit" disabled={loading} className="btn-primary shrink-0">
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Styling…
              </>
            ) : (
              'Style me'
            )}
          </button>
        </form>

        <div className="mt-4 flex animate-rise-3 flex-wrap items-center gap-2">
          {OCCASIONS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChip(chip)}
              className={`chip ${activeChip === chip ? 'chip-on' : ''}`}
            >
              {chip}
            </button>
          ))}
          <select
            value={gender}
            onChange={(e) => handleGender(e.target.value)}
            aria-label="Style for"
            className="chip cursor-pointer appearance-none bg-transparent pr-3"
          >
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                For {g.label.toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="mt-12 border-t border-ink/10 pt-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">
            {looks && looks.length > 0 ? "Today's look" : 'Your looks'}
          </h2>
          {looks && looks.length > 0 && (
            <span className="badge-spark">{activeChip ?? occasion}</span>
          )}
        </div>

        {loading && (
          <div className="grid gap-6 md:grid-cols-2">
            <LookSkeleton />
            <LookSkeleton />
          </div>
        )}
        {!loading && looks && looks.length > 0 && (
          <div className="grid animate-rise gap-6 md:grid-cols-2">
            {looks.map((look, i) => (
              <LookCard
                key={look.id ?? i}
                look={look}
                onFavoriteChange={handleFavoriteChange}
              />
            ))}
          </div>
        )}
        {!loading && looks && looks.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/40">
            No looks came back — try a different occasion.
          </div>
        )}
        {!loading && !looks && !error && (
          <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/40">
            Pick an occasion above — your styled looks land here.
          </div>
        )}
      </div>
    </div>
  )
}
