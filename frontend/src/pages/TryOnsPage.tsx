import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteTryOn, getTryOns } from '../lib/tryon'
import { createPoll } from '../lib/polls'
import type { TryOn } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { ZoomableImage } from '../components/ImageLightbox'
import { PollsSection } from '../components/PollsSection'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const MAX_POLL_OPTIONS = 3

export function TryOnsPage() {
  const [tryOns, setTryOns] = useState<TryOn[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Verdict-poll creation: select 2-3 try-ons, ask friends which one.
  const [pollMode, setPollMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [creating, setCreating] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pollsRefresh, setPollsRefresh] = useState(0)

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

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length >= MAX_POLL_OPTIONS
          ? prev
          : [...prev, id],
    )
  }

  async function handleCreatePoll() {
    if (creating || selected.length < 2 || !tryOns) return
    setCreating(true)
    setError(null)
    try {
      const imageUrls = selected
        .map((id) => tryOns.find((t) => t.id === id)?.imageUrl)
        .filter((u): u is string => !!u)
      const { poll } = await createPoll({
        imageUrls,
        question: question.trim() || undefined,
      })
      setShareUrl(poll.shareUrl)
      setPollMode(false)
      setSelected([])
      setQuestion('')
      setPollsRefresh((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the poll.')
    } finally {
      setCreating(false)
    }
  }

  function copyLink() {
    if (!shareUrl) return
    void navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Try-Ons
          </h1>
          <p className="mt-3 text-ink/60">
            Every look you've rendered onto your photo — see yourself styled, over and over.
          </p>
        </div>
        {tryOns && tryOns.length >= 2 && (
          <button
            type="button"
            onClick={() => {
              setPollMode((v) => !v)
              setSelected([])
              setShareUrl(null)
            }}
            className={pollMode ? 'btn-primary' : 'btn-ghost'}
          >
            {pollMode ? 'Cancel' : 'Ask friends'}
          </button>
        )}
      </div>

      {pollMode && (
        <div className="mb-8 rounded-2xl border border-clay/30 bg-clay/10 p-5">
          <p className="text-sm text-ink/75">
            Pick 2–3 looks below, add a question, and share the link — the poll closes in
            30 minutes and only you see the votes.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="field flex-1"
              placeholder="Which one should I wear tonight?"
              maxLength={140}
            />
            <button
              type="button"
              onClick={() => void handleCreatePoll()}
              disabled={selected.length < 2 || creating}
              className="btn-primary disabled:opacity-40"
            >
              {creating ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Creating…
                </>
              ) : (
                `Create poll (${selected.length}/${MAX_POLL_OPTIONS})`
              )}
            </button>
          </div>
        </div>
      )}

      {shareUrl && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sage/40 bg-sage/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Poll created — send it to your people:</p>
            <p className="mt-0.5 truncate text-xs text-ink/55">{shareUrl}</p>
          </div>
          <button type="button" onClick={copyLink} className="btn-primary shrink-0">
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex min-h-[40vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {!loading && error && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && tryOns && tryOns.length === 0 && (
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

      {!loading && tryOns && tryOns.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tryOns.map((tryOn) => {
            const selectedIndex = selected.indexOf(tryOn.id)
            return (
              <article
                key={tryOn.id}
                className={
                  selectedIndex >= 0
                    ? 'group relative flex flex-col overflow-hidden rounded-2xl border-2 border-clay bg-white shadow-md'
                    : 'group relative flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm'
                }
              >
                {pollMode ? (
                  <button
                    type="button"
                    onClick={() => toggleSelect(tryOn.id)}
                    className="absolute inset-0 z-10"
                    aria-label={selectedIndex >= 0 ? 'Deselect' : 'Select for poll'}
                  >
                    {selectedIndex >= 0 && (
                      <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-clay font-medium text-white">
                        {selectedIndex + 1}
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Remove this try-on"
                    onClick={() => {
                      void deleteTryOn(tryOn.id)
                        .then(() =>
                          setTryOns((prev) => prev?.filter((t) => t.id !== tryOn.id) ?? prev),
                        )
                        .catch(() => setError('Could not remove that try-on.'))
                    }}
                    className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg text-ink/60 shadow-sm transition hover:bg-white hover:text-red-600"
                  >
                    ×
                  </button>
                )}
                <div className="aspect-[3/4] bg-gradient-to-br from-bone to-clay/20">
                  <ZoomableImage src={tryOn.imageUrl} alt="You wearing a saved look" />
                </div>
                <div className="p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-clay">
                    {formatDate(tryOn.createdAt)}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <PollsSection refreshKey={pollsRefresh} />
    </div>
  )
}
