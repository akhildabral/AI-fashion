import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { Look, LooksResponse } from '../lib/types'
import { LookCard } from '../components/LookCard'
import { Spinner } from '../components/Spinner'

export function LooksPage() {
  const [looks, setLooks] = useState<Look[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch<LooksResponse>('/looks')
      .then(({ looks: l }) => {
        if (!cancelled) setLooks(l ?? [])
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your looks.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleFavoriteChange(updated: Look) {
    setLooks((prev) =>
      prev ? prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)) : prev,
    )
  }

  function handleDeleted(id: string) {
    setLooks((prev) => (prev ? prev.filter((l) => l.id !== id) : prev))
  }

  const visible =
    looks && showFavoritesOnly ? looks.filter((l) => l.favorite) : looks

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            My Looks
          </h1>
          <p className="mt-3 text-ink/60">
            Every look your stylist has composed — favorite the ones you love.
          </p>
        </div>
        {looks && looks.some((l) => l.favorite) && (
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={showFavoritesOnly}
              onChange={(e) => setShowFavoritesOnly(e.target.checked)}
              className="h-4 w-4 rounded border-ink/30 text-clay focus:ring-clay/30"
            />
            Favorites only
          </label>
        )}
      </div>

      {loading && (
        <div className="flex min-h-[40vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {!loading && error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && looks && looks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/50">
          <p>You haven't saved any looks yet.</p>
          <Link
            to="/"
            className="mt-4 inline-flex text-sm font-medium text-clay underline-offset-4 hover:underline"
          >
            Generate your first look →
          </Link>
        </div>
      )}

      {!loading && !error && visible && visible.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((look, i) => (
            <LookCard
              key={look.id ?? i}
              look={look}
              onFavoriteChange={handleFavoriteChange}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {!loading && !error && visible && visible.length === 0 && looks && looks.length > 0 && (
        <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/50">
          No favorites yet — tap the heart on a look to save it here.
        </div>
      )}
    </div>
  )
}
