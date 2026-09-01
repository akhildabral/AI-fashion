import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { Link, useNavigate } from 'react-router-dom'
import {
  getExplore,
  getFeed,
  recreateFromCloset,
  toggleFeature,
  type ExploreCard,
  type FeedCard,
  type RecreateResponse,
} from '../lib/brief'
import {
  getNetwork,
  getPicks,
  getSocialMe,
  getStyleTwins,
  searchUsers,
  setHandle,
  dismissPick,
  type FriendPick,
  type NetworkEntry,
  type SocialMe,
  type StyleTwin,
} from '../lib/social'
import { logWear } from '../lib/wearlog'
import { resolveImageUrl, apiFetch } from '../lib/api'
import { Arch, Modal, PageShell } from '../components/ui'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../context/useAuth'

// The Circle — a salon where friends style friends. One room: the feed lives
// centre-stage, the people who make it live in the same page (no second tap).
// Verdicts (the polls friends run on each other) are the emotional core, so
// they get the hero treatment — twin arches, the chosen side lit.

interface CardItem {
  id: string
  imageUrl: string
  subtype: string | null
  category: string
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days > 14) return ''
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `${hours}h ago`
  return 'just now'
}

/** A garment in its lit niche — the app's one way to show a piece. */
function MiniArch({ url, alt, className = 'w-14' }: { url: string; alt: string; className?: string }) {
  return (
    <Arch aspect="aspect-[4/5]" className={className}>
      <img
        src={resolveImageUrl(url)}
        alt={alt}
        loading="lazy"
        className="relative z-[1] h-full w-full object-contain p-[10%]"
      />
    </Arch>
  )
}

/** An engraved eyebrow above a card — the plate that names the moment. */
function CardLabel({ children, tone = 'brass' }: { children: ReactNode; tone?: 'brass' | 'ink' }) {
  return (
    <p
      className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
        tone === 'brass' ? 'text-brass' : 'text-ink/45'
      }`}
    >
      {children}
    </p>
  )
}

function Handle({ handle }: { handle: string | null | undefined }) {
  if (!handle) return <span className="font-semibold text-ink">someone</span>
  return (
    <Link to={`/u/${handle}`} className="font-semibold text-ink underline-offset-2 hover:text-brass hover:underline">
      @{handle}
    </Link>
  )
}

export function CirclePage() {
  usePageTitle('Circle')
  const navigate = useNavigate()
  const { user } = useAuth()

  const [lens, setLens] = useState<'salon' | 'gallery'>('salon')
  const [me, setMe] = useState<SocialMe | null>(null)
  const [network, setNetwork] = useState<{ following: NetworkEntry[]; followers: NetworkEntry[] } | null>(null)
  const [twins, setTwins] = useState<StyleTwin[]>([])
  const [picks, setPicks] = useState<FriendPick[] | null>(null)
  const [cards, setCards] = useState<FeedCard[] | null>(null)
  const [explore, setExplore] = useState<ExploreCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ handle: string }[]>([])

  const [recreate, setRecreate] = useState<{ handle: string; result: RecreateResponse | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  function flash(msg: string) {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    void getSocialMe().then(setMe).catch(() => setMe({ handle: null, followers: 0, following: 0, picks: 0 }))
    void getNetwork().then(setNetwork).catch(() => null)
    void getStyleTwins().then(({ twins: t }) => setTwins(t ?? [])).catch(() => setTwins([]))
    void getPicks().then(({ picks: p }) => setPicks(p ?? [])).catch(() => setPicks([]))
    getFeed()
      .then((r) => setCards(r.cards))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your circle.'))
    getExplore().then((r) => setExplore(r.cards)).catch(() => setExplore([]))
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const timer = window.setTimeout(() => {
      void searchUsers(q).then(({ users }) => setResults(users ?? [])).catch(() => setResults([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  function openRecreate(handle: string, itemIds: string[]) {
    setRecreate({ handle, result: null })
    recreateFromCloset(itemIds)
      .then((result) => setRecreate({ handle, result }))
      .catch((err) => {
        setRecreate(null)
        flash(err instanceof Error ? err.message : 'Could not recreate that look.')
      })
  }

  async function saveRecreated() {
    const ids = recreate?.result?.pairs.map((p) => p.match.id) ?? []
    if (ids.length === 0) return
    setSaving(true)
    try {
      await apiFetch('/outfits', {
        method: 'POST',
        body: {
          itemIds: ids,
          provenance: 'copied',
          rationale: `Recreated from @${recreate?.handle}'s outfit of the day`,
        },
      })
      flash('Saved to your outfits.')
      setRecreate(null)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleFeature(card: ExploreCard) {
    try {
      const { featured } = await toggleFeature(card.wearLogId)
      setExplore((prev) =>
        prev ? prev.map((e) => (e.wearLogId === card.wearLogId ? { ...e, featured } : e)) : prev,
      )
    } catch {
      flash('Could not update that.')
    }
  }

  // Picks are actionable "styled for you" cards; the raw feed also carries a
  // pick_received type, so we render picks from the inbox and drop that feed
  // type to avoid showing the same look twice.
  const feed = (cards ?? []).filter((c) => c.type !== 'pick_received')
  const loadingSalon = cards === null && picks === null && !error
  const salonEmpty =
    !loadingSalon && !error && feed.length === 0 && (picks?.length ?? 0) === 0

  return (
    <PageShell>
      {/* ---- The mantel: name, then who you are in the room ---- */}
      <header className="border-b border-ink/10 pb-6">
        <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">
          The Circle
        </p>
        <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium text-ink sm:text-6xl">
          Circle
        </h1>
        <p className="mt-2 max-w-xl animate-rise-1 text-sm text-ink/55">
          Friends styling friends — looks to recreate, verdicts to weigh in on, and the people
          whose taste you trust.
        </p>

        {me && <Identity me={me} onSet={(h) => setMe({ ...me, handle: h })} />}
      </header>

      {/* ---- Find people (folded in, not a separate page) ---- */}
      {me?.handle && (
        <section className="mt-6 animate-rise-1">
          <label htmlFor="circle-search" className="sr-only">
            Find people by handle
          </label>
          <div className="relative max-w-md">
            <svg
              aria-hidden
              width="15"
              height="15"
              viewBox="0 0 15 15"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
            >
              <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              id="circle-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field !pl-9"
              placeholder="Find people by handle…"
            />
          </div>
          {results.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {results.map((u) => (
                <Link key={u.handle} to={`/u/${u.handle}`} className="chip">
                  @{u.handle}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---- Lens: the living salon vs the wider gallery ---- */}
      <div
        role="tablist"
        aria-label="Circle view"
        className="mt-8 inline-flex animate-rise-1 rounded-[3px] border border-ink/15 bg-surface p-1"
      >
        {(['salon', 'gallery'] as const).map((key) => {
          const active = lens === key
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setLens(key)}
              className={`rounded-[2px] px-5 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-iris text-[rgb(26_21_9)]' : 'text-ink/55 hover:text-ink'
              }`}
            >
              {key === 'salon' ? 'The Salon' : `Gallery${explore ? ` · ${explore.length}` : ''}`}
            </button>
          )
        })}
      </div>

      {/* ================= THE SALON ================= */}
      {lens === 'salon' && (
        <div className="mt-8">
          {loadingSalon && (
            <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          {error && <p className="alert-error">{error}</p>}

          {salonEmpty && (
            <div className="rounded-[3px] border border-dashed border-ink/20 py-16 text-center">
              <p className="font-display text-2xl font-medium text-ink">The salon is quiet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">
                Follow someone whose taste you trust — their looks, verdicts, and picks for you
                will gather here.
              </p>
            </div>
          )}

          {!loadingSalon && !error && (
            <div className="grid animate-rise-2 gap-4 sm:grid-cols-2">
              {/* Picks made for you — the warmest thing in the room, first */}
              {(picks ?? []).map((pick) => (
                <PickCard
                  key={`pick-${pick.id}`}
                  pick={pick}
                  onRecreate={() => openRecreate(pick.byHandle ?? '', pick.items.map((i) => i.id))}
                  onGone={(id) => setPicks((prev) => prev?.filter((p) => p.id !== id) ?? prev)}
                  onError={flash}
                />
              ))}

              {feed.map((card, i) => (
                <FeedCardView key={`feed-${i}`} card={card} onRecreate={openRecreate} isAdmin={user?.role === 'admin'} />
              ))}
            </div>
          )}

          {/* People — the room's members, in the same page */}
          <People network={network} twins={twins} />
        </div>
      )}

      {/* ================= THE GALLERY ================= */}
      {lens === 'gallery' && (
        <div className="mt-8">
          {explore === null && (
            <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          {explore !== null && explore.length === 0 && (
            <div className="rounded-[3px] border border-dashed border-ink/20 py-16 text-center">
              <p className="font-display text-2xl font-medium text-ink">Nothing hung yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">
                When people share their outfit of the day, the finest land here — recreate any of
                them from your own closet.
              </p>
            </div>
          )}
          {explore !== null && explore.length > 0 && (
            <div className="grid animate-rise gap-4 sm:grid-cols-2">
              {explore.map((card) => (
                <div
                  key={card.wearLogId}
                  className={`card p-5 ${card.featured ? '!border-brass/45' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <CardLabel>{card.featured ? 'Featured' : 'Outfit of the day'}</CardLabel>
                    <span className="text-xs text-ink/40">{timeAgo(card.at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink/80">
                    <Handle handle={card.handle} /> wore this
                    {card.eventType ? (
                      <span className="font-display italic text-ink/60"> — {card.eventType}</span>
                    ) : null}
                  </p>
                  {card.items.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.items.slice(0, 5).map((it) => (
                        <MiniArch key={it.id} url={it.imageUrl} alt={it.subtype ?? it.category} />
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openRecreate(String(card.handle), card.items.map((it) => it.id))}
                      className="btn-ghost !px-4 !py-2 !text-xs"
                    >
                      Recreate from my closet
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => void handleFeature(card)}
                        className={`btn-ghost !px-3 !py-2 !text-xs ${card.featured ? '!border-brass !text-brass' : ''}`}
                      >
                        {card.featured ? 'Unfeature' : 'Feature'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-[3px] border border-brass/30 bg-surface px-5 py-3 text-sm font-medium text-ink shadow-float">
          {toast}
        </div>
      )}

      <Modal
        open={recreate !== null}
        onClose={() => setRecreate(null)}
        title={recreate ? `In your closet, @${recreate.handle}'s look` : 'Recreate'}
      >
        {recreate && recreate.result === null && (
          <div className="flex justify-center py-10 text-ink/50">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {recreate?.result && (
          <>
            {recreate.result.pairs.length > 0 ? (
              <div className="space-y-3">
                {recreate.result.pairs.map((p) => (
                  <div key={p.source.id} className="flex items-center gap-3">
                    <MiniArch url={p.source.imageUrl} alt={p.source.label} className="w-16" />
                    <span className="text-ink/35">→</span>
                    <MiniArch url={p.match.imageUrl} alt={p.match.label} className="w-16" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium capitalize text-ink">{p.match.label}</p>
                      <p className="text-xs text-ink/45">your {p.match.label} for their {p.source.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-[3px] border border-dashed border-ink/20 p-4 text-sm text-ink/55">
                Nothing in your closet matches this look yet
                {recreate.result.closetSize === 0 ? ' — it looks empty. Add some pieces first.' : '.'}
              </p>
            )}
            {recreate.result.missing.length > 0 && (
              <div className="mt-4 rounded-[3px] border border-brass/25 bg-iris-soft/50 p-4">
                <CardLabel>To complete the look</CardLabel>
                <ul className="mt-2 space-y-1 text-sm text-ink/70">
                  {recreate.result.missing.map((m) => (
                    <li key={m.source.id}>· {m.wanted || m.source.label} — not in your closet yet</li>
                  ))}
                </ul>
              </div>
            )}
            {recreate.result.pairs.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/mirror?items=${recreate.result!.pairs.map((p) => p.match.id).join(',')}`)}
                  className="btn-primary !px-4 !py-2 !text-sm"
                >
                  See it on you
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveRecreated()}
                  className="btn-ghost !px-4 !py-2 !text-sm"
                >
                  {saving ? 'Saving…' : 'Save as outfit'}
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
    </PageShell>
  )
}

/* ---- Identity: handle claim folds into the mantel, not a separate card ---- */
function Identity({ me, onSet }: { me: SocialMe; onSet: (h: string) => void }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { user } = await setHandle(value)
      onSet(user.handle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set that handle.')
    } finally {
      setSaving(false)
    }
  }

  if (me.handle) {
    return (
      <p className="mt-4 text-sm text-ink/55">
        You are <span className="font-semibold text-ink">@{me.handle}</span>
        <span className="mx-2 text-ink/25">·</span>
        {me.followers} follower{me.followers === 1 ? '' : 's'}
        <span className="mx-2 text-ink/25">·</span>
        following {me.following}
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-md">
      <p className="mb-2 text-sm text-ink/60">Claim your handle — it's how friends find and follow you.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-1 rounded-[3px] border border-ink/15 bg-surface px-3 focus-within:border-iris/70 focus-within:ring-2 focus-within:ring-iris/20">
          <span className="text-ink/40">@</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border-0 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-ink/35"
            placeholder="your_handle"
            minLength={3}
            maxLength={20}
            required
          />
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Claim it'}
        </button>
      </div>
      {error && <p className="mt-2 alert-error">{error}</p>}
    </form>
  )
}

/* ---- A pick made for you: recreate, or mark it worn ---- */
function PickCard({
  pick,
  onRecreate,
  onGone,
  onError,
}: {
  pick: FriendPick
  onRecreate: () => void
  onGone: (id: string) => void
  onError: (msg: string) => void
}) {
  const [logged, setLogged] = useState(false)
  return (
    <div className="card !border-brass/30 bg-iris-soft/40 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <CardLabel>Styled for you</CardLabel>
        <span className="text-xs text-ink/40">{timeAgo(pick.createdAt)}</span>
      </div>
      <p className="mt-1.5 text-sm text-ink/80">
        <Handle handle={pick.byHandle} /> picked a look for you
      </p>
      {pick.note && <p className="mt-1 font-display text-sm italic text-ink/65">“{pick.note}”</p>}
      {pick.items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pick.items.slice(0, 5).map((it) => (
            <MiniArch key={it.id} url={it.imageUrl} alt={it.subtype ?? it.category} />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={logged || pick.items.length === 0}
          onClick={() =>
            void logWear({ itemIds: pick.items.map((i) => i.id) })
              .then(() => setLogged(true))
              .catch(() => onError('Could not log the wear — try again.'))
          }
          className={logged ? 'btn-ghost !border-brass/50 !text-brass' : 'btn-primary !px-4 !py-2 !text-xs'}
        >
          {logged ? 'Worn ✓' : 'I wore it'}
        </button>
        <button type="button" onClick={onRecreate} className="btn-ghost !px-4 !py-2 !text-xs">
          Recreate
        </button>
        <button
          type="button"
          onClick={() =>
            void dismissPick(pick.id)
              .then(() => onGone(pick.id))
              .catch(() => onError('Could not dismiss that — try again.'))
          }
          className="press ml-auto text-xs text-ink/35 transition-colors hover:text-ink/60"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

/* ---- One feed card, dispatched by type ---- */
function FeedCardView({
  card,
  onRecreate,
}: {
  card: FeedCard
  onRecreate: (handle: string, itemIds: string[]) => void
  isAdmin: boolean
}) {
  const ago = timeAgo(String(card.at))

  if (card.type === 'poll_result' || card.type === 'poll_open') {
    return <VerdictCard card={card} ago={ago} />
  }

  if (card.type === 'ootd') {
    const items = (card.items as CardItem[] | undefined) ?? []
    return (
      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-2">
          <CardLabel>Outfit of the day</CardLabel>
          <span className="text-xs text-ink/40">{ago}</span>
        </div>
        <p className="mt-1.5 text-sm text-ink/80">
          <Handle handle={card.handle as string} /> wore this today
          {card.eventType ? (
            <span className="font-display italic text-ink/60"> — {String(card.eventType)}</span>
          ) : null}
        </p>
        {items.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {items.slice(0, 5).map((it) => (
              <MiniArch key={it.id} url={it.imageUrl} alt={it.subtype ?? it.category} />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => onRecreate(String(card.handle), items.map((it) => it.id))}
          className="btn-ghost mt-4 !px-4 !py-2 !text-xs"
        >
          Recreate from my closet
        </button>
      </div>
    )
  }

  if (card.type === 'new_follower') {
    return (
      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-2">
          <CardLabel>New follower</CardLabel>
          <span className="text-xs text-ink/40">{ago}</span>
        </div>
        <p className="mt-1.5 text-sm text-ink/80">
          <Handle handle={card.handle as string} /> started following your closet.
        </p>
      </div>
    )
  }

  // style_a_friend
  const handles = (card.handles as string[] | undefined) ?? []
  return (
    <div className="card !border-brass/25 bg-iris-soft/40 p-5">
      <CardLabel>Be someone's stylist</CardLabel>
      <p className="mt-1.5 text-sm text-ink/80">
        Browse a friend's closet and compose a look for them — when they wear it, it counts.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {handles.map((h) => (
          <Link key={h} to={`/u/${h}`} className="chip">
            @{h}
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ---- The verdict: a friend's poll on two looks, the chosen side lit ---- */
function VerdictCard({ card, ago }: { card: FeedCard; ago: string }) {
  const counts = (card.counts as Record<string, number> | undefined) ?? {}
  const options = (card.options as { id: string; imageUrl: string }[] | undefined) ?? []
  const total = Number(card.totalVotes ?? 0)
  const settled = card.type === 'poll_result'
  const leader = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="card p-5 sm:col-span-2">
      <div className="flex items-baseline justify-between gap-2">
        <CardLabel>{settled ? 'Verdict is in' : 'A verdict is open'}</CardLabel>
        <span className="text-xs text-ink/40">{ago}</span>
      </div>
      <p className="mt-1.5 font-display text-lg font-medium text-ink">{String(card.question)}</p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        {options.slice(0, 3).map((o) => {
          const won = settled && leader && leader[0] === o.id
          const n = counts[o.id] ?? 0
          const share = total > 0 ? Math.round((n / total) * 100) : 0
          return (
            <div key={o.id} className="w-24">
              <Arch aspect="aspect-[4/5]" bright={!!won}>
                <img
                  src={resolveImageUrl(o.imageUrl)}
                  alt={`Option ${o.id.toUpperCase()}`}
                  className="relative z-[1] h-full w-full object-cover"
                />
              </Arch>
              <div className="mt-2 flex items-baseline justify-between px-0.5">
                <span className={`text-xs font-semibold ${won ? 'text-brass' : 'text-ink/55'}`}>
                  {o.id.toUpperCase()}
                  {won ? ' · won' : ''}
                </span>
                <span className="font-display text-sm text-ink [font-variant-numeric:tabular-nums]">{share}%</span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-ink/50">
        {total} vote{total === 1 ? '' : 's'}
        {settled ? ' · settled' : ' · still open'}
      </p>
    </div>
  )
}

/* ---- People: the room's members, folded into the salon ---- */
function People({
  network,
  twins,
}: {
  network: { following: NetworkEntry[]; followers: NetworkEntry[] } | null
  twins: StyleTwin[]
}) {
  const hasNetwork = network && (network.following.length > 0 || network.followers.length > 0)
  if (!hasNetwork && twins.length === 0) return null

  return (
    <section className="mt-14 border-t border-ink/10 pt-8">
      <h2 className="font-display text-2xl font-medium text-ink">Your people</h2>

      {twins.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">Kindred taste</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {twins.map((twin) => (
              <Link
                key={twin.handle}
                to={`/u/${twin.handle}`}
                className="card card-hover flex items-center justify-between p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">@{twin.handle}</p>
                  {twin.sharedTaste.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-ink/55">You both: {twin.sharedTaste.join(' · ')}</p>
                  )}
                </div>
                {!twin.isFollowing && <span className="shrink-0 text-xs text-brass">Follow →</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasNetwork && (
        <div className="mt-6 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
              Following · {network!.following.length}
            </p>
            <div className="flex flex-wrap gap-2">
              {network!.following.map((u) => (
                <Link key={u.handle} to={`/u/${u.handle}`} className="chip">
                  @{u.handle} {u.isFriend ? '· friends' : ''}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
              Followers · {network!.followers.length}
            </p>
            <div className="flex flex-wrap gap-2">
              {network!.followers.map((u) => (
                <Link key={u.handle} to={`/u/${u.handle}`} className="chip">
                  @{u.handle} {u.isFriend ? '· friends' : ''}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
