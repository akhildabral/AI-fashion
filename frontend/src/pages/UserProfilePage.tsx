import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { Arch, Modal, PageShell, Toast, useFlash, Tabs } from '../components/ui'
import { Spinner } from '../components/Spinner'
import { Initials } from '../components/PeopleDrawer'
import { GarmentThumb, LookCard, Plate } from '../components/CircleCards'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { recreateFromCloset, type RecreateResponse } from '../lib/brief'
import {
  REPORT_REASONS,
  blockUser,
  followUser,
  getOverlap,
  getProfileByHandle,
  muteUser,
  removeFollower,
  report,
  sendPick,
  unblockUser,
  unfollowUser,
  unmuteUser,
  type OverlapResult,
  type PublicProfile,
  type ReportReason,
} from '../lib/social'
import { reactToPost, saveLook, unreactToPost, unsaveLook, type LookPost, type PostItem, type PostTarget, type ReactionKind } from '../lib/circle'
import type { CardActions } from '../components/CircleCards'

const MAX_PICK_ITEMS = 8

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

  // Friend-pick composition.
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

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
    setPicking(false)
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
      flash('Could not update follow — try again.')
    } finally {
      setBusy(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : prev.length >= MAX_PICK_ITEMS ? prev : [...prev, id]))
  }

  async function handleSendPick() {
    if (sending || selected.length < 2) return
    setSending(true)
    try {
      await sendPick(handle, { itemIds: selected, note: note.trim() || undefined })
      flash('Sent — it’s waiting in their circle.')
      setPicking(false)
      setSelected([])
      setNote('')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not send your pick.')
    } finally {
      setSending(false)
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
        <div className="flex min-h-[40vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}
      {error && (
        <div className="rounded-[3px] border border-dashed border-ink/20 py-16 text-center text-ink/55">
          <p>{error}</p>
          <Link to="/circle" className="mt-3 inline-block text-sm font-semibold text-brass hover:underline">
            ← Back to the Circle
          </Link>
        </div>
      )}

      {profile && (
        <>
          {/* ---- mantel ---- */}
          <header className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex items-end gap-4">
              <Initials handle={profile.user.handle} name={profile.user.name} className="h-16 w-16 !text-xl sm:h-20 sm:w-20" />
              <div>
                <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">
                  {profile.isMe ? 'Your room' : profile.isFriend ? 'A friend' : profile.followsYou ? 'Follows you' : 'In the circle'}
                </p>
                <h1 className="mt-1 animate-rise-1 font-display text-4xl font-medium text-ink sm:text-5xl">{profile.user.name}</h1>
                <p className="mt-1.5 animate-rise-1 text-sm text-ink/55">
                  {profile.counts.followers} follower{profile.counts.followers === 1 ? '' : 's'}
                  <span className="mx-2 text-ink/25">·</span>following {profile.counts.following}
                  <span className="mx-2 text-ink/25">·</span>
                  {profile.counts.publicItems} public piece{profile.counts.publicItems === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            {!profile.isMe && (
              <div className="flex gap-2">
                {profile.isFriend && profile.publicItems.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPicking((v) => !v)
                      setSelected([])
                      setLens('wardrobe')
                    }}
                    className={picking ? 'btn-primary' : 'btn-ghost'}
                  >
                    {picking ? 'Cancel' : 'Style them'}
                  </button>
                )}
                {!profile.blockedByMe && (
                  <button type="button" onClick={() => void toggleFollow()} disabled={busy} className={profile.isFollowing ? 'btn-ghost' : 'btn-primary'}>
                    {profile.isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
                <MoreMenu
                  items={
                    profile.blockedByMe
                      ? [{ label: `Unblock ${who}`, onSelect: () => void safety('unblock') }]
                      : [
                          profile.mutedUntil
                            ? { label: 'Unmute', onSelect: () => void safety('unmute') }
                            : { label: 'Mute for 30 days', onSelect: () => void safety('mute') },
                          ...(profile.followsYou ? [{ label: 'Remove as a follower', onSelect: () => void safety('remove') }] : []),
                          { label: 'Report', onSelect: () => setReporting(true) },
                          { label: `Block ${who}`, danger: true, onSelect: () => void safety('block') },
                        ]
                  }
                />
              </div>
            )}
          </header>

          {profile.blockedByMe && (
            <div className="mt-8 rounded-[3px] border border-dashed border-ink/20 px-6 py-14 text-center">
              <p className="font-display text-2xl font-medium text-ink">You’ve blocked {who}</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">They can’t see you, you won’t see them, and any follows between you are gone. Undo it from the menu above.</p>
            </div>
          )}
          {profile.mutedUntil && !profile.blockedByMe && (
            <p className="mt-4 text-xs text-ink/50">
              Muted{profile.mutedUntil === 'forever' ? '' : ` until ${new Date(profile.mutedUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`} — their posts stay off your table.
            </p>
          )}

          {!profile.blockedByMe && (
          <>
          {/* ---- standing: earned, verified, never bought ---- */}
          <section aria-label="Standing" className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Standing n={profile.standing.picksWorn} title="A good eye" sub="picks that got worn" />
            <Standing n={profile.standing.recreated} title="Recreated" sub="looks copied into closets" />
            <Standing n={profile.standing.wouldWear} title="Would wear" sub="from the circle" />
            <Standing n={profile.standing.looksShared} title="Looks shared" sub="on the circle" />
          </section>

          {overlap && overlap.matchedCount > 0 && !profile.isMe && (
            <div className="plaque mt-6 p-5">
              <Plate>From your own closet</Plate>
              <p className="mt-1 font-display text-lg text-ink">
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
            <div className="mx-auto mt-5 flex max-w-2xl flex-col gap-4 lg:mx-0">
              {profile.looks.length === 0 && (
                <div className="rounded-[3px] border border-dashed border-ink/20 px-6 py-14 text-center">
                  <p className="font-display text-2xl font-medium text-ink">Nothing shared yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">
                    {profile.isMe ? 'Share a look from the Circle and it hangs here.' : 'When they share a look, it hangs here.'}
                  </p>
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
              {picking && (
                <div className="mt-5 rounded-[3px] border border-brass/30 bg-iris-soft/40 p-4">
                  <p className="text-sm text-ink/75">Tap 2–{MAX_PICK_ITEMS} of their pieces to build the look, add a note, and send.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="field flex-1 !py-2 !text-sm" placeholder="Why this works (optional)" maxLength={280} />
                    <button type="button" onClick={() => void handleSendPick()} disabled={selected.length < 2 || sending} className="btn-primary btn-sm disabled:opacity-40">
                      {sending ? 'Sending…' : `Send look (${selected.length})`}
                    </button>
                  </div>
                </div>
              )}
              {profile.publicItems.length === 0 ? (
                <div className="mt-5 rounded-[3px] border border-dashed border-ink/20 py-14 text-center text-sm text-ink/55">
                  Their public wardrobe is empty{profile.isMe ? ' — make pieces public from your Closet.' : '.'}
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {profile.publicItems.map((item) => {
                    const idx = selected.indexOf(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!picking}
                        onClick={() => toggleSelect(item.id)}
                        aria-pressed={picking ? idx >= 0 : undefined}
                        className={`press relative text-left ${picking ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <Arch aspect="aspect-[5/6]" bright={idx >= 0}>
                          <img src={resolveImageUrl(item.imageUrl)} alt={item.subtype ?? item.category} loading="lazy" className="relative z-[1] h-full w-full object-contain p-[7%]" />
                        </Arch>
                        {idx >= 0 && (
                          <span className="absolute right-2 top-2 z-[3] flex h-6 w-6 items-center justify-center rounded-[3px] bg-iris text-[11px] font-bold text-[rgb(26_21_9)]">{idx + 1}</span>
                        )}
                        <p className="mt-2 truncate text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/70">{item.subtype ?? item.category}</p>
                      </button>
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

      <Modal open={reporting} onClose={() => setReporting(false)} title={`Report ${who}`}>
        <p className="text-sm text-ink/60">Tell the house what’s wrong. They won’t know it came from you.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {REPORT_REASONS.map((r) => (
            <button key={r.key} type="button" onClick={() => setReason(r.key)} aria-pressed={reason === r.key} className="chip">
              {r.label}
            </button>
          ))}
        </div>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500} rows={3} className="field mt-4 !h-auto" placeholder="Anything else that helps (optional)" />
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
              <p className="rounded-[3px] border border-dashed border-ink/20 p-4 text-sm text-ink/55">Nothing in your closet matches this look yet.</p>
            )}
            {recreate.result.pairs.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
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

function Standing({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className={`plaque p-4 ${n === 0 ? 'opacity-60' : ''}`}>
      <p className="font-display text-3xl font-medium leading-none text-ink [font-variant-numeric:tabular-nums]">{n}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brass">{title}</p>
      <p className="text-[11px] text-ink/50">{sub}</p>
    </div>
  )
}

/** The "···" beside a person: the quiet actions, one list, closes on any choice or outside tap. */
function MoreMenu({ items }: { items: { label: string; danger?: boolean; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="btn-ghost !px-3 tracking-[0.2em]">
        ···
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden py-1">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-ink/5 ${it.danger ? 'text-red-600 dark:text-red-400' : 'text-ink/80'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
