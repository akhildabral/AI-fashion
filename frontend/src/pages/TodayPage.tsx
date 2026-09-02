import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useProfile } from '../context/useProfile'
import { apiFetch } from '../lib/api'
import { sendItemFeedback } from '../lib/wardrobe'
import type { FeedbackSignal } from '../lib/types'
import {
  getTrips,
  shareBrief,
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
  type Trip,
} from '../lib/brief'
import type { GenerateResponse, Look } from '../lib/types'
import { LookCard } from '../components/LookCard'
import { GarmentTile, Modal, PageShell, Toast, useFlash } from '../components/ui'
import { Spinner } from '../components/Spinner'

const OCCASIONS = ['Date night', 'Brunch', 'Wedding guest', 'Travel', 'Big meeting']

// Spoken-language complaints → the real learning-loop signals. Tapping one
// trains the stylist; the backend returns { adjusted } so we can tell the
// user honestly whether anything actually moved.
const FEEDBACK: { signal: FeedbackSignal; label: string; done: string }[] = [
  { signal: 'too-formal', label: 'Too formal', done: "Noted — I'll read this one more casual." },
  { signal: 'too-casual', label: 'Too casual', done: "Noted — I'll dress this up a little." },
  { signal: 'too-warm', label: 'Runs warm', done: "Noted — I'll save it for cooler days." },
  { signal: 'not-warm-enough', label: 'Not warm enough', done: "Noted — I'll lean on it when it's cold." },
  { signal: 'wrong-color', label: 'Wrong colour', done: "I'll stop trusting the colour on this one." },
  { signal: 'dont-suggest', label: 'Stop suggesting this', done: "Off the rail. I won't put it forward again." },
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function dateLine(): string {
  return new Date()
    .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()
}

function itemLabel(i: BriefItem): string {
  return i.subtype ?? i.category
}

export function TodayPage() {
  usePageTitle('Today')
  const { user } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const { toast, flash } = useFlash()

  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'brief' | 'starter' | null>(null)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [worn, setWorn] = useState(false)
  const [isRefinement, setIsRefinement] = useState(false)
  const [stats, setStats] = useState<RitualStats | null>(null)
  const [cards, setCards] = useState<FeedCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [reconsider, setReconsider] = useState<BriefItem | null>(null)
  const [alternatives, setAlternatives] = useState<BriefItem[] | null>(null)
  const [fbNote, setFbNote] = useState<string | null>(null)
  const [occasionText, setOccasionText] = useState('')
  const [starterLooks, setStarterLooks] = useState<Look[] | null>(null)
  const [sharePrompt, setSharePrompt] = useState<'hidden' | 'offer' | 'shared'>('hidden')
  const [upcomingTrip, setUpcomingTrip] = useState<Trip | null>(null)

  const name = (() => {
    const raw = user?.firstName ?? user?.handle ?? user?.email?.split('@')[0] ?? 'there'
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
      setMode((prev) => prev ?? 'starter')
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
    getTrips()
      .then((r) => {
        const today = new Date().toISOString().slice(0, 10)
        const soon = r.trips.find((tr) => tr.startDate > today)
        setUpcomingTrip(soon ?? null)
      })
      .catch(() => undefined)
  }, [load])

  async function handleWear() {
    if (!brief) return
    setBusy('wear')
    try {
      await wearBrief(brief.itemIds)
      setWorn(true)
      setSharePrompt('offer')
      const fresh = await getRitualStats().catch(() => null)
      if (fresh) {
        setStats(fresh)
        const brk = fresh.priceBreaks[0]
        flash(
          brk
            ? `Logged. Your ${brk.label} just broke ₹${brk.threshold}/wear.`
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

  async function openReconsider(item: BriefItem) {
    if (worn || isRefinement) return
    setReconsider(item)
    setAlternatives(null)
    setFbNote(null)
    try {
      const res = await getBriefAlternatives(item.category, brief?.itemIds ?? [])
      setAlternatives(res.alternatives)
    } catch {
      setAlternatives([])
    }
  }

  async function handleSwap(inItem: BriefItem) {
    if (!reconsider) return
    setBusy('swap')
    try {
      const res = await swapBriefItem(reconsider.id, inItem.id)
      setBrief(res.brief)
      setReconsider(null)
      flash(`Swapped in the ${itemLabel(inItem)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed.')
    } finally {
      setBusy(null)
    }
  }

  async function handleFeedback(signal: FeedbackSignal) {
    if (!reconsider) return
    const spec = FEEDBACK.find((f) => f.signal === signal)
    setBusy('feedback')
    try {
      const { adjusted } = await sendItemFeedback(reconsider.id, signal)
      if (signal === 'dont-suggest') {
        setReconsider(null)
        flash(spec?.done ?? 'Off the rail.')
        void load()
        return
      }
      setFbNote(adjusted ? (spec?.done ?? 'Noted.') : 'Already how you set it — I’ll keep it that way.')
    } catch {
      setFbNote('Couldn’t note that — try again.')
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
        body: {
          occasion: 'my everyday style',
          gender: profile?.styleFor ?? localStorage.getItem('ai-fashion-style-for') ?? 'unisex',
        },
      })
      setStarterLooks(res.looks ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not style a look.')
    } finally {
      setBusy(null)
    }
  }

  const evening = new Date().getHours() >= 18
  const reconsiderable = !worn && !isRefinement

  return (
    <PageShell>
      <Toast msg={toast} />

      {/* ---------------- Greeting ---------------- */}
      <div className="animate-rise">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink/40">{dateLine()}</p>
        <p className="mt-2 font-display text-xl italic text-ink/80 sm:text-2xl">
          {greeting()}, <span className="text-brass">{name}</span>
          {stats && stats.streak > 1 && (
            <span className="ml-3 align-middle font-sans text-[11px] font-semibold not-italic uppercase tracking-[0.14em] text-ink/40">
              — {stats.streak} days styled
            </span>
          )}
        </p>
      </div>

      {loading && (
        <div className="flex min-h-[42vh] flex-col items-center justify-center gap-3 text-ink/50">
          <Spinner className="h-6 w-6" />
          <p className="font-display text-sm italic">composing your look…</p>
        </div>
      )}

      {/* ---------------- STARTER: empty closet ---------------- */}
      {!loading && mode === 'starter' && (
        <div className="mt-4">
          <h1 className="animate-rise-1 font-display text-5xl font-medium leading-[1.0] text-ink sm:text-6xl">
            Let&rsquo;s fill <em className="text-brass">your closet.</em>
          </h1>
          <p className="mt-4 max-w-xl animate-rise-2 font-display text-lg italic text-ink/60">
            every morning starts with an outfit — composed from what you own, ready to wear
          </p>
          <div className="mt-7 flex animate-rise-2 flex-wrap gap-3">
            <Link to="/closet" className="btn-primary">
              Add your clothes
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

          {/* Ghost niches — the shape of tomorrow's brief */}
          <div className="mt-12 animate-rise-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {['Top', 'Bottom', 'Shoes', 'Accessory'].map((slot) => (
                <div key={slot}>
                  <div className="arch-bezel aspect-[3/4] opacity-40">
                    <div className="arch-niche flex h-full w-full items-center justify-center">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/30">
                        {slot}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center font-display text-sm italic text-ink/40">
              your first brief will hang here
            </p>
          </div>

          {error && (
            <p className="mt-6 animate-rise alert-error" role="alert">
              {error}
            </p>
          )}
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
        <>
          {error && (
            <p className="mt-4 alert-error" role="alert">
              {error}
            </p>
          )}

          <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <div className="min-w-0">
          <div className="max-w-3xl">
            <h1 className="animate-rise-1 font-display text-5xl font-medium leading-[1.0] text-ink sm:text-6xl">
              {worn ? (
                <>
                  Looking good <em className="text-brass">today.</em>
                </>
              ) : isRefinement ? (
                <>
                  For <em className="text-brass">{brief.occasion?.toLowerCase()}.</em>
                </>
              ) : (
                <>
                  {evening ? 'Tonight,' : 'Today,'} <em className="text-brass">wear this.</em>
                </>
              )}
            </h1>

            <p className="mt-4 max-w-2xl animate-rise-2 text-[15px] leading-relaxed text-ink/55">
              {brief.weather && (
                <span className="font-semibold text-brass">
                  {Math.round(brief.weather.temperatureC)}° · {brief.weather.description}
                  {'  ·  '}
                </span>
              )}
              <span className="font-display italic text-ink/70">{brief.rationale}</span>
            </p>

            {brief.trip && (
              <div className="mt-4 inline-flex animate-rise-2 items-center gap-2 rounded-[3px] border border-brass/30 bg-iris-soft px-3.5 py-2 text-xs font-semibold text-brass">
                <span className="uppercase tracking-[0.14em]">Styling from your {brief.trip.destination} capsule</span>
                <span className="text-ink/40">
                  · until{' '}
                  {new Date(`${brief.trip.endDate}T00:00:00`).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
            )}
          </div>

          {/* The outfit — arched apertures, with a one-time light-catch sweep */}
          <div key={brief.itemIds.join('-')} className="relative mt-8">
            <div className="grid animate-rise-3 grid-cols-3 gap-3 sm:gap-4 md:grid-cols-4">
              {brief.items.map((item) => (
                <GarmentTile
                  key={item.id}
                  imageUrl={item.imageUrl}
                  label={itemLabel(item)}
                  sublabel={reconsiderable ? 'reconsider' : undefined}
                  onClick={reconsiderable ? () => void openReconsider(item) : undefined}
                />
              ))}
            </div>
            <div
              aria-hidden
              className="animate-arch-sweep pointer-events-none absolute inset-0 z-[3]"
              style={{
                background:
                  'linear-gradient(115deg, transparent 44%, var(--c-sheen) 49%, transparent 55%)',
              }}
            />
          </div>

          {/* Primary actions */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
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
                  'I wore this'
                ) : (
                  'Wearing it'
                )}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-[3px] border border-brass/30 bg-iris-soft px-4 py-2.5 text-sm font-semibold text-brass">
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                  <path d="M2 7l3 3 6-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Logged for today
              </span>
            )}
            <button type="button" onClick={handleSeeOnYou} className={worn ? 'btn-primary' : 'btn-ghost'}>
              See it on you
            </button>
            {!isRefinement && !worn ? (
              <button
                type="button"
                onClick={() => void load({ refresh: true })}
                disabled={busy === 'another'}
                className="btn-ghost"
              >
                {busy === 'another' ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" /> Restyling…
                  </>
                ) : (
                  'Another'
                )}
              </button>
            ) : isRefinement ? (
              <button type="button" onClick={() => void load()} className="btn-ghost">
                Back to today&rsquo;s brief
              </button>
            ) : null}
          </div>

          {sharePrompt === 'offer' && (
            <div className="mt-5 flex max-w-md animate-rise items-center justify-between gap-3 rounded-[3px] border border-brass/30 bg-iris-soft px-4 py-3">
              <p className="text-sm text-ink/80">Share today&rsquo;s outfit to your circle?</p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="btn-primary !px-4 !py-2 !text-xs"
                  onClick={() => {
                    void shareBrief()
                      .then(() => {
                        setSharePrompt('shared')
                        flash("Shared — your circle can see today's outfit.")
                      })
                      .catch(() => flash('Could not share right now.'))
                  }}
                >
                  Share
                </button>
                <button
                  type="button"
                  className="btn-ghost !px-3 !py-2 !text-xs"
                  onClick={() => setSharePrompt('hidden')}
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          </div>

          {/* Right rail on desktop: the payoff and the dial, beside the look */}
          <aside className="mt-10 lg:mt-0 lg:self-start">
          {/* The ROI plaque — the proud payoff */}
          {stats && stats.monthlyPayback > 0 && (
            <div className="plaque max-w-md animate-rise p-5 pl-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">
                Your closet is working
              </p>
              <p className="mt-1 font-display text-3xl font-semibold text-brass [font-variant-numeric:tabular-nums]">
                ₹{stats.monthlyPayback.toLocaleString('en-IN')}{' '}
                <span className="font-sans text-xs font-semibold text-ink/55">this month</span>
              </p>
              <div className="mt-3 flex gap-6 border-t border-ink/10 pt-3">
                <div>
                  <p className="font-display text-lg font-semibold text-ink [font-variant-numeric:tabular-nums]">
                    {stats.rotationPct}%
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-ink/45">in rotation</p>
                </div>
                <div>
                  <p className="font-display text-lg font-semibold text-ink [font-variant-numeric:tabular-nums]">
                    {stats.outfitsThisWeek}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-ink/45">this week</p>
                </div>
                <div>
                  <p className="font-display text-lg font-semibold text-ink [font-variant-numeric:tabular-nums]">
                    {stats.streak}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-ink/45">day streak</p>
                </div>
              </div>
            </div>
          )}

          {/* Occasion refinement — beside the confident answer */}
          <div className={`max-w-xl ${stats && stats.monthlyPayback > 0 ? 'mt-8' : ''}`}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">
              Dressing for something else?
            </p>
            <form
              onSubmit={handleOccasionSubmit}
              className="flex items-center gap-2 rounded-[3px] border border-ink/15 bg-surface p-1.5 pl-4 focus-within:border-brass/60 focus-within:ring-2 focus-within:ring-brass/20"
            >
              <input
                value={occasionText}
                onChange={(e) => setOccasionText(e.target.value)}
                aria-label="Describe an occasion"
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
          </aside>
          </div>

          {/* Trip + circle nudges */}
          {(cards.length > 0 || upcomingTrip) && (
            <div className="mt-12 grid gap-3 sm:grid-cols-3">
              {upcomingTrip && (
                <Link to="/trips" className="card card-hover press animate-rise p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">
                    Trip coming up
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink/75">
                    {upcomingTrip.destination} on {upcomingTrip.startDate} —{' '}
                    {upcomingTrip.packedItemIds.length > 0
                      ? `${upcomingTrip.packedItemIds.length} pieces packed`
                      : 'pack from your closet'}
                  </p>
                </Link>
              )}
              {cards.map((card, i) => (
                <Link key={i} to="/circle" className="card card-hover press animate-rise p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">
                    {card.type === 'ootd' && 'Circle OOTD'}
                    {card.type === 'pick_received' && 'A friend styled you'}
                    {card.type === 'poll_result' && 'Your poll ended'}
                    {card.type === 'poll_open' && 'Poll running'}
                    {card.type === 'new_follower' && 'New follower'}
                    {card.type === 'style_a_friend' && 'Your circle'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink/75">
                    {card.type === 'ootd' && `@${String(card.handle)} shared today's outfit`}
                    {card.type === 'pick_received' &&
                      `@${String(card.byHandle ?? 'a friend')} picked an outfit for you`}
                    {card.type === 'poll_result' &&
                      `"${String(card.question)}" — ${String(card.totalVotes)} votes in`}
                    {card.type === 'poll_open' && `"${String(card.question)}" is collecting votes`}
                    {card.type === 'new_follower' && `@${String(card.handle)} started following you`}
                    {card.type === 'style_a_friend' && 'Pick an outfit for a friend'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------------- RECONSIDER MODAL: swap + train the stylist ---------------- */}
      <Modal
        open={reconsider !== null}
        onClose={() => setReconsider(null)}
        title={reconsider ? `The ${itemLabel(reconsider)}` : 'Reconsider'}
      >
        {reconsider && (
          <>
            <div className="mb-5 flex items-center gap-4">
              <div className="w-20 shrink-0">
                <GarmentTile imageUrl={reconsider.imageUrl} />
              </div>
              <p className="text-sm text-ink/60">
                Swap it for another piece from your closet — or tell the stylist what&rsquo;s off, and
                it&rsquo;ll learn.
              </p>
            </div>

            {/* Train the stylist */}
            <p className="label">Tell the stylist</p>
            {fbNote ? (
              <p className="mb-4 rounded-[3px] border border-brass/30 bg-iris-soft px-4 py-3 font-display text-sm italic text-ink/80">
                {fbNote}
              </p>
            ) : (
              <div className="mb-5 flex flex-wrap gap-2">
                {FEEDBACK.map((f) => (
                  <button
                    key={f.signal}
                    type="button"
                    disabled={busy === 'feedback'}
                    onClick={() => void handleFeedback(f.signal)}
                    className="chip !text-xs"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Swap */}
            <p className="label">Swap it</p>
            {alternatives === null && (
              <div className="flex justify-center py-6 text-ink/50">
                <Spinner className="h-5 w-5" />
              </div>
            )}
            {alternatives !== null && alternatives.length === 0 && (
              <p className="rounded-[3px] border border-dashed border-ink/20 p-4 text-sm text-ink/50">
                No other {reconsider.category} pieces free right now — add more to your closet to
                unlock swaps.
              </p>
            )}
            {alternatives !== null && alternatives.length > 0 && (
              <div
                className={`grid grid-cols-3 gap-3 ${busy === 'swap' ? 'pointer-events-none opacity-50' : ''}`}
              >
                {alternatives.map((alt) => (
                  <GarmentTile
                    key={alt.id}
                    imageUrl={alt.imageUrl}
                    label={itemLabel(alt)}
                    onClick={() => void handleSwap(alt)}
                  />
                ))}
              </div>
            )}
            {busy === 'swap' && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-ink/50">
                <Spinner className="h-4 w-4" /> swapping…
              </div>
            )}
          </>
        )}
      </Modal>
    </PageShell>
  )
}
