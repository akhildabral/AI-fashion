import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { copyText } from '../lib/clipboard'
import { usePageTitle } from '../lib/usePageTitle'
import { deleteWearLog, getWearInsights, getWearLog } from '../lib/wearlog'
import { getResaleDraft } from '../lib/wardrobe'
import type { ResaleDraftResponse, WearInsightsResponse, WearLogEntry } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { ShareButton } from '../components/ShareButton'
import { Arch, GarmentTile, Modal, PageShell, Stat, Toast, useFlash } from '../components/ui'
import { resolveImageUrl } from '../lib/api'

// Wear history: the record of what was actually worn. It is the dataset
// everything else is built on, so it reads like a ledger, not a feed.

/** Resale: turn a piece that isn't earning its place into a listing. */
function ResaleModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [result, setResult] = useState<ResaleDraftResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    getResaleDraft(itemId)
      .then((res) => !cancelled && setResult(res))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not draft a listing.'))
    return () => {
      cancelled = true
    }
  }, [itemId])

  function copyAll() {
    if (!result) return
    const text = `${result.draft.title}\n\n${result.draft.description}\n\nAsking price: ${result.draft.suggestedPrice}`
    void copyText(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <Modal open onClose={onClose} title="A listing, drafted">
      {!result && !error && (
        <div className="flex min-h-[20vh] flex-col items-center justify-center gap-3 text-ink/60">
          <Spinner className="h-6 w-6" />
          <p className="font-display text-sm italic">Writing your listing…</p>
        </div>
      )}
      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-5">
          <div className="flex gap-4">
            <Arch aspect="aspect-[4/5]" className="w-20 shrink-0">
              <img src={resolveImageUrl(result.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[8%]" />
            </Arch>
            <div>
              <p className="font-display text-lg font-medium text-ink">{result.draft.title}</p>
              <p className="mt-1 text-sm text-brass">Ask {result.draft.suggestedPrice}</p>
            </div>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink/75">{result.draft.description}</p>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">Before you list</p>
            <ul className="space-y-1 text-sm text-ink/70">
              {result.draft.conditionChecklist.map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={copyAll} className="btn-primary w-full">
            {copied ? 'Copied' : 'Copy the listing'}
          </button>
        </div>
      )}
    </Modal>
  )
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function LogRow({ log, onDeleted, onError }: { log: WearLogEntry; onDeleted: (id: string) => void; onError: (msg: string) => void }) {
  const [deleting, setDeleting] = useState(false)
  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteWearLog(log.id)
      onDeleted(log.id)
    } catch {
      setDeleting(false)
      onError('Could not remove that entry — try again.')
    }
  }
  return (
    <article className="flex items-center gap-4 border-t border-ink/10 py-4 first:border-t-0">
      <div className="w-28 shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brass">{formatDay(log.wornOn)}</p>
        {log.eventType && <p className="mt-0.5 text-xs capitalize text-ink/55">{log.eventType}</p>}
        {log.weather && (
          <p className="mt-0.5 text-xs text-ink/40">
            {Math.round(log.weather.temperatureC)}° · {log.weather.description}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        {log.items.map((item) => (
          <Arch key={item.id} aspect="aspect-[4/5]" className="w-12">
            <img src={resolveImageUrl(item.imageUrl)} alt={item.subtype?.trim() || item.category} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[10%]" />
          </Arch>
        ))}
        {log.items.length === 0 && <p className="text-sm text-ink/40">Pieces no longer in your closet.</p>}
      </div>
      <ShareButton target={{ kind: 'look', id: log.id, title: 'What I wore', text: `What I wore on ${formatDay(log.wornOn)}.`, url: (log as { sharedAt?: string | null }).sharedAt ? `${window.location.origin}/look/${log.id}` : undefined }} onDone={(l) => l && onError(l)} className="press shrink-0 inline-flex items-center text-xs text-ink/50 transition-colors hover:text-ink" />
      <button type="button" onClick={handleDelete} disabled={deleting} className="press shrink-0 text-xs text-ink/35 transition-colors hover:text-ink/70">
        {deleting ? 'Removing…' : 'Remove'}
      </button>
    </article>
  )
}

export function JournalPage() {
  usePageTitle('Wear history')
  const { toast, flash } = useFlash()
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
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load your history.'))
    return () => {
      cancelled = true
    }
  }, [])

  const loading = logs == null && !error
  const mostWorn = insights ? [...insights.items].filter((i) => i.wearCount > 0).sort((a, b) => b.wearCount - a.wearCount).slice(0, 6) : []
  const orphans = insights ? insights.items.filter((i) => i.orphan).slice(0, 6) : []

  return (
    <PageShell>
      <Toast msg={toast} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">Wear history</p>
          <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
            What you <em className="text-brass">actually wore.</em>
          </h1>
          <p className="mt-3 max-w-xl animate-rise-1 text-sm text-ink/55">The record every brief learns from. Log it once a day and the closet starts paying for itself.</p>
        </div>
        <Link to="/closet" className="btn-ghost animate-rise-1">
          The ledger, in your Closet
        </Link>
      </header>

      {loading && (
        <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}
      {error && (
        <p className="mt-6 alert-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && insights && (
        <section className="plaque mt-8 flex animate-rise-2 flex-wrap gap-8 p-5 pl-6">
          <Stat value={insights.totals.logged} label="outfits logged" />
          <Stat value={insights.totals.items} label="pieces" />
          <Stat value={insights.totals.orphans} label="idle 90+ days" />
        </section>
      )}

      {!loading && !error && mostWorn.length > 0 && (
        <section className="mt-10 animate-rise-2">
          <h2 className="font-display text-2xl font-medium text-ink">Workhorses</h2>
          <p className="mt-1 text-sm text-ink/55">The pieces doing the most work, and what each wear has cost so far.</p>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
            {mostWorn.map((item) => (
              <GarmentTile key={item.itemId} imageUrl={item.imageUrl} label={item.subtype ?? item.category} sublabel={`${item.wearCount}× worn${item.costPerWear != null ? ` · ₹${Math.round(item.costPerWear)}/wear` : ''}`} />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && orphans.length > 0 && (
        <section className="mt-10 animate-rise-3">
          <h2 className="font-display text-2xl font-medium text-ink">Sitting idle</h2>
          <p className="mt-1 text-sm text-ink/55">Not worn in over ninety days. Ask for a look built around one, or let it go and draft the listing.</p>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
            {orphans.map((item) => (
              <div key={item.itemId} className="opacity-80">
                <GarmentTile imageUrl={item.imageUrl} label={item.subtype ?? item.category} />
                <button type="button" onClick={() => setResaleItemId(item.itemId)} className="press mt-1 w-full text-center text-[11px] font-semibold text-brass hover:underline">
                  Draft a listing
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && logs && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-medium text-ink">Day by day</h2>
          {logs.length === 0 ? (
            <div className="mt-4 rounded-[3px] border border-dashed border-ink/20 px-6 py-14 text-center">
              <p className="font-display text-2xl font-medium text-ink">Nothing logged yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">Tap “Wearing it” on today’s brief and the history starts here.</p>
              <Link to="/" className="btn-primary mt-5 inline-flex">
                Open today’s brief
              </Link>
            </div>
          ) : (
            <div className="card mt-4 px-5">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} onDeleted={(id) => setLogs((prev) => prev?.filter((l) => l.id !== id) ?? prev)} onError={flash} />
              ))}
            </div>
          )}
        </section>
      )}

      {resaleItemId && <ResaleModal itemId={resaleItemId} onClose={() => setResaleItemId(null)} />}
    </PageShell>
  )
}
