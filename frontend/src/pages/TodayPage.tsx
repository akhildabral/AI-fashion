import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { setLookPhoto } from '../lib/circle'
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
  todayKey,
  shiftKey,
  undoBrief,
  weatherCheck,
  type Brief,
  type BriefResponse,
  type BriefItem,
  type FeedCard,
  type RitualStats,
  type Trip,
} from '../lib/brief'
import type { GenerateResponse, Look } from '../lib/types'
import { LookCard } from '../components/LookCard'
import { GarmentTile, Modal, PageShell, Toast, useFlash } from '../components/ui'
import { Spinner } from '../components/Spinner'
import { shareCard, outcomeLine } from '../lib/share'
import { ClosetNotes } from '../components/ClosetNotes'
import { WeekStrip } from '../components/WeekStrip'
import { DayView } from '../components/DayView'
import { EveningAct } from '../components/EveningAct'


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
  const [mode, setMode] = useState<'brief' | 'starter' | 'rest' | 'unplanned' | null>(null)
  const [data, setData] = useState<BriefResponse | null>(null)
  const [selected, setSelected] = useState(todayKey())
  const [weekKey, setWeekKey] = useState(0)
  const hour = new Date().getHours()
  const isToday = selected === todayKey()
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

  const apply = useCallback((res: BriefResponse) => {
    setData(res)
    setMode(res.mode)
    setBrief(res.brief ?? null)
    setWorn(Boolean(res.worn))
    // Refinements are the day's brief now; nothing is ephemeral.
    setIsRefinement(false)
    setWeekKey((k) => k + 1)
  }, [])

  const load = useCallback(async (opts: { occasion?: string; refresh?: boolean; eventType?: string } = {}) => {
    setError(null)
    setBusy(opts.occasion || opts.eventType ? 'occasion' : opts.refresh ? 'another' : null)
    if (!opts.occasion && !opts.refresh && !opts.eventType) setLoading(true)
    try {
      const res = await getBrief(opts)
      apply(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(/status 5\d\d|failed to fetch/i.test(msg) ? 'The stylist is out for a moment. Try again in a few seconds.' : msg || 'Could not load your brief.')
      setMode((prev) => prev ?? 'starter')
    } finally {
      setLoading(false)
      setBusy(null)
    }
  }, [apply])

  async function goBack() {
    setBusy('undo')
    try {
      apply(await undoBrief())
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Nothing to go back to.')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    void load()
    // The midday check: did the forecast move since the brief was composed?
    if (new Date().getHours() >= 12) {
      weatherCheck()
        .then(({ note }) => setData((d) => (d ? { ...d, weatherNote: note } : d)))
        .catch(() => undefined)
    }
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

  const nudges = (stacked: boolean) => (
    <>
          {(cards.length > 0 || upcomingTrip) && (
            <div className={stacked ? 'mt-8 grid gap-3' : 'mt-12 grid gap-3 sm:grid-cols-3'}>
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
                <Link key={i} to={card.type === 'new_follower' && card.handle ? `/u/${String(card.handle)}` : card.type === 'ootd' && card.handle ? `/u/${String(card.handle)}` : '/circle'} className="card card-hover press animate-rise p-4">
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
  )

  return (
    <PageShell wide>
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

      {/* An abandoned fitting resumes from here, never resets */}
      {!loading && profile && !profile.fittingCompletedAt && (profile.fittingStep ?? 0) > 0 && (
        <Link to={`/fitting?s=${profile.fittingStep}`} className="plaque press mt-4 flex animate-rise items-center justify-between gap-4 p-4 pl-5">
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Your fitting</span>
            <span className="mt-0.5 block font-display text-lg italic text-ink">{Math.round(((profile.fittingStep ?? 0) / 13) * 100)}% taken. Pick it up where you left it.</span>
          </span>
          <span className="btn-primary !px-4 !py-2 !text-xs">Continue</span>
        </Link>
      )}

      {!loading && profile && <ClosetNotes />}

      {/* The week: what you wore, what's planned, where you are */}
      {!loading && profile && <WeekStrip selected={selected} onSelect={setSelected} refreshKey={weekKey} />}

      {/* Another day on the strip: the recap, or the plan */}
      {!loading && !isToday && (
        <div className="mt-8">
          <DayView date={selected} onChanged={() => setWeekKey((k) => k + 1)} onNote={flash} />
          <button type="button" onClick={() => setSelected(todayKey())} className="press mt-6 text-sm text-ink/45 hover:text-ink/70">
            ← Back to today
          </button>
        </div>
      )}

      {/* A home day */}
      {!loading && isToday && mode === 'rest' && (
        <div className="mt-8 animate-rise">
          <h1 className="font-display text-5xl font-medium leading-[1.0] text-ink sm:text-6xl">
            A home <em className="text-brass">day.</em>
          </h1>
          <p className="mt-4 max-w-md font-display text-lg italic text-ink/55">No look, no push. The streak stays honest. Change your mind and the stylist is a tap away.</p>
          <button type="button" onClick={() => void load({ refresh: true })} className="btn-ghost mt-5">
            Dress me after all
          </button>
        </div>
      )}

      {/* ---------------- STARTER: empty closet ---------------- */}
      {!loading && isToday && mode === 'starter' && (
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
      {!loading && isToday && mode === 'brief' && brief && (
        <>
          {error && (
            <p className="mt-4 alert-error" role="alert">
              {error}
            </p>
          )}

          <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 xl:gap-16">
          <div className="min-w-0">
          <div className="max-w-3xl">
            <h1 className="animate-rise-1 font-display text-5xl font-medium leading-[1.0] text-ink sm:text-6xl xl:text-7xl">
              {worn ? (
                <>
                  Looking good <em className="text-brass">today.</em>
                </>
              ) : brief.occasion ? (
                <>
                  For <em className="text-brass">{brief.occasion.toLowerCase()}.</em>
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
            {data?.weatherNote && (
              <p className="mt-2 inline-flex animate-rise items-center gap-2 rounded-[3px] border border-brass/30 bg-iris-soft px-3 py-1.5 text-xs font-semibold text-brass">
                Weather moved · <span className="font-normal text-ink/70">{data.weatherNote}</span>
              </p>
            )}
            {data?.plannedAt && !worn && <p className="mt-2 text-xs text-ink/45">Laid out last night.</p>}

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
            <div className="grid animate-rise-3 grid-cols-3 gap-3 sm:gap-5 md:grid-cols-4 lg:gap-6">
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
            ) : null}
            {data?.canUndo && !worn && (
              <button type="button" disabled={busy === 'undo'} onClick={() => void goBack()} className="press px-2 text-sm text-ink/45 hover:text-ink/70">
                {busy === 'undo' ? '…' : 'Back to the first'}
              </button>
            )}
          </div>

          {/* The kind of day: the stylist's guess, changeable in a tap */}
          {!worn && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">The day</span>
              {(
                [
                  ['work', 'Work'],
                  ['casual', 'Weekend'],
                  ['evening', 'Evening'],
                  ['occasion', 'Occasion'],
                  ['athletic', 'Training'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" disabled={busy !== null} onClick={() => void load({ eventType: k })} className={`chip !px-3 !py-1.5 !text-xs ${brief.eventType === k && !brief.occasion ? 'chip-on' : ''}`}>
                  {l}
                </button>
              ))}
              <form onSubmit={handleOccasionSubmit} className="flex gap-1.5">
                <input value={occasionText} onChange={(e) => setOccasionText(e.target.value)} className="field !w-44 !py-1.5 !text-xs" placeholder="or name it: a wedding…" />
                <button type="submit" disabled={busy !== null || !occasionText.trim()} className="btn-ghost !px-3 !py-1.5 !text-xs disabled:opacity-50">
                  Go
                </button>
              </form>
            </div>
          )}

          {sharePrompt === 'offer' && (
            <ShareSheet
              onDone={(msg) => {
                setSharePrompt('shared')
                flash(msg)
              }}
              onDismiss={() => setSharePrompt('hidden')}
              onError={(msg) => flash(msg)}
              onMirror={(wearLogId) => navigate(`/mirror?items=${brief.itemIds.join(',')}&share=${wearLogId}`)}
            />
          )}

          {/* Act two: tonight */}
          {data && <EveningAct data={data} compact={hour < 18} onUpdated={apply} onNote={flash} />}

          {/* Act three: tomorrow, laid out tonight */}
          {hour >= 20 && (
            <div className="mt-10 border-t border-ink/10 pt-6">
              <DayView date={shiftKey(todayKey(), 1)} laidOut onChanged={() => setWeekKey((k) => k + 1)} onNote={flash} />
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

            <div className="hidden lg:block">{nudges(true)}</div>
          </aside>
          </div>

          <div className="lg:hidden">{nudges(false)}</div>
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


/**
 * The moment after "Wearing it": one decision, three doors. Share the
 * pieces (instant), add a photo of you in it, or have the Mirror render it
 * on you first. Each path shares the same wear; only the hero differs.
 */
function ShareSheet({
  onDone,
  onDismiss,
  onError,
  onMirror,
}: {
  onDone: (msg: string) => void
  onDismiss: () => void
  onError: (msg: string) => void
  onMirror: (wearLogId: string) => void
}) {
  const [busy, setBusy] = useState<'pieces' | 'photo' | 'mirror' | 'elsewhere' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function share(): Promise<string | undefined> {
    const r = await shareBrief()
    return r.wearLogId
  }

  async function sharePieces() {
    setBusy('pieces')
    try {
      await share()
      onDone("Shared — your circle can see today's look.")
    } catch {
      onError('Could not share right now.')
    } finally {
      setBusy(null)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('photo')
    try {
      const id = await share()
      if (id) await setLookPhoto(id, file)
      onDone('Shared with your photo.')
    } catch {
      onError('Could not share the photo right now.')
    } finally {
      setBusy(null)
    }
  }

  async function viaMirror() {
    setBusy('mirror')
    try {
      const id = await share()
      if (!id) throw new Error('no wear')
      onMirror(id)
    } catch {
      onError('Could not start the Mirror right now.')
      setBusy(null)
    }
  }

  return (
    <div className="mt-5 max-w-xl animate-rise rounded-[3px] border border-brass/30 bg-iris-soft p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">Share today’s look?</p>
      <p className="mt-1 text-sm text-ink/70">Your circle sees the pieces. Add yourself to it if you like.</p>
      <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={(e) => void onFile(e)} className="hidden" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void sharePieces()} className="btn-primary !px-4 !py-2 !text-xs">
          {busy === 'pieces' ? 'Sharing…' : 'Share the pieces'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => fileRef.current?.click()} className="btn-ghost !px-4 !py-2 !text-xs">
          {busy === 'photo' ? 'Uploading…' : 'With a photo of me'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void viaMirror()} className="btn-ghost !px-4 !py-2 !text-xs">
          {busy === 'mirror' ? 'Opening the Mirror…' : 'Render it on me first'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('elsewhere')
            try {
              const id = await share()
              if (!id) throw new Error('no wear')
              const o = await shareCard({ kind: 'look', id, title: 'What I’m wearing today', text: 'Today’s look, from my own closet.', url: `${window.location.origin}/look/${id}` })
              const l = outcomeLine(o)
              if (l) onDone(l)
            } catch {
              onError('Could not prepare the card right now.')
            } finally {
              setBusy(null)
            }
          }}
          className="btn-ghost !px-4 !py-2 !text-xs"
        >
          {busy === 'elsewhere' ? 'Preparing…' : 'Share elsewhere'}
        </button>
        <button type="button" onClick={onDismiss} className="press ml-auto text-xs text-ink/45 hover:text-ink/70">
          Not now
        </button>
      </div>
    </div>
  )
}
