import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { Arch, Modal, PageShell, Toast, useFlash } from '../components/ui'
import { Spinner } from '../components/Spinner'
import { Initials } from '../components/PeopleDrawer'
import { GarmentThumb, LookCard, Plate } from '../components/CircleCards'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { recreateFromCloset, type RecreateResponse } from '../lib/brief'
import { followUser, getOverlap, getProfileByHandle, sendPick, unfollowUser, type OverlapResult, type PublicProfile } from '../lib/social'
import { reactToLook, saveLook, unreactToLook, unsaveLook, type LookPost, type PostItem, type ReactionKind } from '../lib/circle'

const MAX_PICK_ITEMS = 8

// Someone's room: the looks they've shared (the gallery), their earned
// standing, their public wardrobe — and, between friends, the act of
// dressing them.

type Lens = 'looks' | 'wardrobe'

export function UserProfilePage() {
  const { toast, flash } = useFlash()
  const { handle = '' } = useParams()
  usePageTitle(handle ? `@${handle}` : 'Profile')
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
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

  async function handleReact(id: string, kind: ReactionKind | null) {
    try {
      const { reactions } = kind ? await reactToLook(id, kind) : await unreactToLook(id)
      patchLook(id, (p) => ({ ...p, reactions }))
    } catch {
      flash('Could not react to that.')
    }
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
      await apiFetch('/outfits', { method: 'POST', body: { itemIds: ids, provenance: 'copied', rationale: `Recreated from @${handle}'s look` } })
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
              <Initials handle={profile.user.handle} className="h-16 w-16 !text-xl sm:h-20 sm:w-20" />
              <div>
                <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">
                  {profile.isMe ? 'Your room' : profile.isFriend ? 'A friend' : profile.followsYou ? 'Follows you' : 'In the circle'}
                </p>
                <h1 className="mt-1 animate-rise-1 font-display text-4xl font-medium text-ink sm:text-5xl">@{profile.user.handle}</h1>
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
                <button type="button" onClick={() => void toggleFollow()} disabled={busy} className={profile.isFollowing ? 'btn-ghost' : 'btn-primary'}>
                  {profile.isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>
            )}
          </header>

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
          <div role="tablist" aria-label="Profile view" className="mt-8 inline-flex rounded-[3px] border border-ink/15 bg-surface p-1">
            {(['looks', 'wardrobe'] as Lens[]).map((l) => (
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
                {l === 'looks' ? `Looks · ${profile.looks.length}` : `Wardrobe · ${profile.publicItems.length}`}
              </button>
            ))}
          </div>

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
                <LookCard
                  key={p.id}
                  post={p}
                  onReact={handleReact}
                  onSave={handleSave}
                  onRecreate={openRecreate}
                  onError={flash}
                  onCommentCount={(id, n) => patchLook(id, (x) => ({ ...x, comments: n }))}
                />
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
                    <button type="button" onClick={() => void handleSendPick()} disabled={selected.length < 2 || sending} className="btn-primary !py-2 !text-sm disabled:opacity-40">
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

      <Modal open={recreate !== null} onClose={() => setRecreate(null)} title={`In your closet, @${handle}'s look`}>
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
                <button type="button" onClick={() => navigate(`/mirror?items=${recreate.result!.pairs.map((p) => p.match.id).join(',')}`)} className="btn-primary !px-4 !py-2 !text-sm">
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

function Standing({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className={`plaque p-4 ${n === 0 ? 'opacity-60' : ''}`}>
      <p className="font-display text-3xl font-medium leading-none text-ink [font-variant-numeric:tabular-nums]">{n}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brass">{title}</p>
      <p className="text-[11px] text-ink/50">{sub}</p>
    </div>
  )
}
