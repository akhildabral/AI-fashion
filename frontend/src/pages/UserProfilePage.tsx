import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  followUser,
  getOverlap,
  getProfileByHandle,
  sendPick,
  unfollowUser,
  type OverlapResult,
  type PublicProfile,
} from '../lib/social'
import { Spinner } from '../components/Spinner'
import { ZoomableImage } from '../components/ImageLightbox'

const MAX_PICK_ITEMS = 8

/** Someone else's profile: their public wardrobe, follow, and — between
 * friends — assembling an outfit for them. */
export function UserProfilePage() {
  const { handle = '' } = useParams()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [overlap, setOverlap] = useState<OverlapResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Friend-pick composition.
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    setProfile(null)
    setError(null)
    getProfileByHandle(handle)
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        if (!p.isMe && p.publicItems.length > 0) {
          void getOverlap(handle)
            .then((o) => {
              if (!cancelled) setOverlap(o)
            })
            .catch(() => {})
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Profile not found.')
      })
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
        setProfile({
          ...profile,
          isFollowing: false,
          isFriend: false,
          counts: { ...profile.counts, followers: profile.counts.followers - 1 },
        })
      } else {
        const { isFriend } = await followUser(handle)
        setProfile({
          ...profile,
          isFollowing: true,
          isFriend,
          counts: { ...profile.counts, followers: profile.counts.followers + 1 },
        })
      }
    } catch {
      // Leave state as-is.
    } finally {
      setBusy(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length >= MAX_PICK_ITEMS
          ? prev
          : [...prev, id],
    )
  }

  async function handleSendPick() {
    if (sending || selected.length < 2) return
    setSending(true)
    try {
      await sendPick(handle, { itemIds: selected, note: note.trim() || undefined })
      setSent(true)
      setPicking(false)
      setSelected([])
      setNote('')
      setTimeout(() => setSent(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your pick.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {!profile && !error && (
        <div className="flex min-h-[40vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/50">
          <p>{error}</p>
          <Link to="/friends" className="mt-3 inline-block text-sm text-clay hover:underline">
            ← Back to Friends
          </Link>
        </div>
      )}

      {profile && (
        <>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-4xl font-semibold text-ink">
                @{profile.user.handle}
              </h1>
              <p className="mt-2 text-sm text-ink/55">
                {profile.counts.followers} follower{profile.counts.followers === 1 ? '' : 's'} ·
                following {profile.counts.following} · {profile.counts.publicItems} public item
                {profile.counts.publicItems === 1 ? '' : 's'}
                {profile.followsYou && !profile.isMe ? ' · follows you' : ''}
                {profile.isFriend ? ' · friends ✓' : ''}
              </p>
            </div>
            {!profile.isMe && (
              <div className="flex gap-2">
                {profile.isFriend && profile.publicItems.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPicking((v) => !v)
                      setSelected([])
                    }}
                    className={picking ? 'btn-primary' : 'btn-ghost'}
                  >
                    {picking ? 'Cancel' : 'Pick an outfit for them'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void toggleFollow()}
                  disabled={busy}
                  className={profile.isFollowing ? 'btn-ghost' : 'btn-primary'}
                >
                  {profile.isFollowing ? 'Following ✓' : 'Follow'}
                </button>
              </div>
            )}
          </div>

          {overlap && overlap.matchedCount > 0 && (
            <div className="mb-8 rounded-2xl border border-ink/10 bg-surface p-5 ">
              <p className="font-medium text-ink">
                You could recreate {overlap.matchedCount} of their {overlap.theirCount} public
                piece{overlap.theirCount === 1 ? '' : 's'} from your own wardrobe
              </p>
              <div className="mt-4 flex flex-wrap gap-6">
                {overlap.matches.slice(0, 6).map((m) => (
                  <div key={m.theirs.id} className="flex items-center gap-2">
                    <div className="h-16 w-16 overflow-hidden rounded-lg border border-ink/10 bg-bone">
                      <img
                        src={m.theirs.imageUrl}
                        alt={m.theirs.subtype ?? m.theirs.category}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-ink/35">≈</span>
                    <div className="h-16 w-16 overflow-hidden rounded-lg border-2 border-sage/60 bg-bone">
                      <img
                        src={m.yours.imageUrl}
                        alt="Your similar piece"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink/45">Theirs on the left, your closest match on the right.</p>
            </div>
          )}

          {sent && (
            <p className="mb-6 rounded-2xl border border-sage/40 bg-sage/10 px-5 py-3 text-sm text-ink/75">
              Outfit sent — it's waiting in their picks ✓
            </p>
          )}

          {picking && (
            <div className="mb-8 rounded-2xl border border-clay/30 bg-clay/10 p-5">
              <p className="text-sm text-ink/75">
                Tap 2–{MAX_PICK_ITEMS} of their pieces to build the outfit, add a note, and send.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="field flex-1"
                  placeholder="Why this works (optional)"
                  maxLength={280}
                />
                <button
                  type="button"
                  onClick={() => void handleSendPick()}
                  disabled={selected.length < 2 || sending}
                  className="btn-primary disabled:opacity-40"
                >
                  {sending ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Sending…
                    </>
                  ) : (
                    `Send outfit (${selected.length})`
                  )}
                </button>
              </div>
            </div>
          )}

          {profile.publicItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/50">
              <p>Their public wardrobe is empty{profile.isMe ? ' — publish items from your Wardrobe page.' : '.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
              {profile.publicItems.map((item) => {
                const selectedIndex = selected.indexOf(item.id)
                return (
                  <div
                    key={item.id}
                    className={
                      selectedIndex >= 0
                        ? 'relative overflow-hidden rounded-2xl border-2 border-clay bg-surface shadow-md'
                        : 'relative overflow-hidden rounded-2xl border border-ink/10 bg-surface '
                    }
                  >
                    {picking && (
                      <button
                        type="button"
                        onClick={() => toggleSelect(item.id)}
                        className="absolute inset-0 z-10"
                        aria-label={selectedIndex >= 0 ? 'Deselect' : 'Select'}
                      >
                        {selectedIndex >= 0 && (
                          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-clay text-sm font-medium text-white">
                            {selectedIndex + 1}
                          </span>
                        )}
                      </button>
                    )}
                    <div className="aspect-square bg-bone">
                      <ZoomableImage src={item.imageUrl} alt={item.subtype ?? item.category} />
                    </div>
                    <p className="truncate px-3 py-2 text-center text-xs capitalize text-ink/60">
                      {item.subtype ?? item.category}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
