import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useProfile } from '../context/useProfile'
import type { GenerateResponse, Look } from '../lib/types'
import { LookCard } from '../components/LookCard'
import { Spinner } from '../components/Spinner'

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unisex', label: 'Unisex' },
] as const

function LookSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="aspect-[3/4] animate-pulse bg-ink/5" />
      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="h-8 w-2/3 animate-pulse rounded bg-ink/5" />
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-ink/5" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-ink/5" />
          <div className="h-4 w-4/6 animate-pulse rounded bg-ink/5" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-ink/5" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-ink/5" />
        </div>
      </div>
    </div>
  )
}

export function StylistPage() {
  const { profile } = useProfile()
  const needsQuiz = !profile?.styleSignals?.signals?.length
  const [occasion, setOccasion] = useState('')
  const [gender, setGender] = useState<string>('female')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [looks, setLooks] = useState<Look[] | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setLooks(null)
    try {
      const res = await apiFetch<GenerateResponse>('/generate', {
        method: 'POST',
        body: { occasion: occasion.trim(), gender },
      })
      setLooks(res.looks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a look.')
    } finally {
      setLoading(false)
    }
  }

  function handleFavoriteChange(updated: Look) {
    setLooks((prev) =>
      prev ? prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)) : prev,
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {needsQuiz && (
        <Link
          to="/quiz"
          className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-clay/30 bg-clay/10 px-6 py-4 transition hover:border-clay/50 hover:bg-clay/15"
        >
          <div>
            <p className="font-serif text-lg font-semibold text-ink">
              Take the 60-second style quiz
            </p>
            <p className="mt-0.5 text-sm text-ink/60">
              Eight quick picks teach your stylist what you actually like.
            </p>
          </div>
          <span aria-hidden="true" className="text-xl text-clay">
            →
          </span>
        </Link>
      )}
      <div className="mb-10 max-w-2xl">
        <h1 className="font-serif text-5xl font-semibold leading-tight text-ink">
          What are you dressing for?
        </h1>
        <p className="mt-3 text-ink/60">
          Tell your stylist the occasion, and we'll compose a look — head to toe.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-12 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="occasion" className="label">
              Occasion
            </label>
            <input
              id="occasion"
              type="text"
              required
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              className="field"
              placeholder="e.g. beach wedding in Tuscany"
            />
          </div>

          <div className="sm:w-44">
            <label htmlFor="gender" className="label">
              Style for
            </label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="field"
            >
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Styling…
              </>
            ) : (
              'Generate look'
            )}
          </button>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>

      {loading && (
        <div className="grid gap-6 md:grid-cols-2">
          <LookSkeleton />
          <LookSkeleton />
        </div>
      )}
      {!loading && looks && looks.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
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
          Your generated looks will appear here.
        </div>
      )}
    </div>
  )
}
