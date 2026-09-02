import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { useAuth } from '../context/useAuth'
import { Arch, Modal, PageShell, Toast, useFlash } from '../components/ui'
import { Spinner } from '../components/Spinner'
import { Initials, PeopleDrawer, type PeopleTab } from '../components/PeopleDrawer'
import { recreateFromCloset, type RecreateResponse } from '../lib/brief'
import { dismissPick, followUser, getSocialMe, getStyleTwins, setHandle, type SocialMe, type StyleTwin } from '../lib/social'
import { logWear } from '../lib/wearlog'
import {
  getCircleExplore,
  getCircleFeed,
  getCircleToday,
  reactToLook,
  timeAgo,
  timeLeft,
  unreactToLook,
  voteOnVerdict,
  type CirclePost,
  type Lens,
  type LookPost,
  type PickPost,
  type PostItem,
  type ReactionKind,
  type VerdictPost,
} from '../lib/circle'

// The Circle — a salon where friends dress each other. One ranked column
// of posts; a rail of who wore what today; the people who make it live in
// a drawer and the things that happened to you behind the bell. Every post
// asks something of you: recreate it, vote it, wear it.

/* ---------- small atoms ---------- */

function Handle({ handle, className = '' }: { handle: string | null; className?: string }) {
  if (!handle) return <span className={`font-semibold text-ink ${className}`}>someone</span>
  return (
    <Link to={`/u/${handle}`} className={`font-semibold text-ink underline-offset-2 hover:text-brass hover:underline ${className}`}>
      @{handle}
    </Link>
  )
}

function Plate({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">{children}</p>
}

function PostHeader({
  handle,
  meta,
  plate,
}: {
  handle: string | null
  meta: ReactNode
  plate?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4">
      <Link to={handle ? `/u/${handle}` : '#'} className="press">
        <Initials handle={handle} className="h-9 w-9" />
      </Link>
      <div className="min-w-0 flex-1">
        <Handle handle={handle} className="text-sm" />
        <p className="truncate text-xs text-ink/45">{meta}</p>
      </div>
      {plate && <div className="shrink-0">{plate}</div>}
    </div>
  )
}

function GarmentThumb({ item, className = 'w-14' }: { item: PostItem; className?: string }) {
  return (
    <Arch aspect="aspect-[4/5]" className={className}>
      <img
        src={resolveImageUrl(item.imageUrl)}
        alt={item.subtype ?? item.category}
        loading="lazy"
        className="relative z-[1] h-full w-full object-contain p-[10%]"
      />
    </Arch>
  )
}

/** The look, spotlit: up to four garments side by side in one wide vitrine. */
function LookHero({ items }: { items: PostItem[] }) {
  const shown = items.slice(0, 4)
  if (shown.length === 0) return null
  return (
    <div className="mx-4 mt-3">
      <Arch aspect="aspect-[4/3]" className="w-full">
        <div className="relative z-[1] flex h-full w-full items-center justify-center gap-[3%] px-[6%] py-[9%]">
          {shown.map((it) => (
            <img
              key={it.id}
              src={resolveImageUrl(it.imageUrl)}
              alt={it.subtype ?? it.category}
              loading="lazy"
              className="h-full min-w-0 flex-1 object-contain"
            />
          ))}
        </div>
      </Arch>
    </div>
  )
}

const REACTIONS: { kind: ReactionKind; label: string; icon: ReactNode }[] = [
  {
    kind: 'would_wear',
    label: 'Would wear',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
      </svg>
    ),
  },
  {
    kind: 'bold',
    label: 'Bold',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
      </svg>
    ),
  },
]

function reactionLine(p: LookPost): string | null {
  const { total, sample, mine } = p.reactions
  if (total === 0) return null
  const others = total - (mine ? 1 : 0)
  const names = sample.map((h) => `@${h}`)
  const parts: string[] = []
  if (mine) parts.push('You')
  parts.push(...names.slice(0, 2))
  const rest = others - Math.min(2, names.length)
  let s = parts.join(', ')
  if (rest > 0) s += ` and ${rest} other${rest === 1 ? '' : 's'}`
  return `${s} would wear this`
}

/* ---------- cards ---------- */

function LookCard({
  post,
  onReact,
  onRecreate,
}: {
  post: LookPost
  onReact: (id: string, kind: ReactionKind | null) => Promise<void>
  onRecreate: (handle: string | null, items: PostItem[]) => void
}) {
  const line = reactionLine(post)
  return (
    <article className={`card overflow-hidden ${post.featured ? '!border-brass/45' : ''}`}>
      <PostHeader
        handle={post.handle}
        meta={
          <>
            Outfit of the day{post.eventType ? ` · ${post.eventType}` : ''} · {timeAgo(post.at)}
          </>
        }
        plate={post.featured ? <Plate>Featured</Plate> : undefined}
      />
      <LookHero items={post.items} />
      {line && <p className="px-4 pt-3 text-xs text-ink/50">{line}</p>}
      <div className="mt-3 flex items-center gap-1 border-t border-ink/10 px-3 py-2.5">
        {!post.isMine &&
          REACTIONS.map((r) => {
            const on = post.reactions.mine === r.kind
            return (
              <button
                key={r.kind}
                type="button"
                aria-pressed={on}
                onClick={() => void onReact(post.id, on ? null : r.kind)}
                className={`press inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  on ? 'text-brass' : 'text-ink/55 hover:text-ink'
                }`}
              >
                {r.icon}
                {r.label}
                {post.reactions.counts[r.kind] ? (
                  <span className="text-ink/40 [font-variant-numeric:tabular-nums]">{post.reactions.counts[r.kind]}</span>
                ) : null}
              </button>
            )
          })}
        {!post.isMine && post.items.length > 0 && (
          <button
            type="button"
            onClick={() => onRecreate(post.handle, post.items)}
            className="btn-primary ml-auto !px-4 !py-2 !text-xs"
          >
            Recreate
          </button>
        )}
        {post.isMine && <p className="px-1 text-xs text-ink/45">Your look, shared to the circle.</p>}
      </div>
    </article>
  )
}

function VerdictCard({
  post,
  onVote,
}: {
  post: VerdictPost
  onVote: (pollId: string, optionId: string) => Promise<void>
}) {
  const [voting, setVoting] = useState<string | null>(null)
  const canVote = !post.settled && !post.isMine && !post.myVote
  const counts = post.counts
  const leader = counts ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] : null

  return (
    <article className="card overflow-hidden">
      <PostHeader
        handle={post.handle}
        meta={
          post.isMine
            ? `Your verdict · ${post.settled ? 'settled' : timeLeft(post.expiresAt)}`
            : `needs a verdict · ${post.settled ? 'settled' : timeLeft(post.expiresAt)}`
        }
        plate={<Plate>{post.settled ? 'Verdict is in' : 'Verdict'}</Plate>}
      />
      <p className="mt-2 px-4 font-display text-lg font-medium text-ink">{post.question}</p>

      <div className="mt-3 flex items-start gap-3 px-4">
        {post.options.slice(0, 3).map((o) => {
          const won = Boolean(post.settled && leader && leader === o.id)
          const chosen = post.myVote === o.id
          const n = counts?.[o.id] ?? 0
          const share = counts && post.totalVotes > 0 ? Math.round((n / post.totalVotes) * 100) : null
          const inner = (
            <>
              <Arch aspect="aspect-[3/4]" bright={won || chosen}>
                <img
                  src={resolveImageUrl(o.imageUrl)}
                  alt={`Option ${o.id.toUpperCase()}`}
                  loading="lazy"
                  className="relative z-[1] h-full w-full object-cover"
                />
              </Arch>
              {counts ? (
                <>
                  <div className="mt-2 h-1 overflow-hidden rounded-[2px] bg-ink/10">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--c-brass-lo)] to-[var(--c-brass-hi)] transition-[width] duration-700"
                      style={{ width: `${share ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between px-0.5">
                    <span className={`text-[11px] font-semibold ${won || chosen ? 'text-brass' : 'text-ink/50'}`}>
                      {o.id.toUpperCase()}
                      {won ? ' · won' : chosen ? ' · yours' : ''}
                    </span>
                    <span className="font-display text-sm text-ink [font-variant-numeric:tabular-nums]">{share ?? 0}%</span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                  {voting === o.id ? 'Sending…' : o.id.toUpperCase()}
                </p>
              )}
            </>
          )
          return canVote ? (
            <button
              key={o.id}
              type="button"
              disabled={voting !== null}
              onClick={() => {
                setVoting(o.id)
                void onVote(post.id, o.id).finally(() => setVoting(null))
              }}
              className="press flex-1 text-left disabled:opacity-60"
              aria-label={`Vote ${o.id.toUpperCase()}`}
            >
              {inner}
            </button>
          ) : (
            <div key={o.id} className="flex-1">
              {inner}
            </div>
          )
        })}
      </div>

      <p className="px-4 pb-4 pt-3 text-xs text-ink/50">
        {canVote
          ? 'Tap the one they should wear.'
          : post.settled
            ? `${post.totalVotes} vote${post.totalVotes === 1 ? '' : 's'} · settled`
            : `${post.totalVotes} vote${post.totalVotes === 1 ? '' : 's'} so far${post.myVote ? ' · you weighed in' : ''}`}
      </p>
    </article>
  )
}

function PickCard({
  post,
  onGone,
  onError,
}: {
  post: PickPost
  onGone: (id: string) => void
  onError: (msg: string) => void
}) {
  const navigate = useNavigate()
  const [worn, setWorn] = useState(false)
  return (
    <article className="card overflow-hidden !border-brass/35 bg-iris-soft/40">
      <PostHeader handle={post.handle} meta={`styled a look for you · ${timeAgo(post.at)}`} plate={<Plate>For you</Plate>} />
      {post.note && <p className="mt-2 px-4 font-display text-sm italic text-ink/70">“{post.note}”</p>}
      {post.items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 px-4">
          {post.items.slice(0, 5).map((it) => (
            <GarmentThumb key={it.id} item={it} />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brass/20 px-4 py-3">
        <button
          type="button"
          disabled={worn || post.items.length === 0}
          onClick={() =>
            void logWear({ itemIds: post.items.map((i) => i.id), pickId: post.id })
              .then(() => setWorn(true))
              .catch(() => onError('Could not log the wear — try again.'))
          }
          className={worn ? 'btn-ghost !border-brass/50 !px-4 !py-2 !text-xs !text-brass' : 'btn-primary !px-4 !py-2 !text-xs'}
        >
          {worn ? 'Worn — they’ll know' : 'I wore it'}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/mirror?items=${post.items.map((i) => i.id).join(',')}`)}
          className="btn-ghost !px-4 !py-2 !text-xs"
        >
          See it on me
        </button>
        <button
          type="button"
          onClick={() =>
            void dismissPick(post.id)
              .then(() => onGone(post.id))
              .catch(() => onError('Could not dismiss that — try again.'))
          }
          className="press ml-auto text-xs text-ink/40 transition-colors hover:text-ink/70"
        >
          Dismiss
        </button>
      </div>
    </article>
  )
}

/* ---------- the page ---------- */

export function CirclePage() {
  usePageTitle('Circle')
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast, flash } = useFlash()

  const [me, setMe] = useState<SocialMe | null>(null)
  const [twins, setTwins] = useState<StyleTwin[]>([])
  const [today, setToday] = useState<LookPost[] | null>(null)

  const [lens, setLens] = useState<Lens>('foryou')
  const [posts, setPosts] = useState<CirclePost[] | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [circleSize, setCircleSize] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [people, setPeople] = useState<{ open: boolean; tab: PeopleTab }>({ open: false, tab: 'following' })
  const [recreate, setRecreate] = useState<{ handle: string; result: RecreateResponse | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const reqId = useRef(0)

  const loadFeed = useCallback(
    async (which: Lens, offset = 0) => {
      const id = ++reqId.current
      if (offset === 0) {
        setPosts(null)
        setError(null)
      } else setLoadingMore(true)
      try {
        if (which === 'explore') {
          const r = await getCircleExplore()
          if (id !== reqId.current) return
          setPosts(r.posts)
          setNextOffset(null)
        } else {
          const r = await getCircleFeed(which, offset)
          if (id !== reqId.current) return
          setPosts((prev) => (offset === 0 || !prev ? r.posts : [...prev, ...r.posts]))
          setNextOffset(r.nextOffset)
          setCircleSize(r.circleSize)
        }
      } catch (err) {
        if (id !== reqId.current) return
        setError(err instanceof Error ? err.message : 'Could not load your circle.')
        if (offset === 0) setPosts([])
      } finally {
        if (id === reqId.current) setLoadingMore(false)
      }
    },
    [],
  )

  const refreshSide = useCallback(() => {
    void getSocialMe().then(setMe).catch(() => setMe({ handle: null, followers: 0, following: 0, picks: 0 }))
    void getStyleTwins().then(({ twins: t }) => setTwins(t ?? [])).catch(() => setTwins([]))
    void getCircleToday().then((r) => setToday(r.entries)).catch(() => setToday([]))
  }, [])

  useEffect(() => {
    refreshSide()
  }, [refreshSide])

  useEffect(() => {
    void loadFeed(lens)
  }, [lens, loadFeed])

  /* ----- actions ----- */

  async function handleReact(wearLogId: string, kind: ReactionKind | null) {
    try {
      const { reactions } = kind ? await reactToLook(wearLogId, kind) : await unreactToLook(wearLogId)
      const patch = (p: CirclePost) => (p.type === 'look' && p.id === wearLogId ? { ...p, reactions } : p)
      setPosts((prev) => (prev ? prev.map(patch) : prev))
      setToday((prev) => (prev ? prev.map((p) => patch(p) as LookPost) : prev))
    } catch {
      flash('Could not react to that.')
    }
  }

  async function handleVote(pollId: string, optionId: string) {
    if (!user) return
    try {
      await voteOnVerdict(pollId, optionId, user.id)
      // Counts unlock once you've weighed in — pull the fresh post.
      const r = await getCircleFeed(lens === 'following' ? 'following' : 'foryou', 0)
      const fresh = r.posts.find((p) => p.type === 'verdict' && p.id === pollId)
      setPosts((prev) => (prev ? prev.map((p) => (p.type === 'verdict' && p.id === pollId && fresh ? fresh : p)) : prev))
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not vote.')
    }
  }

  function openRecreate(handle: string | null, items: PostItem[]) {
    const h = handle ?? 'them'
    setRecreate({ handle: h, result: null })
    recreateFromCloset(items.map((i) => i.id))
      .then((result) => setRecreate({ handle: h, result }))
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
        body: { itemIds: ids, provenance: 'copied', rationale: `Recreated from @${recreate?.handle}'s outfit of the day` },
      })
      flash('Saved to your outfits.')
      setRecreate(null)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function quickFollow(handle: string) {
    try {
      await followUser(handle)
      setTwins((t) => t.map((x) => (x.handle === handle ? { ...x, isFollowing: true } : x)))
      refreshSide()
      void loadFeed(lens)
      flash(`Following @${handle}.`)
    } catch {
      flash('Could not follow.')
    }
  }

  const openPeople = (tab: PeopleTab) => setPeople({ open: true, tab })
  const feedEmpty = posts !== null && posts.length === 0 && !error
  const mineToday = today?.find((t) => t.isMine) ?? null
  const othersToday = (today ?? []).filter((t) => !t.isMine)

  return (
    <PageShell wide>
      <Toast msg={toast} />

      {/* ---- mantel ---- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">The Circle</p>
          <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium text-ink sm:text-6xl">Circle</h1>
          {me && <Identity me={me} onSet={(h) => setMe({ ...me, handle: h })} onOpenPeople={openPeople} />}
        </div>
      </header>

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        {/* ================= main column ================= */}
        <div className="mx-auto w-full max-w-2xl lg:mx-0">
          {/* ---- today rail ---- */}
          <section aria-label="Today in your circle" className="animate-rise-1">
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
              <Link to="/" className="press w-16 shrink-0 text-center">
                {mineToday && mineToday.items[0] ? (
                  <GarmentThumb item={mineToday.items[0]} className="w-16" />
                ) : (
                  <div className="arch-bezel aspect-[4/5] w-16 opacity-50">
                    <div className="arch-niche flex h-full w-full items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="relative z-[1] text-brass-lo" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </div>
                  </div>
                )}
                <p className="mt-1.5 truncate text-[11px] text-ink/55">{mineToday ? 'Your look' : 'Share yours'}</p>
              </Link>
              {othersToday.map((t) =>
                t.items[0] ? (
                  <Link key={t.id} to={`/u/${t.handle}`} className="press w-16 shrink-0 text-center">
                    <GarmentThumb item={t.items[0]} className="w-16" />
                    <p className="mt-1.5 truncate text-[11px] text-ink/55">@{t.handle}</p>
                  </Link>
                ) : null,
              )}
              {today && othersToday.length === 0 && (
                <p className="self-center pl-2 text-xs text-ink/40">No one in your circle has shared a look today.</p>
              )}
            </div>
          </section>

          {/* ---- compose ---- */}
          <div className="mt-4 grid animate-rise-1 grid-cols-3 gap-2">
            <ComposeButton onClick={() => navigate('/')} label="Share a look" icon={<path d="M3 15l5-4 4 3 4-5 5 5M3 5h18v14H3z" />} />
            <ComposeButton onClick={() => navigate('/mirror')} label="Ask the circle" icon={<path d="M8 3v18M16 3v18M3 6h18v12H3z" />} />
            <ComposeButton onClick={() => openPeople('following')} label="Style a friend" icon={<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>} />
          </div>

          {/* ---- lens ---- */}
          <div role="tablist" aria-label="Feed" className="mt-6 inline-flex animate-rise-1 rounded-[3px] border border-ink/15 bg-surface p-1">
            {(['foryou', 'following', 'explore'] as Lens[]).map((l) => (
              <button
                key={l}
                role="tab"
                type="button"
                aria-selected={lens === l}
                onClick={() => setLens(l)}
                className={`rounded-[2px] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-[background-color,color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/40 ${
                  lens === l ? 'bg-brass text-[rgb(26_21_9)]' : 'text-ink/55 hover:text-ink'
                }`}
              >
                {l === 'foryou' ? 'For you' : l === 'following' ? 'Following' : 'Explore'}
              </button>
            ))}
          </div>

          {/* ---- feed ---- */}
          <div className="mt-5 flex flex-col gap-4">
            {posts === null && (
              <>
                {[0, 1].map((i) => (
                  <div key={i} className="card animate-pulse p-4 opacity-60">
                    <div className="h-9 w-40 rounded-[3px] bg-ink/10" />
                    <div className="arch-bezel mt-3 aspect-[4/3] w-full">
                      <div className="arch-niche h-full w-full" />
                    </div>
                  </div>
                ))}
              </>
            )}
            {error && <p className="alert-error">{error}</p>}
            {feedEmpty && (
              <div className="rounded-[3px] border border-dashed border-ink/20 px-6 py-14 text-center">
                <p className="font-display text-2xl font-medium text-ink">
                  {lens === 'explore' ? 'Nothing hung yet' : 'The salon is quiet'}
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">
                  {lens === 'explore'
                    ? 'When people share their outfit of the day, the finest land here.'
                    : circleSize === 0
                      ? 'Follow someone whose taste you trust — their looks, verdicts and picks for you gather here.'
                      : 'Your circle hasn’t shared anything lately. Share yours to start the conversation.'}
                </p>
                {lens !== 'explore' && circleSize === 0 && (
                  <button type="button" onClick={() => openPeople('find')} className="btn-primary mt-5">
                    Find your people
                  </button>
                )}
              </div>
            )}
            {posts?.map((p) =>
              p.type === 'look' ? (
                <LookCard key={`l-${p.id}`} post={p} onReact={handleReact} onRecreate={openRecreate} />
              ) : p.type === 'verdict' ? (
                <VerdictCard key={`v-${p.id}`} post={p} onVote={handleVote} />
              ) : (
                <PickCard
                  key={`p-${p.id}`}
                  post={p}
                  onGone={(id) => setPosts((prev) => (prev ? prev.filter((x) => !(x.type === 'pick' && x.id === id)) : prev))}
                  onError={flash}
                />
              ),
            )}
            {nextOffset !== null && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadFeed(lens, nextOffset)}
                className="btn-ghost mx-auto mt-2"
              >
                {loadingMore ? 'Loading…' : 'More from your circle'}
              </button>
            )}
          </div>
        </div>

        {/* ================= side rail ================= */}
        <aside className="mt-12 flex flex-col gap-5 lg:sticky lg:top-24 lg:mt-0 lg:self-start">
          <div className="card p-5">
            <p className="font-display text-xl font-medium text-ink">You in the circle</p>
            {me?.handle ? (
              <>
                <div className="mt-4 flex gap-6">
                  <Stat v={me.followers} l="Followers" />
                  <Stat v={me.following} l="Following" />
                  <Stat v={me.picks} l="Styled for you" />
                </div>
                <button type="button" onClick={() => openPeople('following')} className="btn-ghost mt-4 w-full !py-2 !text-xs">
                  Open your people
                </button>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink/55">Claim a handle above to join in.</p>
            )}
          </div>

          {twins.length > 0 && (
            <div className="card p-5">
              <p className="font-display text-xl font-medium text-ink">Kindred taste</p>
              <p className="mt-1 text-xs text-ink/50">Matched by wardrobe and taste, not follower counts.</p>
              <div className="mt-2">
                {twins.slice(0, 3).map((t) => (
                  <div key={t.handle} className="flex items-center gap-3 border-t border-ink/10 py-3 first:border-t-0">
                    <Link to={`/u/${t.handle}`} className="press flex min-w-0 flex-1 items-center gap-3">
                      <Initials handle={t.handle} className="h-8 w-8" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">@{t.handle}</span>
                        <span className="block truncate text-[11px] text-ink/50">
                          {t.sharedTaste[0] ?? `${t.match}% match`}
                        </span>
                      </span>
                    </Link>
                    {!t.isFollowing && (
                      <button
                        type="button"
                        onClick={() => void quickFollow(t.handle)}
                        className="press shrink-0 rounded-[3px] border border-brass/60 px-3 py-1.5 text-xs font-semibold text-brass hover:bg-iris-soft"
                      >
                        Follow
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {twins.length > 3 && (
                <button type="button" onClick={() => openPeople('suggested')} className="press mt-2 text-xs font-semibold text-brass">
                  See all {twins.length} →
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      <PeopleDrawer
        open={people.open}
        initialTab={people.tab}
        onClose={() => setPeople((p) => ({ ...p, open: false }))}
        onChanged={() => {
          refreshSide()
          void loadFeed(lens)
        }}
      />

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
                    <GarmentThumb item={{ id: p.source.id, imageUrl: p.source.imageUrl, subtype: p.source.label, category: p.source.label }} className="w-16" />
                    <span className="text-ink/35">→</span>
                    <GarmentThumb item={{ id: p.match.id, imageUrl: p.match.imageUrl, subtype: p.match.label, category: p.match.label }} className="w-16" />
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
                <Plate>To complete the look</Plate>
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
                <button type="button" disabled={saving} onClick={() => void saveRecreated()} className="btn-ghost !px-4 !py-2 !text-sm">
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

function Stat({ v, l }: { v: number; l: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-medium leading-tight text-ink [font-variant-numeric:tabular-nums]">{v}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">{l}</p>
    </div>
  )
}

function ComposeButton({ onClick, label, icon }: { onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex items-center justify-center gap-2 rounded-[3px] border border-ink/15 bg-surface px-2 py-2.5 text-xs font-semibold text-ink transition-colors hover:border-brass"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="shrink-0 text-brass" aria-hidden="true">
        {icon}
      </svg>
      <span className="truncate">{label}</span>
    </button>
  )
}

/* ---- identity: the handle claim lives in the mantel, not a separate card ---- */
function Identity({
  me,
  onSet,
  onOpenPeople,
}: {
  me: SocialMe
  onSet: (h: string) => void
  onOpenPeople: (tab: PeopleTab) => void
}) {
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
      <p className="mt-3 animate-rise-1 text-sm text-ink/55">
        You are <span className="font-semibold text-ink">@{me.handle}</span>
        <span className="mx-2 text-ink/25">·</span>
        <button type="button" onClick={() => onOpenPeople('followers')} className="press hover:text-ink">
          {me.followers} follower{me.followers === 1 ? '' : 's'}
        </button>
        <span className="mx-2 text-ink/25">·</span>
        <button type="button" onClick={() => onOpenPeople('following')} className="press hover:text-ink">
          following {me.following}
        </button>
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 max-w-md animate-rise-1">
      <p className="mb-2 text-sm text-ink/60">Claim your handle — it’s how friends find and follow you.</p>
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
