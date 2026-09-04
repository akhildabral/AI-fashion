import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { useAuth } from '../context/useAuth'
import { Arch, Modal, PageShell, PageHead, Toast, useFlash, Tabs, MoreMenu, MenuItem, Filter, Stat, LoadError, SkeletonBlock } from '../components/ui'
import { Initials, PeopleDrawer, type PeopleTab } from '../components/PeopleDrawer'
import { InviteSheet } from '../components/InviteSheet'
import { ReportSheet } from '../components/ReportSheet'
import { StyleFriendModal } from '../components/StyleFriendModal'
import { thankPick, withdrawPick } from '@zauq/shared/social'
import { setLookPhoto, type ExploreOccasion } from '@zauq/shared/circle'
import type { CardActions } from '../components/CircleCards'
import { WeekCard } from '../components/CircleCards'
import { deletePoll } from '@zauq/shared/polls'
import { muteUser, type ReportTarget } from '@zauq/shared/social'
import { GarmentThumb, LookCard, PickCard, Plate, VerdictCard } from '../components/CircleCards'
import { AskCircleModal, ShareLookModal } from '../components/ComposeModals'
import { recreateFromCloset, type RecreateResponse } from '@zauq/shared/brief'
import { followUser, getSocialMe, getStyleTwins, type SocialMe, type StyleTwin } from '@zauq/shared/social'
import {
  getCircleExplore,
  getCircleFeed,
  getCircleSaved,
  getCircleToday,
  saveLook,
  unsaveLook,
  voteOnVerdict,
  type CirclePost,
  type Lens,
  type LookPost,
  type PostItem,
  type ReactionKind,
  getPost,
  reactToPost,
  settleVerdict,
  unreactToPost,
  unshareLook,
  type PostTarget,
} from '@zauq/shared/circle'

// The Circle — a salon where friends dress each other. One ranked column
// of posts; a rail of who wore what today; the people who make it live in
// a drawer and the things that happened to you behind the bell. Every post
// asks something of you: recreate it, vote it, wear it, keep it.

const LENSES: { key: Lens; label: string }[] = [
  { key: 'foryou', label: 'For you' },
  { key: 'following', label: 'Following' },
  { key: 'explore', label: 'Explore' },
  { key: 'saved', label: 'Saved' },
]

const RAIL_DISMISS_KEY = 'circle-suggested-dismissed'

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
  const [sharing, setSharing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [styling, setStyling] = useState(false)
  const [exploreOccasion, setExploreOccasion] = useState<ExploreOccasion | null>(null)
  const [exploreKindred, setExploreKindred] = useState(false)
  const [reporting, setReporting] = useState<{ type: ReportTarget; id: string; label: string } | null>(null)
  const [focus, setFocus] = useState<{ type: PostTarget; id: string } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [railDismissed, setRailDismissed] = useState(() => {
    try {
      return localStorage.getItem(RAIL_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [recreate, setRecreate] = useState<{ handle: string; result: RecreateResponse | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const reqId = useRef(0)

  const loadFeed = useCallback(async (which: Lens, offset = 0) => {
    const id = ++reqId.current
    if (offset === 0) {
      setPosts(null)
      setError(null)
    } else setLoadingMore(true)
    try {
      if (which === 'explore' || which === 'saved') {
        const r = which === 'explore' ? await getCircleExplore({ occasion: exploreOccasion ?? undefined, kindred: exploreKindred }) : await getCircleSaved()
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
  }, [exploreOccasion, exploreKindred])

  const refreshSide = useCallback(() => {
    void getSocialMe().then(setMe).catch(() => setMe({ handle: null, name: 'you', followers: 0, following: 0, picks: 0 }))
    void getStyleTwins().then(({ twins: t }) => setTwins(t ?? [])).catch(() => setTwins([]))
    void getCircleToday().then((r) => setToday(r.entries)).catch(() => setToday([]))
  }, [])

  useEffect(() => {
    refreshSide()
  }, [refreshSide])

  useEffect(() => {
    void loadFeed(lens)
  }, [lens, loadFeed])

  /* ----- post patching ----- */

  const patchLook = (id: string, fn: (p: LookPost) => LookPost) => {
    const apply = (p: CirclePost) => (p.type === 'look' && p.id === id ? fn(p) : p)
    setPosts((prev) => (prev ? prev.map(apply) : prev))
    setToday((prev) => (prev ? prev.map((p) => apply(p) as LookPost) : prev))
  }

  const patchPost = (target: PostTarget, id: string, fn: (p: CirclePost) => CirclePost) =>
    setPosts((prev) => (prev ? prev.map((p) => (p.type === target && p.id === id ? fn(p) : p)) : prev))

  async function handleReact(target: PostTarget, id: string, kind: ReactionKind | null) {
    try {
      const { reactions } = kind ? await reactToPost(target, id, kind) : await unreactToPost(target, id)
      if (target === 'look') patchLook(id, (p) => ({ ...p, reactions }))
      else patchPost(target, id, (p) => ({ ...p, reactions }))
    } catch {
      flash('Could not react to that.')
    }
  }

  async function handleTakeDown(target: PostTarget, id: string) {
    try {
      if (target === 'look') await unshareLook(id)
      else if (target === 'verdict') await deletePoll(id)
      setPosts((prev) => (prev ? prev.filter((p) => !(p.type === target && p.id === id)) : prev))
      if (target === 'look') setToday((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
      flash(target === 'look' ? 'Taken down.' : 'Verdict withdrawn.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not take that down.')
    }
  }

  async function handleSettle(pollId: string) {
    try {
      await settleVerdict(pollId)
      const { post } = await getPost('verdict', pollId)
      patchPost('verdict', pollId, () => post)
      flash('Settled. Everyone who voted will hear.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not settle that.')
    }
  }

  async function handleMute(handle: string) {
    try {
      await muteUser(handle, 30)
      setPosts((prev) => (prev ? prev.filter((p) => p.type === 'week' || p.handle !== handle) : prev))
      setToday((prev) => (prev ? prev.filter((p) => p.handle !== handle) : prev))
      flash('Muted them for 30 days. Undo it from Your people.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not mute them.')
    }
  }

  // A notification lands on its post: pull it in if the feed doesn't have it, then scroll to it.
  useEffect(() => {
    const f = searchParams.get('focus')
    if (!f || posts === null) return
    const [type, id] = f.split(':') as [PostTarget, string]
    if (!['look', 'verdict', 'pick'].includes(type) || !id) return
    const done = () => {
      setFocus({ type, id })
      setSearchParams({}, { replace: true })
      window.setTimeout(() => document.getElementById(`post-${type}-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80)
      window.setTimeout(() => setFocus(null), 4000)
    }
    if (posts.some((p) => p.type === type && p.id === id)) done()
    else
      getPost(type, id)
        .then(({ post }) => {
          setPosts((prev) => [post, ...(prev ?? [])])
          done()
        })
        .catch(() => {
          setSearchParams({}, { replace: true })
          flash('That post isn’t on the circle any more.')
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, posts === null])

  async function handleSave(wearLogId: string, saved: boolean) {
    patchLook(wearLogId, (p) => ({ ...p, saved }))
    try {
      if (saved) await saveLook(wearLogId)
      else await unsaveLook(wearLogId)
      if (!saved && lens === 'saved') setPosts((prev) => (prev ? prev.filter((p) => !(p.type === 'look' && p.id === wearLogId)) : prev))
      flash(saved ? 'Kept on your board.' : 'Removed from your board.')
    } catch {
      patchLook(wearLogId, (p) => ({ ...p, saved: !saved }))
      flash('Could not save that.')
    }
  }

  function handleCommentCount(target: PostTarget, id: string, n: number) {
    setPosts((prev) => (prev ? prev.map((p) => (p.type === target && p.id === id ? { ...p, comments: n } : p)) : prev))
  }

  async function handleVote(pollId: string, optionId: string) {
    if (!user) return
    try {
      await voteOnVerdict(pollId, optionId, user.id)
      const { post } = await getPost('verdict', pollId)
      patchPost('verdict', pollId, () => post)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not vote.')
    }
  }

  function openRecreate(handle: string | null, items: PostItem[]) {
    const h = (posts?.find((p) => p.handle === handle)?.name ?? today?.find((p) => p.handle === handle)?.name) ?? 'them'
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
        body: { itemIds: ids, provenance: 'copied', rationale: `Recreated from ${posts?.find((p) => p.handle === recreate?.handle)?.name ?? 'a friend'}’s outfit of the day` },
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
      flash('Following.')
    } catch {
      flash('Could not follow.')
    }
  }

  function dismissRail() {
    setRailDismissed(true)
    try {
      localStorage.setItem(RAIL_DISMISS_KEY, '1')
    } catch {
      /* fine */
    }
  }

  const openPeople = (tab: PeopleTab) => setPeople({ open: true, tab })
  const feedEmpty = posts !== null && posts.length === 0 && !error
  const mineToday = today?.find((t) => t.isMine) ?? null
  const othersToday = (today ?? []).filter((t) => !t.isMine)
  const suggested = twins.filter((t) => !t.isFollowing)
  const showRail = !railDismissed && suggested.length > 0 && (posts?.length ?? 0) > 0

  const actions: CardActions = {
    react: handleReact,
    commentCount: handleCommentCount,
    note: flash,
    mute: (h) => void handleMute(h),
    report: (type, id, label) => setReporting({ type, id, label }),
    takeDown: handleTakeDown,
    settle: handleSettle,
    save: handleSave,
    recreate: openRecreate,
    gone: (type, id) => setPosts((prev) => (prev ? prev.filter((x) => !(x.type === type && x.id === id)) : prev)),
    thank: async (pickId, reply) => {
      try {
        const r = await thankPick(pickId, reply || undefined)
        patchPost('pick', pickId, (p) => (p.type === 'pick' ? { ...p, thanksAt: r.thanksAt, reply: r.reply } : p))
        flash('Sent.')
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Could not send that.')
      }
    },
    photo: async (pickId, wearLogId, file) => {
      try {
        const { photoUrl } = await setLookPhoto(wearLogId, file)
        patchPost('pick', pickId, (p) => (p.type === 'pick' ? { ...p, photoUrl } : p))
        flash('Photo added. They’ll see it.')
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Could not add the photo.')
      }
    },
    withdraw: async (pickId) => {
      try {
        await withdrawPick(pickId)
        setPosts((prev) => (prev ? prev.filter((x) => !(x.type === 'pick' && x.id === pickId)) : prev))
        flash('Taken back.')
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Could not take that back.')
      }
    },
  }
  const isFocus = (p: CirclePost) => focus?.type === p.type && focus.id === p.id
  const renderPost = (p: CirclePost, i: number) => (
    <div key={`${p.type}-${p.id}`} className="rise-stagger" style={{ '--i': i } as CSSProperties}>
      {p.type === 'look' ? (
        <LookCard post={p} actions={actions} highlight={isFocus(p)} />
      ) : p.type === 'verdict' ? (
        <VerdictCard post={p} actions={actions} onVote={handleVote} highlight={isFocus(p)} />
      ) : p.type === 'pick' ? (
        <PickCard post={p} actions={actions} highlight={isFocus(p)} />
      ) : (
        <WeekCard post={p} onOpen={(t, id) => setSearchParams({ focus: `${t}:${id}` })} />
      )}
    </div>
  )

  return (
    <PageShell wide>
      <Toast msg={toast} />

      {/* ---- mantel: the tracked label over the Bodoni line ---- */}
      <PageHead eyebrow="The Circle" title="Circle" />

      {/* The two-column room: content and a 340 aside, 48 → 64 apart; the aside stacks last below lg. */}
      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 xl:gap-16">
        {/* ================= main column ================= */}
        <div className="mx-auto w-full max-w-2xl lg:mx-0">
          {/* ---- today rail ---- */}
          <section aria-label="Today in your circle" className="animate-rise-1">
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
              <button type="button" onClick={() => setSharing(true)} className="press w-16 shrink-0 text-center">
                {mineToday && (mineToday.photoUrl || mineToday.items[0]) ? (
                  <RailThumb look={mineToday} />
                ) : (
                  <div className="arch-bezel aspect-[4/5] w-16 opacity-50">
                    <div className="arch-niche flex h-full w-full items-center justify-center">
                      {/* Drawn inside the niche, so it takes the theme-invariant niche ink. */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="relative z-[1]" style={{ color: 'var(--text-in-niche-muted)' }} aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </div>
                  </div>
                )}
                <p className="mt-1.5 truncate text-[11px] text-ink/55">{mineToday ? 'Your look' : 'Share yours'}</p>
              </button>
              {othersToday.map((t) =>
                t.photoUrl || t.items[0] ? (
                  <Link key={t.id} to={`/u/${t.handle}`} className="press w-16 shrink-0 text-center">
                    <RailThumb look={t} />
                    <p className="mt-1.5 truncate text-[11px] text-ink/55">{t.name}</p>
                  </Link>
                ) : null,
              )}
              {today && othersToday.length === 0 && (
                <p className="self-center pl-2 font-display text-sm italic text-ink/45">No one in your circle has shared a look today.</p>
              )}
            </div>
          </section>

          {/* ---- compose ---- */}
          {/* One door. Sharing is also a tap away on the today rail above, so the
              three actions live behind a single button instead of a button wall. */}
          <div className="mt-4 animate-rise-1">
            <MoreMenu
              align="left"
              label="Post to your circle"
              trigger={
                <span className="btn-primary">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2 shrink-0" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  Post to your circle
                  <span aria-hidden className="ml-1.5 text-on-brass/50">▾</span>
                </span>
              }
            >
              <MenuItem onClick={() => setSharing(true)}>Share a look</MenuItem>
              <MenuItem onClick={() => setAsking(true)}>Ask the circle</MenuItem>
              <MenuItem onClick={() => setStyling(true)}>Style a friend</MenuItem>
            </MoreMenu>
          </div>

          {/* ---- lens: tabs switch views of the same feed; filters narrow one of them ---- */}
          <Tabs className="mt-8 animate-rise-1" label="Feed" value={lens} onChange={(k) => setLens(k)} items={LENSES.map((l) => ({ key: l.key, label: l.label }))} />
          {lens === 'explore' && (
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {(
                [
                  [null, 'Everything'],
                  ['work', 'Work'],
                  ['casual', 'Weekend'],
                  ['evening', 'Evening'],
                  ['occasion', 'Occasion'],
                ] as [ExploreOccasion | null, string][]
              ).map(([k, l]) => (
                <Filter key={l} on={exploreOccasion === k} onClick={() => setExploreOccasion(k)}>
                  {l}
                </Filter>
              ))}
              <span className="filter-sep" />
              <Filter on={exploreKindred} onClick={() => setExploreKindred((v) => !v)}>
                Kindred taste
              </Filter>
            </div>
          )}

          {/* ---- feed: one ranked column, in a single measure ---- */}
          <div className="mt-4 flex flex-col gap-4">
            {posts === null && (
              <div aria-busy="true" aria-label="Loading your circle" className="flex flex-col gap-4">
                {[0, 1].map((i) => (
                  <div key={i} className="card p-4">
                    <SkeletonBlock className="h-8 w-40" />
                    <div className="rect-frame mt-3 aspect-[4/3] w-full animate-pulse opacity-60">
                      <div className="arch-niche h-full w-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && <LoadError className="!min-h-0 py-10" message={error} onRetry={() => void loadFeed(lens)} />}
            {feedEmpty && <EmptyFeed lens={lens} circleSize={circleSize} onFind={() => openPeople('find')} onShare={() => setSharing(true)} onInvite={() => setInviting(true)} />}

            {posts?.slice(0, 2).map(renderPost)}
            {showRail && (
              <SuggestedRail
                people={suggested.slice(0, 6)}
                onFollow={quickFollow}
                onDismiss={dismissRail}
                onSeeAll={() => openPeople('suggested')}
              />
            )}
            {posts?.slice(2).map(renderPost)}

            {nextOffset !== null && (
              <button type="button" disabled={loadingMore} onClick={() => void loadFeed(lens, nextOffset)} className="btn-ghost mx-auto mt-2">
                {loadingMore ? 'Loading…' : 'More from your circle'}
              </button>
            )}
          </div>
        </div>

        {/* ================= side rail: stacks last below lg ================= */}
        <aside className="mt-10 flex flex-col gap-4 lg:sticky lg:top-24 lg:mt-0 lg:self-start">
          <div className="card p-4">
            <p className="font-display text-2xl font-medium text-ink">You in the circle</p>
            {me?.handle ? (
              <>
                <div className="mt-4 flex gap-6">
                  <Stat value={me.followers} label="Followers" />
                  <Stat value={me.following} label="Following" />
                  <Stat value={me.picks} label="Styled for you" />
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <button type="button" onClick={() => setInviting(true)} className="btn-primary w-full btn-sm">
                    Invite a friend
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => openPeople('following')} className="btn-ghost flex-1 btn-sm">
                      Your people
                    </button>
                    <Link to={`/u/${me.handle}`} className="btn-ghost flex-1 btn-sm">
                      Your profile
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 flex gap-6" aria-busy="true" aria-label="Loading">
                {[0, 1, 2].map((i) => (
                  <SkeletonBlock key={i} className="h-10 w-14" />
                ))}
              </div>
            )}
          </div>

          {twins.length > 0 && (
            <div className="card hidden p-4 lg:block">
              <p className="font-display text-2xl font-medium text-ink">Kindred taste</p>
              <p className="mt-1 text-xs text-ink/50">Matched by wardrobe and taste, not follower counts.</p>
              <div className="mt-2">
                {twins.slice(0, 3).map((t) => (
                  <div key={t.handle} className="flex items-center gap-3 border-t border-ink/10 py-3 first:border-t-0">
                    <Link to={`/u/${t.handle}`} className="press flex min-w-0 flex-1 items-center gap-3">
                      <Initials handle={t.handle} name={t.name} className="h-8 w-8" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{t.name}</span>
                        <span className="block truncate text-[11px] text-ink/50">{t.sharedTaste[0] ?? `${t.match}% match`}</span>
                      </span>
                    </Link>
                    {!t.isFollowing && (
                      <button type="button" onClick={() => void quickFollow(t.handle)} className="btn-ghost btn-sm shrink-0">
                        Follow
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {twins.length > 3 && (
                <button type="button" onClick={() => openPeople('suggested')} className="btn-quiet btn-quiet-sm mt-1">
                  See all {twins.length} →
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      <InviteSheet open={inviting} onClose={() => setInviting(false)} onNote={flash} />
      <ReportSheet target={reporting} onClose={() => setReporting(null)} onNote={flash} />
      <StyleFriendModal open={styling} onClose={() => setStyling(false)} onSent={() => void loadFeed(lens)} onNote={flash} />
      <PeopleDrawer
        open={people.open}
        initialTab={people.tab}
        onClose={() => setPeople((p) => ({ ...p, open: false }))}
        onChanged={() => {
          refreshSide()
          void loadFeed(lens)
        }}
      />
      <ShareLookModal
        open={sharing}
        onClose={() => setSharing(false)}
        onShared={() => {
          refreshSide()
          if (lens !== 'saved') void loadFeed(lens)
        }}
      />
      <AskCircleModal
        open={asking}
        onClose={() => setAsking(false)}
        onAsked={() => {
          flash('Asked. Your circle will weigh in.')
          if (lens === 'foryou' || lens === 'following') void loadFeed(lens)
        }}
      />

      <Modal open={recreate !== null} onClose={() => setRecreate(null)} title={recreate ? `In your closet, ${recreate.handle}’s look` : 'Recreate'}>
        {recreate && recreate.result === null && (
          <div aria-busy="true" aria-label="Reading your closet" className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="arch-bezel aspect-[5/6] w-16 animate-pulse opacity-50"><div className="arch-niche h-full w-full" /></div>
                <SkeletonBlock className="h-4 flex-1" />
                <div className="arch-bezel aspect-[5/6] w-16 animate-pulse opacity-50"><div className="arch-niche h-full w-full" /></div>
              </div>
            ))}
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
              <p className="font-display text-lg italic text-ink/70">
                Nothing here matches this look yet{recreate.result.closetSize === 0 ? '. Your closet’s empty; add some pieces first.' : '.'}
              </p>
            )}
            {recreate.result.missing.length > 0 && (
              <div className="mt-4 rounded-[3px] border border-brass/25 bg-iris-soft/50 p-4">
                <Plate>To complete the look</Plate>
                <ul className="mt-2 space-y-1 text-sm text-ink/70">
                  {recreate.result.missing.map((m) => (
                    <li key={m.source.id}>· {m.wanted || m.source.label}, not in your closet yet</li>
                  ))}
                </ul>
              </div>
            )}
            {recreate.result.pairs.length > 0 && (
              <div className="action-row mt-5">
                <button type="button" onClick={() => navigate(`/mirror?items=${recreate.result!.pairs.map((p) => p.match.id).join(',')}`)} className="btn-primary btn-sm">
                  See it on you
                </button>
                <button type="button" disabled={saving} onClick={() => void saveRecreated()} className="btn-ghost btn-sm">
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

/* ---------- pieces ---------- */

function EmptyFeed({
  lens,
  circleSize,
  onFind,
  onShare,
  onInvite,
}: {
  lens: Lens
  circleSize: number | null
  onFind: () => void
  onShare: () => void
  onInvite: () => void
}) {
  const copy: Record<Lens, { title: string; body: string }> = {
    foryou: {
      title: 'The salon is quiet',
      body:
        circleSize === 0
          ? 'Bring in someone whose taste you trust. Their looks, verdicts and picks gather here.'
          : 'Your circle’s gone quiet. Share yours and get it going.',
    },
    following: {
      title: 'Nothing new from your people',
      body: 'When they share a look or ask a verdict, it lands here in order.',
    },
    explore: { title: 'Nothing hung yet', body: 'When people post their outfit of the day, the best of it lands here.' },
    saved: { title: 'Your board is empty', body: 'Tap Save on any look you’d wear. It waits here for when you need the idea.' },
  }
  const c = copy[lens]
  // An empty state is one italic Bodoni line and a way forward: no box.
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-display text-2xl font-medium italic text-ink">{c.title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">{c.body}</p>
      {lens !== 'explore' && lens !== 'saved' && circleSize === 0 && (
        <div className="action-row mt-5 justify-center">
          <button type="button" onClick={onInvite} className="btn-primary">
            Invite a friend
          </button>
          <button type="button" onClick={onFind} className="btn-quiet">
            Find people already here
          </button>
        </div>
      )}
      {lens !== 'explore' && lens !== 'saved' && circleSize !== 0 && (
        <button type="button" onClick={onShare} className="btn-primary mt-5">
          Share a look
        </button>
      )}
    </div>
  )
}

/** People to follow, threaded into the feed on small screens (the side rail carries it on desktop). */
function SuggestedRail({
  people,
  onFollow,
  onDismiss,
  onSeeAll,
}: {
  people: StyleTwin[]
  onFollow: (handle: string) => void
  onDismiss: () => void
  onSeeAll: () => void
}) {
  return (
    <section aria-label="People with your taste" className="card p-4 lg:hidden">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Kindred taste</p>
        <button type="button" onClick={onDismiss} className="press text-xs text-ink/55 transition-colors hover:text-ink">
          Hide
        </button>
      </div>
      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {people.map((t) => (
          <div key={t.handle} className="w-36 shrink-0 rounded-[3px] border border-ink/10 bg-bone p-3 text-center">
            <Link to={`/u/${t.handle}`} className="press inline-flex flex-col items-center">
              <Initials handle={t.handle} name={t.name} className="h-8 w-8" />
              <span className="mt-2 block max-w-full truncate text-sm font-semibold text-ink">{t.name}</span>
              <span className="mt-0.5 block max-w-full truncate text-[11px] text-ink/50">{t.sharedTaste[0] ?? `${t.match}% match`}</span>
            </Link>
            <button type="button" onClick={() => onFollow(t.handle)} className="btn-ghost btn-sm mt-3 w-full">
              Follow
            </button>
          </div>
        ))}
        <button type="button" onClick={onSeeAll} className="btn-quiet btn-quiet-sm shrink-0 self-center whitespace-nowrap">
          See all →
        </button>
      </div>
    </section>
  )
}

/** A rail thumb: the person when there's a photo, else the lead piece. */
function RailThumb({ look }: { look: LookPost }) {
  if (look.photoUrl) {
    return (
      <Arch aspect="aspect-[4/5]" className="w-16">
        <img src={resolveImageUrl(look.photoUrl)} alt="" className="relative z-[1] h-full w-full object-cover" />
      </Arch>
    )
  }
  return <GarmentThumb item={look.items[0]} className="w-16" />
}

