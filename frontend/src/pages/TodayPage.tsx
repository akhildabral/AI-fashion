import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { apiFetch } from '../lib/api'
import {
  getBrief,
  getBriefAlternatives,
  getFeed,
  getRitualStats,
  swapBriefItem,
  wearBrief,
  type Brief,
  type BriefItem,
  type FeedCard,
  type RitualStats,
} from '../lib/brief'
import type { GenerateResponse, Look } from '../lib/types'
import { LookCard } from '../components/LookCard'
import { GarmentTile, PageShell, SlideOver } from '../components/ui'
import { Spinner } from '../components/Spinner'

const OCCASIONS = ['Date night', 'Brunch', 'Wedding guest', 'Travel', 'Big meeting']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'good morning'
  if (h < 17) return 'good afternoon'
  return 'good evening'
}

function todayLine(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
}

function itemLabel(i: BriefItem): string {
  return i.subtype ?? i.category
}

export function TodayPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'brief' | 'starter' | null>(null)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [worn, setWorn] = useState(false)
  const [isRefinement, setIsRefinement] = useState(false)
  const [stats, setStats] = useState<RitualStats | null>(null)
  const [cards, setCards] = useState<FeedCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Swap panel
  const [swapItem, setSwapItem] = useState<BriefItem | null>(null)
  const [alternatives, setAlternatives] = useState<BriefItem[] | null>(null)

  // Occasion refinement
  const [occasionText, setOccasionText] = useState('')

  // Starter mode (thin closet): from-scratch looks
  const [starterLooks, setStarterLooks] = useState<Look[] | null>(null)

  const name = (() => {
    const raw = user?.handle ?? user?.email?.split('@')[0] ?? 'there'
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  })()

  const load = useCallback(async (opts: { occasion?: string; refresh?: boolean } = {}) => {
    setError(null)
    setBusy(opts.occasion ? 'occasion' : opts.refresh ? 'another' : null)
    if (!opts.occasion && !opts.refresh) setLoading(true)
    try {
      const res = await getBrief(opts)
      setMode(res.mode)
      setBrief(res.brief ?? null)
      setWorn(Boolean(res.worn))
      setIsRefinement(Boolean(opts.occasion))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your brief.')
    } finally {
      setLoading(false)
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void load()
    getRitualStats().then(setStats).catch(() => undefined)
    getFeed()
      .then((r) => setCards(r.cards.slice(0, 3)))
      .catch(() => undefined)
  }, [load])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4000)
  }

  async function handleWear() {
    if (!brief) return
    setBusy('wear')
    try {
      await wearBrief(brief.itemIds)
      setWorn(true)
      const fresh = await getRitualStats().catch(() => null)
      if (fresh) {
        setStats(fresh)
        const brk = fresh.priceBreaks[0]
        flash(
          brk
            ? `Logged. Your ${brk.label} just broke under ₹${brk.threshold}/wear ✦`
            : `Logged — ${fresh.streak} day${fresh.streak === 1 ? '' : 's'} styled in a row.`,
        )
      } else {
        flash('Logged for today.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log the wear.')
    } finally {
      setBusy(null)
    }
  }

  async function openSwap(item: BriefItem) {
    if (worn || isRefinement) return
    setSwapItem(item)
    setAlternatives(null)
    try {
      const res = await getBriefAlternatives(item.category, brief?.itemIds ?? [])
      setAlternatives(res.alternatives)
    } catch {
      setAlternatives([])
    }
  }

  async function handleSwap(inItem: BriefItem) {
    if (!swapItem) return
    setBusy('swap')
    try {
      const res = await swapBriefItem(swapItem.id, inItem.id)
      setBrief(res.brief)
      setSwapItem(null)
      flash(`Swapped in the ${itemLabel(inItem)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed.')
    } finally {
      setBusy(null)
    }
  }

  function handleSeeOnYou() {
    if (!brief) return
    navigate(`/mirror?items=${brief.itemIds.join(',')}`)
  }

  function handleOccasionSubmit(e: FormEvent) {
    e.preventDefault()
    if (occasionText.trim()) void load({ occasion: occasionText.trim() })
  }

  async function handleStarterGenerate() {
    setBusy('starter')
    setError(null)
    try {
      const res = await apiFetch<GenerateResponse>('/generate', {
        method: 'POST',
        body: { occasion: 'my everyday style', gender: localStorage.getItem('ai-fashion-style-for') ?? 'female' },
      })
      setStarterLooks(res.looks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not style a look.')
    } finally {
      setBusy(null)
    }
  }

  const evening = new Date().getHours() >= 18

  return (
    <PageShell>
      {/* Greeting + ritual line */}
      <p className="animate-rise text-sm text-ink/55">
        {todayLine()} · <span className="font-serif italic">{greeting()}, {name}</span>
        {stats && stats.streak > 1 && (
          <span className="ml-2 text-ink/40">· {stats.streak} days styled</span>
        )}
      </p>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white shadow-card">
          {toast}
        </div>
      )}

      {loading && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink/50">
          <Spinner className="h-6 w-6" />
          <p className="font-serif text-sm italic">composing your look…</p>
        </div>
      )}

      {!loading && error && (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {/* ---------------- STARTER (thin closet) ---------------- */}
      {!loading && mode === 'starter' && (
        <div className="mt-2">
          <h1 className="animate-rise-1 font-display text-4xl font-extrabold leading-[0.98] tracking-tight text-ink sm:text-6xl">
            Let's fill <em className="block not-italic text-iris">your closet.</em>
          </h1>
          <p className="mt-4 max-w-xl animate-rise-2 text-ink/60">
            Once your clothes are in, this page greets you every morning with an outfit already
            composed — from what you actually own, tuned to the weather.
          </p>
          <div className="mt-6 flex animate-rise-3 flex-wrap gap-3">
            <Link to="/closet" className="btn-primary">
              Add your clothes →
            </Link>
            <button
              type="button"
              onClick={() => void handleStarterGenerate()}
              disabled={busy === 'starter'}
              className="btn-ghost"
            >
              {busy === 'starter' ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Styling…
                </>
              ) : (
                'Style a look from scratch'
              )}
            </button>
          </div>
          {starterLooks && starterLooks.length > 0 && (
            <div className="mt-10 grid animate-rise gap-6 md:grid-cols-2">
              {starterLooks.map((look, i) => (
                <LookCard key={look.id ?? i} look={look} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- THE BRIEF ---------------- */}
      {!loading && mode === 'brief' && brief && (
        <div className="mt-2">
          <h1 className="animate-rise-1 font-display text-4xl font-extrabold leading-[0.98] tracking-tight text-ink sm:text-6xl">
            {worn ? (
              <>
                Looking good <em className="not-italic text-iris">today.</em>
              </>
            ) : isRefinement ? (
              <>
                For <em className="not-italic text-iris">{brief.occasion?.toLowerCase()}.</em>
              </>
            ) : (
              <>
                Today, <em className="not-italic text-iris">wear this.</em>
              </>
            )}
          </h1>

          <p className="mt-3 max-w-xl animate-rise-2 text-sm text-ink/55">
            {brief.weather && (
              <span>
                {Math.round(brief.weather.temperatureC)}° · {brief.weather.description} ·{' '}
              </span>
            )}
            <span className="font-serif italic">{brief.rationale}</span>
          </p>

          <div className="mt-6 grid max-w-3xl animate-rise-3 grid-cols-2 gap-3 sm:grid-cols-4">
            {brief.items.map((item) => (
              <GarmentTile
                key={item.id}
                imageUrl={item.imageUrl}
                label={itemLabel(item)}
                sublabel={worn || isRefinement ? undefined : 'tap to swap'}
                aspect="aspect-[3/4]"
                onClick={worn || isRefinement ? undefined : () => void openSwap(item)}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {!worn ? (
              <button
                type="button"
                onClick={() => void handleWear()}
                disabled={busy === 'wear'}
                className="btn-primary"
              >
                {busy === 'wear' ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" /> Logging…
                  </>
                ) : evening ? (
                  '✓ I wore this'
                ) : (
                  '✓ Wearing it'
                )}
              </button>
            ) : (
              <span className="inline-flex items-center rounded-xl bg-iris-soft px-4 py-2.5 text-sm font-semibold text-iris">
                ✓ Logged for today
              </span>
            )}
            <button type="button" onClick={handleSeeOnYou} className="btn-ghost">
              See it on you ✦
            </button>
            {!isRefinement ? (
              <button
                type="button"
                onClick={() => void load({ refresh: true })}
                disabled={busy === 'another' || worn}
                className="btn-ghost"
              >
                {busy === 'another' ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" /> Restyling…
                  </>
                ) : (
                  '↻ Another'
                )}
              </button>
            ) : (
              <button type="button" onClick={() => void load()} className="btn-ghost">
                ← Back to today's brief
              </button>
            )}
          </div>

          {stats && stats.monthlyPayback > 0 && (
            <p className="mt-5 text-xs text-ink/45">
              Your closet worked{' '}
              <span className="font-semibold text-ink/70">
                ₹{stats.monthlyPayback.toLocaleString('en-IN')}
              </span>{' '}
              for you this month · {stats.rotationPct}% of it in rotation
            </p>
          )}

          {/* Refinement */}
          <div className="mt-10 border-t border-ink/10 pt-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink/45">
              Dressing for something else?
            </p>
            <form onSubmit={handleOccasionSubmit} className="flex max-w-xl items-center gap-2 rounded-2xl border border-ink/10 bg-surface p-1.5 pl-4">
              <input
                value={occasionText}
                onChange={(e) => setOccasionText(e.target.value)}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-ink/35"
                placeholder="Dinner in the city, smart-casual…"
              />
              <button type="submit" disabled={busy === 'occasion'} className="btn-primary !px-4 !py-2">
                {busy === 'occasion' ? <Spinner className="h-4 w-4" /> : 'Style it'}
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {OCCASIONS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setOccasionText(chip)
                    void load({ occasion: chip })
                  }}
                  className="chip"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- NUDGES ---------------- */}
      {!loading && cards.length > 0 && (
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {cards.map((card, i) => (
            <Link
              key={i}
              to="/circle"
              className="card animate-rise p-4 transition hover:-translate-y-0.5 hover:shadow-card"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-iris">
                {card.type === 'pick_received' && 'A friend styled you'}
                {card.type === 'poll_result' && 'Your poll ended'}
                {card.type === 'poll_open' && 'Poll running'}
                {card.type === 'new_follower' && 'New follower'}
                {card.type === 'style_a_friend' && 'Your circle'}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-ink/75">
                {card.type === 'pick_received' &&
                  `@${String(card.byHandle ?? 'a friend')} picked an outfit for you`}
                {card.type === 'poll_result' &&
                  `"${String(card.question)}" — ${String(card.totalVotes)} votes in`}
                {card.type === 'poll_open' && `"${String(card.question)}" is collecting votes`}
                {card.type === 'new_follower' && `@${String(card.handle)} started following you`}
                {card.type === 'style_a_friend' && 'Pick an outfit for a friend →'}
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* ---------------- SWAP SLIDE-OVER ---------------- */}
      <SlideOver
        open={swapItem !== null}
        onClose={() => setSwapItem(null)}
        title={swapItem ? `Swap the ${itemLabel(swapItem)}` : 'Swap'}
      >
        {swapItem && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="w-20">
                <GarmentTile imageUrl={swapItem.imageUrl} aspect="aspect-square" />
              </div>
              <p className="text-sm text-ink/60">
                Alternatives from your closet that still work for today.
              </p>
            </div>
            {alternatives === null && (
              <div className="flex justify-center py-8 text-ink/50">
                <Spinner className="h-5 w-5" />
              </div>
            )}
            {alternatives !== null && alternatives.length === 0 && (
              <p className="rounded-xl border border-dashed border-ink/15 p-4 text-sm text-ink/50">
                No other {swapItem.category} pieces available right now — add more to your closet
                to unlock swaps.
              </p>
            )}
            {alternatives !== null && alternatives.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {alternatives.map((alt) => (
                  <GarmentTile
                    key={alt.id}
                    imageUrl={alt.imageUrl}
                    label={itemLabel(alt)}
                    aspect="aspect-[3/4]"
                    onClick={() => void handleSwap(alt)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </SlideOver>
    </PageShell>
  )
}
