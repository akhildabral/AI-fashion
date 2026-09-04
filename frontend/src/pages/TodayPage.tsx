import { temp } from '@zauq/shared/units'
import { money } from '@zauq/shared/money'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { setLookPhoto } from '@zauq/shared/circle'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useProfile } from '../context/useProfile'
import { apiFetch } from '../lib/api'
import { getWardrobe, sendItemFeedback } from '@zauq/shared/wardrobe'
import type { FeedbackSignal, WardrobeItem } from '@zauq/shared/types'
import { resolveImageUrl } from '../lib/api'
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
} from '@zauq/shared/brief'
import type { GenerateResponse, Look } from '@zauq/shared/types'
import { LookCard } from '../components/LookCard'
import { GarmentTile, Modal, PageShell, Toast, useFlash, MoreMenu, MenuItem, Eyebrow, Stat, SectionHead, Alert, Plaque, SkeletonBlock, ArchSkeleton, EmptyState, Chip, VerdictNotes } from '../components/ui'
import { WorePhotoPanel } from '../components/WorePhotoPanel'
import { Spinner } from '../components/Spinner'
import { shareCard, outcomeLine } from '../lib/share'
import { ClosetNotes } from '../components/ClosetNotes'
import { WeekStrip } from '../components/WeekStrip'
import { DayView } from '../components/DayView'
import { LookAct, AddLook } from '../components/LookAct'
import { EVENT_LABEL } from '@zauq/shared/outfits'


// Spoken-language complaints → the real learning-loop signals. Tapping one
// trains the stylist; the backend returns { adjusted } so we can tell the
// user honestly whether anything actually moved.
const FEEDBACK: { signal: FeedbackSignal; label: string; done: string }[] = [
  { signal: 'too-formal', label: 'Too formal', done: "Got it. I’ll read this one more casual." },
  { signal: 'too-casual', label: 'Too casual', done: "Got it. I’ll dress this up a little." },
  { signal: 'too-warm', label: 'Runs warm', done: "Got it. I’ll save it for cooler days." },
  { signal: 'not-warm-enough', label: 'Not warm enough', done: "Got it. I’ll lean on it when it’s cold." },
  { signal: 'wrong-color', label: 'Wrong colour', done: "I’ll stop trusting the colour on this one." },
  { signal: 'dont-suggest', label: 'Stop suggesting this', done: "Off the rail. I won’t put it forward again." },
]

const EVENT_WORD: Record<string, string> = { work: 'work', casual: 'weekend', evening: 'evening', occasion: 'special-occasion', athletic: 'training' }

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

// Small counts read spelled out, per the brand's literary voice ("All four").
const SMALL_NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const spellCount = (n: number): string => SMALL_NUMS[n] ?? String(n)
const daysAgoPhrase = (n: number): string => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`)

// The ledger fact under each brief tile — cost per wear once a piece is priced
// and worn, else its wear count, else "New this month", falling back to colour.
// A real number per piece, the way the closet reads.
function itemSublabel(i: BriefItem): string | undefined {
  if (i.wears && i.wears > 0 && i.costPerWear != null) return `${money(i.costPerWear)} / wear`
  if (i.wears && i.wears > 0) return `${i.wears} ${i.wears === 1 ? 'wear' : 'wears'}`
  if (i.isNew) return 'New this month'
  if (i.primaryColor) return i.primaryColor.replace(/\b\w/g, (c) => c.toUpperCase())
  return undefined
}

const tripDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function tripIsTomorrow(t: Trip): boolean {
  const tm = new Date()
  tm.setDate(tm.getDate() + 1)
  return t.startDate === localDay(tm)
}
function tripIsOn(t: Trip): boolean {
  const today = localDay(new Date())
  return t.startDate <= today && t.endDate >= today
}

/** The first brief's four niches, filled from what the closet already holds. */
const STARTER_SLOTS: { key: string; label: string; take: (i: WardrobeItem) => boolean }[] = [
  { key: 'top', label: 'A top', take: (i) => i.category === 'top' || i.category === 'dress' },
  { key: 'bottom', label: 'A bottom', take: (i) => i.category === 'bottom' || i.category === 'dress' },
  { key: 'shoes', label: 'Shoes', take: (i) => i.category === 'footwear' },
  { key: 'more', label: 'One more thing', take: () => true },
]
function starterSlots(closet: WardrobeItem[]): { key: string; label: string; item: WardrobeItem | null }[] {
  const used = new Set<string>()
  return STARTER_SLOTS.map((slot) => {
    const item = closet.find((i) => !used.has(i.id) && slot.take(i)) ?? null
    if (item) used.add(item.id)
    return { key: slot.key, label: slot.label, item }
  })
}
function starterLine(closet: WardrobeItem[]): string {
  const missing = starterSlots(closet).filter((s) => !s.item).map((s) => s.label.toLowerCase())
  if (missing.length === 0) return 'The niches are full. Tonight at eight, tomorrow\u2019s outfit hangs here.'
  if (missing.length === 4) return 'Your first brief hangs here once these four are in the closet.'
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return `Add ${list}, and tomorrow\u2019s outfit hangs here.`
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
  const [dayOpen, setDayOpen] = useState(false)
  const [starterLooks, setStarterLooks] = useState<Look[] | null>(null)
  const [closet, setCloset] = useState<WardrobeItem[]>([])
  useEffect(() => {
    if (mode !== 'starter') return
    getWardrobe()
      .then((r) => setCloset(r.items.filter((i) => i.status === 'ready' && i.owned !== false)))
      .catch(() => setCloset([]))
  }, [mode])
  const [sharePrompt, setSharePrompt] = useState<'hidden' | 'offer' | 'shared'>('hidden')
  // "Wore something else": a photo of the day, read into pieces.
  const [photoOpen, setPhotoOpen] = useState(false)
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
            ? `Logged. Your ${brk.label} just broke ${money(brk.threshold)}/wear.`
            : `Logged. ${fresh.streak} day${fresh.streak === 1 ? '' : 's'} styled in a row.`,
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
      setFbNote(adjusted ? (spec?.done ?? 'Noted.') : 'That’s already how you set it. It stays.')
    } catch {
      setFbNote('Couldn’t note that. Try again.')
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
            <div className={stacked ? 'mt-8 grid gap-4' : 'mt-12 grid gap-4 sm:grid-cols-3'}>
              {upcomingTrip && (
                <Link to={`/trips/${upcomingTrip.id}`} className="card card-hover press animate-rise p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-ink">
                    {tripIsTomorrow(upcomingTrip) ? 'Packing tonight?' : tripIsOn(upcomingTrip) ? 'On the road' : 'Trip coming up'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink/75">
                    {upcomingTrip.destination}
                    {tripIsOn(upcomingTrip) ? '' : ` from ${tripDay(upcomingTrip.startDate)}`} ·{' '}
                    {tripIsTomorrow(upcomingTrip) ? 'the checklist is ready' : `${upcomingTrip.packedItemIds.length} pieces packed`}
                  </p>
                </Link>
              )}
              {cards.map((card, i) => (
                <Link key={i} to={card.type === 'new_follower' && card.handle ? `/u/${String(card.handle)}` : card.type === 'ootd' && card.handle ? `/u/${String(card.handle)}` : '/circle'} className="card card-hover press animate-rise p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-ink">
                    {card.type === 'ootd' && 'Circle OOTD'}
                    {card.type === 'pick_received' && 'A friend styled you'}
                    {card.type === 'poll_result' && 'Your poll ended'}
                    {card.type === 'poll_open' && 'Poll running'}
                    {card.type === 'new_follower' && 'New follower'}
                    {card.type === 'style_a_friend' && 'Your circle'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink/75">
                    {card.type === 'ootd' && `${String(card.name ?? card.handle)} shared today’s outfit`}
                    {card.type === 'pick_received' &&
                      `${String(card.byName ?? card.byHandle ?? 'A friend')} picked an outfit for you`}
                    {card.type === 'poll_result' &&
                      `“${String(card.question)}”, ${String(card.totalVotes)} ${card.totalVotes === 1 ? 'vote' : 'votes'} in`}
                    {card.type === 'poll_open' && `“${String(card.question)}” is collecting votes`}
                    {card.type === 'new_follower' && `${String(card.name ?? card.handle)} started following you`}
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
      {/* The two facts the wardrobe has earned, quiet in the corner: lifetime
          wears logged and the current streak. A stat, not a gamified badge. */}
      <div className="flex animate-rise flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <Eyebrow>{dateLine()}</Eyebrow>
          <p className="mt-2 font-display text-xl italic text-ink/80">
            {greeting()}, <span className="text-brass-ink">{name}</span>
          </p>
        </div>
        {stats && (stats.wearsLogged > 0 || stats.streak > 0) && (
          <div className="flex gap-8">
            {stats.wearsLogged > 0 && <Stat value={stats.wearsLogged} label="Wears logged" />}
            {stats.streak > 0 && <Stat value={stats.streak} label="Day streak" accent />}
          </div>
        )}
      </div>

      {loading && (
        <div className="mt-8" aria-busy="true" aria-label="Composing your look">
          {/* A skeleton in the brief's own shape — the title, then the arches —
              so the real look resolves in place with no jump. */}
          <SkeletonBlock className="h-9 w-72 max-w-[80%]" />
          <SkeletonBlock className="mt-3 h-4 w-56 max-w-[60%] !bg-ink/[0.07]" />
          <ArchSkeleton count={4} className="grid-brief mt-8" />
          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-brass-ink">developing</p>
        </div>
      )}

      {/* An abandoned fitting resumes from here, never resets */}
      {!loading && profile && !profile.fittingCompletedAt && (profile.fittingStep ?? 0) > 0 && (
        <Link to={`/fitting?s=${profile.fittingStep}`} className="card card-hover press mt-4 flex animate-rise items-center justify-between gap-4 p-4">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">Your fitting</span>
            <span className="mt-1 block font-display text-lg italic text-ink">{Math.round(((profile.fittingStep ?? 0) / 13) * 100)}% taken. Pick it up where you left it.</span>
          </span>
          <span className="btn-primary btn-sm">Continue</span>
        </Link>
      )}

      {/* After the short-path fitting, the refinements it deferred: a quiet,
          self-dismissing nudge that's gone the moment sizes are filled in. */}
      {!loading && profile && profile.fittingCompletedAt && !profile.sizes?.top && !profile.sizes?.bottom && !profile.sizes?.shoe && (
        <Link to="/profile" className="card card-hover press mt-4 flex animate-rise items-center justify-between gap-4 p-4">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">A finer fit</span>
            <span className="mt-1 block font-display text-lg italic text-ink">Add your sizes and tone — looks land better when the Mirror knows them.</span>
          </span>
          <span className="btn-ghost btn-sm">Add details</span>
        </Link>
      )}

      {!loading && profile && <ClosetNotes />}

      {/* The week: what you wore, what's planned, where you are */}
      {!loading && profile && <WeekStrip selected={selected} onSelect={setSelected} refreshKey={weekKey} />}

      {/* Another day on the strip: the recap, or the plan */}
      {!loading && !isToday && (
        <div className="mt-8">
          <DayView date={selected} onChanged={() => setWeekKey((k) => k + 1)} onNote={flash} />
          <button type="button" onClick={() => setSelected(todayKey())} className="btn-quiet mt-6">
            Back to today
          </button>
        </div>
      )}

      {/* A home day */}
      {!loading && isToday && mode === 'rest' && (
        <div className="mt-8 animate-rise">
          <h1 className="page-title">
            A home <em className="text-brass-ink">day.</em>
          </h1>
          <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-ink/55">No look, no push. The streak stays honest. Change your mind and the stylist is a tap away.</p>
          <div className="action-row mt-6">
            <button type="button" onClick={() => void load({ refresh: true })} className="btn-ghost">
              Dress me after all
            </button>
          </div>
        </div>
      )}

      {/* ---------------- STARTER: empty closet ---------------- */}
      {!loading && isToday && mode === 'starter' && (
        <div className="mt-8">
          <h1 className="page-title animate-rise-1">
            Let&rsquo;s fill <em className="text-brass-ink">your closet.</em>
          </h1>
          <p className="mt-3 max-w-[30rem] animate-rise-2 text-[15px] leading-relaxed text-ink/55">
            Every morning starts with an outfit, composed from what you own and ready to wear.
          </p>
          <div className="action-row mt-6 animate-rise-2">
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

          {/* The four niches of the first brief: the pieces you own hang in theirs; the empty ones ask for what is missing */}
          <div className="mt-12 animate-rise-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5 lg:gap-6">
              {starterSlots(closet).map((slot) =>
                slot.item ? (
                  <div key={slot.key} className="min-w-0">
                    <div className="arch-bezel aspect-[5/6]">
                      <div className="arch-niche flex h-full w-full items-center justify-center">
                        <img src={resolveImageUrl(slot.item.imageUrl)} alt={slot.item.subtype ?? slot.item.category} className="relative z-[1] h-full w-full object-contain p-[7%]" />
                      </div>
                    </div>
                    <p className="mt-2 truncate text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/75">{slot.label} · yours</p>
                  </div>
                ) : (
                  <Link key={slot.key} to="/closet" className="press group min-w-0">
                    {/* an empty niche: the arch drawn in a dashed brass line, waiting */}
                    <div className="aspect-[5/6] w-full">
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-brass/45 bg-surface transition-colors group-hover:border-brass" style={{ borderRadius: '50% 50% var(--arch-foot) var(--arch-foot) / var(--arch-h-5-6) var(--arch-h-5-6) var(--arch-foot) var(--arch-foot)' }}>
                        <span className="font-display text-4xl leading-none text-brass-ink">+</span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">{slot.label}</span>
                      </div>
                    </div>
                    <p className="mt-2 truncate text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-brass-ink">Add {slot.label.toLowerCase()}</p>
                  </Link>
                ),
              )}
            </div>
            <p className="mt-4 text-center font-display text-base italic text-ink/55">{starterLine(closet)}</p>
          </div>

          {error && <Alert className="mt-6 animate-rise">{error}</Alert>}
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
          {error && <Alert className="mt-4">{error}</Alert>}

          <div className="room-split mt-8">
          <div className="min-w-0">
          <div className="max-w-3xl">
            <h1 className="page-title animate-rise-1">
              {worn ? (
                <>
                  Looking good <em className="text-brass-ink">today.</em>
                </>
              ) : brief.occasion ? (
                <>
                  For <em className="text-brass-ink">{brief.occasion.toLowerCase()}.</em>
                </>
              ) : (
                <>
                  {evening ? 'Tonight,' : 'Today,'} <em className="text-brass-ink">wear this.</em>
                </>
              )}
            </h1>

            <p className="mt-3 max-w-2xl animate-rise-2 text-[15px] leading-relaxed text-ink/55">
              {brief.weather && (
                <span className="font-semibold text-brass-ink">
                  {temp(brief.weather.temperatureC)} · {brief.weather.description}
                  {'  ·  '}
                </span>
              )}
              <span className="font-display italic text-ink/70">{brief.rationale}</span>
            </p>
            {data?.weatherNote && (
              <Alert tone="warning" className="mt-4 animate-rise">
                Weather moved · {data.weatherNote}
              </Alert>
            )}
            {data?.plannedAt && !worn && <p className="mt-2 text-xs text-ink/45">Laid out last night.</p>}

            {brief.trip && (
              <p className="mt-4 animate-rise-2 text-xs text-ink/55">
                <span className="font-semibold uppercase tracking-[0.14em] text-brass-ink">Styling from your {brief.trip.destination} capsule</span>
                {' · until '}
                {new Date(`${brief.trip.endDate}T00:00:00`).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            )}
          </div>

          {/* The outfit — arched apertures, with a one-time light-catch sweep */}
          <div key={(data?.wornLook?.items ?? brief.items).map((i) => i.id).join('-')} className="relative mt-8 overflow-hidden">
            <div className="grid-brief animate-rise-3">
              {(data?.wornLook?.items ?? brief.items).map((item) => (
                <GarmentTile
                  key={item.id}
                  imageUrl={item.imageUrl}
                  label={itemLabel(item)}
                  sublabel={itemSublabel(item)}
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
          {data?.wornLook && (
            <div className="mt-6 border-t border-ink/10 pt-4">
              <p className="text-sm text-ink/60">
                <b className="font-semibold text-ink">What you wore, from your photo.</b>{' '}
                {data.wornLook.instead ? 'The stylist had laid out these; they stay on record.' : 'Laid out that morning:'}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {brief.items.map((item) => (
                  <div key={item.id} className="w-16 sm:w-20">
                    <GarmentTile imageUrl={item.imageUrl} label={itemLabel(item)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Primary actions */}
          <div className="action-row mt-6">
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
              <span className="inline-flex h-11 items-center gap-2 rounded-[3px] border border-brass/30 bg-iris-soft px-4 text-sm font-semibold text-brass-ink">
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                  <path d="M2 7l3 3 6-7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Logged for today
              </span>
            )}
            <button type="button" onClick={handleSeeOnYou} className={worn ? 'btn-primary' : 'btn-ghost'}>
              See it on you
            </button>
            {/* Everything that changes the look lives behind one door, so the
                primary act stays the obvious one. */}
            {(() => {
              const canRestyle = !isRefinement && !worn
              const canUndo = !!data?.canUndo && !worn
              const canWoreElse = !isRefinement && !data?.wornLook
              const busyRestyle = busy === 'another'
              if (!canRestyle && !canUndo && !canWoreElse) return null
              return (
                <MoreMenu
                  align="left"
                  up
                  label="Change today’s look"
                  trigger={
                    <span className="btn-quiet">
                      {busyRestyle ? (
                        <><Spinner className="mr-2 h-4 w-4" /> Restyling…</>
                      ) : (
                        <>
                          Change
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="ml-1.5 text-ink/40">
                            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </>
                      )}
                    </span>
                  }
                >
                  {canRestyle && <MenuItem onClick={() => void load({ refresh: true })}>Restyle it</MenuItem>}
                  {canUndo && <MenuItem onClick={() => void goBack()}>Back to the first</MenuItem>}
                  {canWoreElse && <MenuItem onClick={() => setPhotoOpen(true)}>I wore something else</MenuItem>}
                </MoreMenu>
              )
            })()}
          </div>

          <Modal open={photoOpen} onClose={() => setPhotoOpen(false)} title="What you wore">
            {photoOpen && (
              <WorePhotoPanel
                date={todayKey()}
                eventType={brief.eventType as Parameters<typeof WorePhotoPanel>[0]['eventType']}
                alreadyLogged={worn}
                hasSuggestion
                onLogged={(r) => {
                  setPhotoOpen(false)
                  setWorn(true)
                  setSharePrompt('hidden')
                  flash(r.added.length ? `Logged. ${r.added.length} new ${r.added.length === 1 ? 'piece is' : 'pieces are'} joining the closet.` : 'Logged what you wore.')
                  void load()
                  getRitualStats().then(setStats).catch(() => undefined)
                }}
              />
            )}
          </Modal>

          {/* The kind of day, in one line; the chips only when asked for */}
          {!worn && (
            <div className="mt-10 border-t border-ink/10 pt-6">
              {/* One sentence, with the question as part of it — never a button orphaned on its own line. */}
              <p className="text-sm text-ink/60">
                Composed for <b className="font-semibold text-ink">{brief.occasion ? brief.occasion.toLowerCase() : `a ${EVENT_WORD[brief.eventType] ?? brief.eventType} day`}</b>
                {brief.weather ? `, ${temp(brief.weather.temperatureC)} and ${brief.weather.description}` : ''}, from what’s clean in your closet.{' '}
                <button type="button" onClick={() => setDayOpen((v) => !v)} className="press font-semibold text-brass-ink underline-offset-4 hover:underline">
                  {dayOpen ? 'Keep it' : 'Not that kind of day?'}
                </button>
              </p>
              {dayOpen && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['work', 'Work'],
                      ['casual', 'Weekend'],
                      ['evening', 'Evening'],
                      ['occasion', 'Occasion'],
                      ['athletic', 'Training'],
                    ] as const
                  ).map(([k, l]) => (
                    <Chip key={k} disabled={busy !== null} onClick={() => void load({ eventType: k })} on={brief.eventType === k && !brief.occasion}>
                      {l}
                    </Chip>
                  ))}
                </div>
              )}
              {/* Ask the stylist: a sentence in, an outfit from your closet out */}
              <form onSubmit={handleOccasionSubmit} className="mt-4 flex max-w-2xl gap-2">
                <label htmlFor="ask-stylist" className="sr-only">
                  Dress me for
                </label>
                <input id="ask-stylist" value={occasionText} onChange={(e) => setOccasionText(e.target.value)} className="field" placeholder="Dress me for… a client lunch, a first date, a long flight" />
                <button type="submit" disabled={busy !== null || !occasionText.trim()} className="btn-ghost">
                  {busy === 'occasion' ? 'Composing…' : 'Compose'}
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

          {/* The rest of the day — a timeline of looks, each its own wear.
              The first look is the main brief above; these are the later acts. */}
          {(data?.looks ?? []).slice(1).map((look) => (
            <LookAct key={look.id} look={look} date={todayKey()} onReload={() => load()} onNote={flash} />
          ))}
          {data && <AddLook date={todayKey()} onReload={() => load()} onNote={flash} />}

          {/* Act three: tomorrow, laid out tonight */}
          {hour >= 20 && (
            <div className="mt-10 border-t border-ink/10 pt-6">
              <DayView date={shiftKey(todayKey(), 1)} laidOut onChanged={() => setWeekKey((k) => k + 1)} onNote={flash} />
            </div>
          )}
          </div>

          {/* Right rail on desktop: the payoff and the dial, beside the look */}
          <aside className="mt-10 md:grid md:grid-cols-2 md:gap-6 lg:mt-0 lg:block lg:self-start">
          {/* Why this — the brief's reasoning as skimmable facts, not a paragraph. */}
          <div className="mb-6 animate-rise md:col-span-2">
            <SectionHead title="Why this" />
            <div className="card px-4">
              {([
                brief.weather && ['The weather', `${temp(brief.weather.temperatureC)} · ${brief.weather.description}`],
                ['The day', brief.occasion ?? EVENT_LABEL[brief.eventType] ?? brief.eventType],
                ['The closet', `All ${spellCount(brief.items.length)}, clean`],
                data?.lastWorn && ['Last worn', `The ${data.lastWorn.label.toLowerCase()}, ${daysAgoPhrase(data.lastWorn.days)}`],
              ].filter(Boolean) as [string, string][]).map(([k, v], i, arr) => (
                <div
                  key={k}
                  className={`flex items-center justify-between gap-4 py-2.5 ${i < arr.length - 1 ? 'border-b border-ink/10' : ''}`}
                >
                  <span className="flex-none text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">{k}</span>
                  <span className="text-right font-display text-[17px] leading-tight text-ink">{v}</span>
                </div>
              ))}
            </div>
            {/* The stylist's verdict: the rules the look bends or breaks, under the facts. */}
            <VerdictNotes verdict={brief.verdict} className="mt-4" />
          </div>
          {/* The ROI plaque — the proud payoff */}
          {stats && stats.monthlyPayback > 0 && (
            <Plaque className="animate-rise md:col-span-2" label="Your closet is working" value={money(stats.monthlyPayback)} note="this month">
              <div className="mt-4 flex gap-6 border-t border-ink/10 pt-4">
                <Stat value={`${stats.rotationPct}%`} label="In rotation" />
                <Stat value={stats.outfitsThisWeek} label="This week" />
                <Stat value={stats.streak} label="Day streak" />
              </div>
            </Plaque>
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
            <div className="mb-6 flex items-center gap-4">
              <div className="w-20 shrink-0">
                <GarmentTile imageUrl={reconsider.imageUrl} />
              </div>
              <p className="text-sm text-ink/60">
                Swap it for another piece. Or tell the stylist what&rsquo;s off, and
                it&rsquo;ll learn.
              </p>
            </div>

            {/* Train the stylist */}
            <p className="label">Tell the stylist</p>
            {fbNote ? (
              <Alert tone="success" className="mb-6">
                {fbNote}
              </Alert>
            ) : (
              <div className="mb-6 flex flex-wrap gap-2">
                {FEEDBACK.map((f) => (
                  <Chip key={f.signal} disabled={busy === 'feedback'} onClick={() => void handleFeedback(f.signal)}>
                    {f.label}
                  </Chip>
                ))}
              </div>
            )}

            {/* Swap */}
            <p className="label">Swap it</p>
            {alternatives === null && <ArchSkeleton count={3} className="grid grid-cols-3 gap-3" />}
            {alternatives !== null && alternatives.length === 0 && (
              <EmptyState
                line={`No other ${reconsider.category} pieces are free right now.`}
                action={
                  <Link to="/closet" className="btn-ghost btn-sm">
                    Add to the closet
                  </Link>
                }
              />
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
            {busy === 'swap' && <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-brass-ink">swapping</p>}
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
      onDone("Shared. Your circle can see today’s look.")
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
    <div className="card mt-6 max-w-xl animate-rise p-4">
      <p className="eyebrow">Share today’s look?</p>
      <p className="mt-2 text-sm text-ink/70">Your circle sees the pieces. Add yourself to it if you like.</p>
      <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={(e) => void onFile(e)} className="hidden" />
      <div className="action-row mt-4">
        <button type="button" disabled={busy !== null} onClick={() => void sharePieces()} className="btn-primary btn-sm">
          {busy === 'pieces' ? 'Sharing…' : 'Share the pieces'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => fileRef.current?.click()} className="btn-ghost btn-sm">
          {busy === 'photo' ? 'Uploading…' : 'With a photo of me'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void viaMirror()} className="btn-quiet btn-quiet-sm">
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
          className="btn-quiet btn-quiet-sm"
        >
          {busy === 'elsewhere' ? 'Preparing…' : 'Share elsewhere'}
        </button>
        <button type="button" onClick={onDismiss} className="btn-quiet btn-quiet-sm ml-auto">
          Not now
        </button>
      </div>
    </div>
  )
}
