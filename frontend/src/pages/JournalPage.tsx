import { useEffect, useState } from 'react'
import { deleteWearLog, getWearInsights, getWearLog } from '../lib/wearlog'
import { getResaleDraft } from '../lib/wardrobe'
import type { ResaleDraftResponse, WearInsightsResponse, WearLogEntry } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { ZoomableImage } from '../components/ImageLightbox'

/**
 * Resale is the plan's first monetization surface: turn an orphan into a
 * ready-to-post marketplace listing. Copy-paste friendly.
 */
function ResaleModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [result, setResult] = useState<ResaleDraftResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    getResaleDraft(itemId)
      .then((res) => {
        if (!cancelled) setResult(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not draft a listing.')
      })
    return () => {
      cancelled = true
    }
  }, [itemId])

  function copyAll() {
    if (!result) return
    const text = `${result.draft.title}\n\n${result.draft.description}\n\nAsking price: ${result.draft.suggestedPrice}`
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-serif text-2xl font-semibold text-ink">Resale listing draft</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bone text-lg text-ink/60 hover:text-ink"
          >
            ×
          </button>
        </div>

        {!result && !error && (
          <div className="flex min-h-[20vh] flex-col items-center justify-center gap-3 text-ink/60">
            <Spinner className="h-6 w-6" />
            <p className="text-sm">Writing your listing…</p>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-5">
            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-bone">
                <img src={result.imageUrl} alt="Item" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="font-medium text-ink">{result.draft.title}</p>
                <p className="mt-1 text-sm text-clay">Ask: {result.draft.suggestedPrice}</p>
              </div>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink/75">
              {result.draft.description}
            </p>
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-clay">
                Before you list — check &amp; photograph
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-ink/70">
                {result.draft.conditionChecklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <button type="button" onClick={copyAll} className="btn-primary w-full">
              {copied ? 'Copied ✓' : 'Copy listing text'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** One wear-log entry: date, item thumbnails, context chips. */
function LogRow({ log, onDeleted }: { log: WearLogEntry; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteWearLog(log.id)
      onDeleted(log.id)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <article className="flex items-center gap-4 rounded-xl border border-ink/10 bg-surface p-4 ">
      <div className="w-24 shrink-0">
        <p className="text-xs uppercase tracking-[0.15em] text-clay">{formatDay(log.wornOn)}</p>
        {log.eventType && <p className="mt-1 text-xs capitalize text-ink/50">{log.eventType}</p>}
        {log.weather && (
          <p className="mt-1 text-xs text-ink/40">
            {Math.round(log.weather.temperatureC)}°C · {log.weather.description}
          </p>
        )}
      </div>
      <div className="flex flex-1 flex-wrap gap-2">
        {log.items.map((item) => (
          <div key={item.id} className="w-14">
            <div className="aspect-square overflow-hidden rounded-lg border border-ink/10 bg-bone">
              <ZoomableImage src={item.imageUrl} alt={item.subtype?.trim() || item.category} />
            </div>
          </div>
        ))}
        {log.items.length === 0 && (
          <p className="text-sm text-ink/40">Items no longer in your wardrobe.</p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 text-xs text-ink/35 transition hover:text-red-600"
      >
        {deleting ? 'Removing…' : 'Remove'}
      </button>
    </article>
  )
}

export function JournalPage() {
  const [logs, setLogs] = useState<WearLogEntry[] | null>(null)
  const [insights, setInsights] = useState<WearInsightsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resaleItemId, setResaleItemId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getWearLog(), getWearInsights()])
      .then(([logRes, insightRes]) => {
        if (cancelled) return
        setLogs(logRes.logs ?? [])
        setInsights(insightRes)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your journal.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = logs == null && !error
  const mostWorn = insights
    ? [...insights.items].filter((i) => i.wearCount > 0).sort((a, b) => b.wearCount - a.wearCount).slice(0, 6)
    : []
  const orphans = insights ? insights.items.filter((i) => i.orphan).slice(0, 6) : []

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Journal
        </h1>
        <p className="mt-3 text-ink/60">
          What you actually wore — the record that makes your suggestions personal.
        </p>
      </div>

      {loading && (
        <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && insights && (
        <section className="mb-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink/10 bg-surface p-5 ">
            <p className="text-xs uppercase tracking-[0.2em] text-clay">Outfits logged</p>
            <p className="mt-1 font-serif text-3xl font-semibold text-ink">
              {insights.totals.logged}
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-surface p-5 ">
            <p className="text-xs uppercase tracking-[0.2em] text-clay">Wardrobe items</p>
            <p className="mt-1 font-serif text-3xl font-semibold text-ink">
              {insights.totals.items}
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-surface p-5 ">
            <p className="text-xs uppercase tracking-[0.2em] text-clay">Orphans (90+ days)</p>
            <p className="mt-1 font-serif text-3xl font-semibold text-ink">
              {insights.totals.orphans}
            </p>
          </div>
        </section>
      )}

      {!loading && !error && mostWorn.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 font-serif text-2xl font-semibold text-ink">Most worn</h2>
          <div className="flex flex-wrap gap-4">
            {mostWorn.map((item) => (
              <div key={item.itemId} className="w-24 text-center">
                <div className="aspect-square overflow-hidden rounded-xl border border-ink/10 bg-bone">
                  <ZoomableImage src={item.imageUrl} alt={item.subtype ?? item.category} />
                </div>
                <p className="mt-1.5 text-xs text-ink/60">
                  {item.wearCount}× worn
                  {item.costPerWear != null && (
                    <span className="block text-ink/45">≈{item.costPerWear}/wear</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && orphans.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 font-serif text-2xl font-semibold text-ink">Wardrobe orphans</h2>
          <p className="mb-4 text-sm text-ink/55">
            Not worn in over 90 days — ask Mix &amp; match to build an outfit around one, or
            consider letting it go.
          </p>
          <div className="flex flex-wrap gap-4">
            {orphans.map((item) => (
              <div key={item.itemId} className="w-24 text-center">
                <div className="aspect-square overflow-hidden rounded-xl border border-ink/10 bg-bone opacity-80">
                  <ZoomableImage src={item.imageUrl} alt={item.subtype ?? item.category} />
                </div>
                <p className="mt-1.5 truncate text-xs capitalize text-ink/60">
                  {item.subtype ?? item.category}
                </p>
                <button
                  type="button"
                  onClick={() => setResaleItemId(item.itemId)}
                  className="mt-1 text-xs text-clay underline-offset-2 hover:underline"
                >
                  Draft listing
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && logs && (
        <section>
          <h2 className="mb-4 font-serif text-2xl font-semibold text-ink">Wear history</h2>
          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/50">
              <p>Nothing logged yet.</p>
              <p className="mt-1 text-sm text-ink/40">
                Tap “I wore this” on any suggested outfit to start your journal.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <LogRow
                  key={log.id}
                  log={log}
                  onDeleted={(id) => setLogs((prev) => prev?.filter((l) => l.id !== id) ?? prev)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {resaleItemId && <ResaleModal itemId={resaleItemId} onClose={() => setResaleItemId(null)} />}
    </div>
  )
}
