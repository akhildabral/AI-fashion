import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { Arch, ArchSkeleton, Chip, Modal, PageShell, Toast, useFlash, Tabs, SkeletonBlock, MoreMenu, MenuItem } from '../components/ui'
import { Initials } from '../components/PeopleDrawer'
import { GarmentThumb, LookCard, Plate } from '../components/CircleCards'
import { StyleFriendModal } from '../components/StyleFriendModal'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { recreateFromCloset, type RecreateResponse } from '@zauq/shared/brief'
import {
  REPORT_REASONS,
  blockUser,
  followUser,
  getOverlap,
  getProfileByHandle,
  muteUser,
  removeFollower,
  report,
  unblockUser,
  unfollowUser,
  unmuteUser,
  type OverlapResult,
  type PublicProfile,
  type ReportReason,
} from '@zauq/shared/social'
import { reactToPost, saveLook, unreactToPost, unsaveLook, type LookPost, type PostItem, type PostTarget, type ReactionKind } from '@zauq/shared/circle'
import type { CardActions } from '../components/CircleCards'


// Someone's room: the looks they've shared (the gallery), their earned
// standing, their public wardrobe — and, between friends, the act of
// dressing them.

type Lens = 'looks' | 'wardrobe'

export function UserProfilePage() {
  const { toast, flash } = useFlash()
  const { handle = '' } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const who = profile?.user.name ?? handle
  usePageTitle(who)
  const [overlap, setOverlap] = useState<OverlapResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lens, setLens] = useState<Lens>('looks')

  const [styling, setStyling] = useState(false)

  const [recreate, setRecreate] = useState<{ result: RecreateResponse | null } | null>(null)
  const [saving, setSaving] = useState(false)

  // Safety: the ways out.
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')
  const [sendingReport, setSendingReport] = useState(false)

  function reload() {
    return getProfileByHandle(handle).then(setProfile).catch(() => undefined)
  }
  async function safety(action: 'mute' | 'unmute' | 'remove' | 'block' | 'unblock') {
    if (!profile || busy) return
    setBusy(true)
    try {
      if (action === 'mute') {
        await muteUser(handle, 30)
        flash(`Muted ${who} for 30 days. Their posts leave your table; they won’t know.`)
      } else if (action === 'unmute') {
        await unmuteUser(handle)
        flash(`${who} is back on your table.`)
      } else if (action === 'remove') {
        await removeFollower(handle)
        flash(`${who} no longer follows you.`)
      } else if (action === 'block') {
        await blockUser(handle)
        flash(`Blocked ${who}. Neither of you sees the other now.`)
      } else {
        await unblockUser(handle)
        flash(`Unblocked ${who}.`)
      }
      await reload()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'That didn’t go through.')
    } finally {
      setBusy(false)
    }
  }
  async function sendReport() {
    if (!reason || sendingReport) return
    setSendingReport(true)
    try {
      await report({ targetType: 'user', targetId: handle, reason, detail: detail.trim() || undefined })
      setReporting(false)
      setReason(null)
      setDetail('')
      flash('Thank you. The house will take a look.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not send that.')
    } finally {
      setSendingReport(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setError(null)
    setOverlap(null)
    getProfileByHandle(handle)
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        setLens(p.looks.length > 0 ? 'looks' : 'wardrobe')
        if (!p.isMe && p.publicItems.length > 0) {
          void getOverlap(handle)
            .then((o) => !cancelled && setOverlap(o))
            .catch(() => {})
        }
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Profile not found.'))
    return () => {
      cancelled = true
    }
  }, [handle])

  async function toggleFollow() {
    if (!profile || busy) return
    setBusy(true)
    try {
      if (profile.isFollowing) {
        await unfollowUser(handle)
        setProfile({ ...profile, isFollowing: false, isFriend: false, counts: { ...profile.counts, followers: profile.counts.followers - 1 } })
      } else {
        const { isFriend } = await followUser(handle)
        setProfile({ ...profile, isFollowing: true, isFriend, counts: { ...profile.counts, followers: profile.counts.followers + 1 } })
      }
    } catch {
      flash('Couldn’t update follow. Try again.')
    } finally {
      setBusy(false)
    }
  }



  const patchLook = (id: string, fn: (p: LookPost) => LookPost) =>
    setProfile((p) => (p ? { ...p, looks: p.looks.map((l) => (l.id === id ? fn(l) : l)) } : p))

  async function handleReact(target: PostTarget, id: string, kind: ReactionKind | null) {
    try {
      const { reactions } = kind ? await reactToPost(target, id, kind) : await unreactToPost(target, id)
      patchLook(id, (p) => ({ ...p, reactions }))
    } catch {
      flash('Could not react to that.')
    }
  }
  const cardActions: CardActions = {
    react: handleReact,
    commentCount: (_t, id, n) => patchLook(id, (x) => ({ ...x, comments: n })),
    note: flash,
    save: handleSave,
    recreate: openRecreate,
    report: (type, id, label) => {
      void type
      void id
      void label
      setReporting(true)
    },
  }
  async function handleSave(id: string, saved: boolean) {
    patchLook(id, (p) => ({ ...p, saved }))
    try {
      if (saved) await saveLook(id)
      else await unsaveLook(id)
    } catch {
      patchLook(id, (p) => ({ ...p, saved: !saved }))
      flash('Could not save that.')
    }
  }
  function openRecreate(_h: string | null, items: PostItem[]) {
    setRecreate({ result: null })
    recreateFromCloset(items.map((i) => i.id))
      .then((result) => setRecreate({ result }))
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
      await apiFetch('/outfits', { method: 'POST', body: { itemIds: ids, provenance: 'copied', rationale: `Recreated from ${who}’s look` } })
      flash('Saved to your outfits.')
      setRecreate(null)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell wide>
      <Toast msg={toast} />
      {!profile && !error && (
        <div aria-busy="true" aria-label="Loading profile">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-64" />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-24 w-full" />)}
          </div>
          <ArchSkeleton count={5} className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-6" />
        </div>
      )}
      {error && (
        <div className="py-16 text-center">
          <p className="font-display text-2xl italic text-ink">{error}</p>
          <Link to="/circle" className="btn-ghost mt-5 inline-flex">
            Back to the Circle
          </Link>
        </div>
      )}

      {profile && (
        <>
          {/* ---- mantel: the tracked label over the Bodoni line ---- */}
          <header className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex items-end gap-4">
              <Initials handle={profile.user.handle} name={profile.user.name} className="h-10 w-10 text-xs" />
              <div>
                <p className="animate-rise eyebrow">
                  {profile.isMe ? 'Your room' : profile.isFriend ? 'A friend' : profile.followsYou ? 'Follows you' : 'In the circle'}
                </p>
                <h1 className="page-title mt-2 animate-rise-1">{profile.user.name}</h1>
                <p className="mt-3 animate-rise-1 text-sm text-ink/55 [font-variant-numeric:tabular-nums]">
                  {profile.counts.followers} follower{profile.counts.followers === 1 ? '' : 's'}
                  <span className="mx-2 text-ink/25">·</span>following {profile.counts.following}
                  <span className="mx-2 text-ink/25">·</span>
                  {profile.counts.publicItems} public piece{profile.counts.publicItems === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            {!profile.isMe && (
              <div className="action-row">
                {!profile.blockedByMe && profile.publicItems.length >= 2 && (
                  <button type="button" onClick={() => setStyling(true)} className="btn-ghost">
                    Style them
                  </button>
                )}
                {!profile.blockedByMe && (
                  <button type="button" onClick={() => void toggleFollow()} disabled={busy} className={profile.isFollowing ? 'btn-ghost' : 'btn-primary'}>
                    {profile.isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
                <MoreMenu align="right" label="More about this person">
                  {profile.blockedByMe ? (
                    <MenuItem onClick={() => void safety('unblock')}>Unblock {who}</MenuItem>
                  ) : (
                    <>
                      {profile.mutedUntil ? (
                        <MenuItem onClick={() => void safety('unmute')}>Unmute</MenuItem>
                      ) : (
                        <MenuItem onClick={() => void safety('mute')}>Mute for 30 days</MenuItem>
                      )}
                      {profile.followsYou && <MenuItem onClick={() => void safety('remove')}>Remove as a follower</MenuItem>}
                      <MenuItem onClick={() => setReporting(true)}>Report</MenuItem>
                      <MenuItem danger onClick={() => void safety('block')}>
                        Block {who}
                      </MenuItem>
                    </>
                  )}
                </MoreMenu>
              </div>
            )}
          </header>

          {profile.blockedByMe && (
            <div className="mt-8 px-6 py-12 text-center">
              <p className="font-display text-2xl font-medium italic text-ink">You’ve blocked {who}</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">They can’t see you, you won’t see them, and any follows between you are gone. Undo it from the menu above.</p>
            </div>
          )}
          {profile.mutedUntil && !profile.blockedByMe && (
            <p className="mt-4 text-xs text-ink/50">
              Muted{profile.mutedUntil === 'forever' ? '' : ` until ${new Date(profile.mutedUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}. Their posts stay off your table.
            </p>
          )}

          {!profile.blockedByMe && (
          <>
          {/* ---- standing: earned, verified, never bought ---- */}
          <section aria-label="Standing" className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Standing n={profile.standing.picksWorn} title="A good eye" sub="picks that got worn" />
            <Standing n={profile.standing.recreated} title="Recreated" sub="looks copied into closets" />
            <Standing n={profile.standing.wouldWear} title="Would wear" sub="from the circle" />
            <Standing n={profile.standing.looksShared} title="Looks shared" sub="on the circle" />
          </section>

          {overlap && overlap.matchedCount > 0 && !profile.isMe && (
            <div className="plaque mt-8 p-5 pl-6">
              <Plate>From your own closet</Plate>
              <p className="mt-2 font-display text-xl text-ink">
                You could recreate {overlap.matchedCount} of their {overlap.theirCount} public piece{overlap.theirCount === 1 ? '' : 's'}.
              </p>
              <div className="mt-3 flex flex-wrap gap-4">
                {overlap.matches.slice(0, 6).map((m) => (
                  <div key={m.theirs.id} className="flex items-center gap-1.5">
                    <GarmentThumb item={{ id: m.theirs.id, imageUrl: m.theirs.imageUrl, subtype: m.theirs.subtype, category: m.theirs.category }} className="w-12" />
                    <span className="text-ink/35">≈</span>
                    <GarmentThumb item={{ id: m.yours.id, imageUrl: m.yours.imageUrl, subtype: m.yours.subtype, category: m.yours.category }} className="w-12" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- lens ---- */}
          <Tabs
            className="mt-8"
            label="Profile view"
            value={lens}
            onChange={(l) => setLens(l)}
            items={[
              { key: 'looks', label: 'Looks', count: profile.looks.length },
              { key: 'wardrobe', label: 'Wardrobe', count: profile.publicItems.length },
            ]}
          />

          {/* ---- looks ---- */}
          {lens === 'looks' && (
            <div className="mx-auto mt-4 flex max-w-2xl flex-col gap-4 lg:mx-0">
              {profile.looks.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="font-display text-2xl font-medium italic text-ink">Nothing shared yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">
                    {profile.isMe ? 'Share a look from the Circle and it hangs here.' : 'When they share a look, it hangs here.'}
                  </p>
                  {profile.isMe && (
                    <Link to="/circle" className="btn-primary mt-5 inline-flex">
                      Share a look
                    </Link>
                  )}
                </div>
              )}
              {profile.looks.map((p) => (
                <LookCard key={p.id} post={p} actions={cardActions} />
              ))}
            </div>
          )}

          {/* ---- wardrobe ---- */}
          {lens === 'wardrobe' && (
            <>
              {profile.publicItems.length === 0 ? (
                <div className="mt-4 px-6 py-12 text-center">
                  <p className="font-display text-2xl font-medium italic text-ink">{profile.isMe ? 'Your public wardrobe is empty' : 'Their public wardrobe is empty'}</p>
                  {profile.isMe && (
                    <>
                      <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">Make a piece public from its page in the Closet.</p>
                      <Link to="/closet" className="btn-ghost mt-5 inline-flex">Open the Closet</Link>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-6">
                  {profile.publicItems.map((item, i) => {
                    return (
                      <figure
                        key={item.id}
                        className="rise-stagger relative m-0"
                        style={{ '--i': i } as CSSProperties}
                      >
                        <Arch aspect="aspect-[5/6]">
                          <img src={resolveImageUrl(item.imageUrl)} alt={item.subtype ?? item.category} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[7%]" />
                        </Arch>
                        <figcaption className="mt-2 truncate text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/70">{item.subtype ?? item.category}</figcaption>
                      </figure>
                    )
                  })}
                </div>
              )}
            </>
          )}
          </>
          )}
        </>
      )}

      <StyleFriendModal open={styling} onClose={() => setStyling(false)} onSent={() => flash('Sent. It’s waiting on their table.')} onNote={flash} initialHandle={handle} />
      <Modal open={reporting} onClose={() => setReporting(false)} title={`Report ${who}`}>
        <p className="text-sm text-ink/60">Tell the house what’s wrong. They won’t know it came from you.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {REPORT_REASONS.map((r) => (
            <Chip key={r.key} on={reason === r.key} onClick={() => setReason(r.key)}>
              {r.label}
            </Chip>
          ))}
        </div>
        <label htmlFor="profile-report-detail" className="label mt-4">
          Anything else that helps, optional
        </label>
        <textarea id="profile-report-detail" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500} rows={3} className="field !h-auto py-2.5" />
        <div className="action-row mt-5">
          <button type="button" disabled={!reason || sendingReport} onClick={() => void sendReport()} className="btn-primary">
            {sendingReport ? 'Sending…' : 'Send report'}
          </button>
          <button type="button" onClick={() => setReporting(false)} className="btn-quiet">
            Cancel
          </button>
        </div>
      </Modal>

      <Modal open={recreate !== null} onClose={() => setRecreate(null)} title={`In your closet, ${who}’s look`}>
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
              <p className="font-display text-lg italic text-ink/70">Nothing in your closet matches this look yet.</p>
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

/** An engraved fact: the plaque's label, figure, note — never a control. */
function Standing({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className={`plaque p-4 pl-5 ${n === 0 ? 'opacity-60' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-label-xl text-accent-text">{title}</p>
      <p className="mt-1 font-display text-3xl font-medium leading-[1.1] text-ink [font-variant-numeric:tabular-nums]">{n}</p>
      <p className="mt-1 text-xs text-ink/50">{sub}</p>
    </div>
  )
}
