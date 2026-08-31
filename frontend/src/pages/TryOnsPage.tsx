import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteTryOn, getTryOns } from '../lib/tryon'
import type { TryOn } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { ZoomableImage } from '../components/ImageLightbox'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function TryOnsPage() {
  const [tryOns, setTryOns] = useState<TryOn[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getTryOns()
      .then(({ tryOns: t }) => {
        if (!cancelled) setTryOns(t ?? [])
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your try-ons.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Try-Ons
        </h1>
        <p className="mt-3 text-ink/60">
          Every look you've rendered onto your photo — see yourself styled, over and over.
        </p>
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

      {!loading && !error && tryOns && tryOns.length === 0 && (
        <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/50">
          <p>You haven't tried on any looks yet.</p>
          <Link
            to="/looks"
            className="mt-4 inline-flex text-sm font-medium text-clay underline-offset-4 hover:underline"
          >
            Try on one of your looks →
          </Link>
        </div>
      )}

      {!loading && !error && tryOns && tryOns.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tryOns.map((tryOn) => (
            <article
              key={tryOn.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm"
            >
              <button
                type="button"
                aria-label="Remove this try-on"
                onClick={() => {
                  void deleteTryOn(tryOn.id)
                    .then(() => setTryOns((prev) => prev?.filter((t) => t.id !== tryOn.id) ?? prev))
                    .catch(() => setError('Could not remove that try-on.'))
                }}
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg text-ink/60 shadow-sm transition hover:bg-white hover:text-red-600"
              >
                ×
              </button>
              <div className="aspect-[3/4] bg-gradient-to-br from-bone to-clay/20">
                <ZoomableImage src={tryOn.imageUrl} alt="You wearing a saved look" />
              </div>
              <div className="p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-clay">
                  {formatDate(tryOn.createdAt)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
