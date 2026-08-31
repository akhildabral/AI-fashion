import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  dismissPick,
  getNetwork,
  getPicks,
  getSocialMe,
  searchUsers,
  setHandle,
  type FriendPick,
  type NetworkEntry,
  type SocialMe,
} from '../lib/social'
import { logWear } from '../lib/wearlog'
import { Spinner } from '../components/Spinner'
import { ZoomableImage } from '../components/ImageLightbox'

function HandleCard({ me, onSet }: { me: SocialMe; onSet: (h: string) => void }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
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

  if (me.handle) return null
  return (
    <div className="mb-8 rounded-2xl border border-clay/30 bg-clay/10 p-6">
      <h2 className="font-serif text-2xl font-semibold text-ink">Pick your handle</h2>
      <p className="mt-1.5 text-sm text-ink/60">
        Your name in the community — friends find and follow you by it.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-1 rounded-lg border border-ink/15 bg-white px-3">
          <span className="text-ink/40">@</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border-0 bg-transparent py-2.5 text-sm outline-none"
            placeholder="your_handle"
            minLength={3}
            maxLength={20}
            required
          />
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Claim it'}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  )
}

function PickCard({ pick, onGone }: { pick: FriendPick; onGone: (id: string) => void }) {
  const [logged, setLogged] = useState(false)

  return (
    <article className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <p className="text-sm text-ink/70">
        <Link to={`/u/${pick.byHandle}`} className="font-medium text-clay hover:underline">
          @{pick.byHandle}
        </Link>{' '}
        picked this for you
      </p>
      {pick.note && <p className="mt-1 text-sm italic text-ink/60">“{pick.note}”</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        {pick.items.map((item) => (
          <div key={item.id} className="w-20">
            <div className="aspect-square overflow-hidden rounded-lg border border-ink/10 bg-bone">
              <ZoomableImage src={item.imageUrl} alt={item.subtype ?? item.category} />
            </div>
            <p className="mt-1 truncate text-center text-xs capitalize text-ink/60">
              {item.subtype ?? item.category}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={logged || pick.items.length === 0}
          onClick={() => {
            void logWear({ itemIds: pick.items.map((i) => i.id) })
              .then(() => setLogged(true))
              .catch(() => {})
          }}
          className={
            logged
              ? 'inline-flex items-center rounded-full border border-sage/40 bg-sage/10 px-4 py-1.5 text-sm text-sage'
              : 'btn-ghost'
          }
        >
          {logged ? 'Logged ✓' : 'I wore it'}
        </button>
        <button
          type="button"
          onClick={() => {
            void dismissPick(pick.id)
              .then(() => onGone(pick.id))
              .catch(() => {})
          }}
          className="text-xs text-ink/35 transition hover:text-red-600"
        >
          Dismiss
        </button>
      </div>
    </article>
  )
}

export function FriendsPage() {
  const [me, setMe] = useState<SocialMe | null>(null)
  const [network, setNetwork] = useState<{ following: NetworkEntry[]; followers: NetworkEntry[] } | null>(null)
  const [picks, setPicks] = useState<FriendPick[] | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ handle: string }[]>([])

  useEffect(() => {
    void getSocialMe().then(setMe).catch(() => setMe(null))
    void getNetwork().then(setNetwork).catch(() => null)
    void getPicks().then(({ picks: p }) => setPicks(p ?? [])).catch(() => setPicks([]))
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      void searchUsers(q).then(({ users }) => setResults(users ?? [])).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Friends
        </h1>
        <p className="mt-3 text-ink/60">
          Follow people, browse their public wardrobes, and dress each other. Friends are
          people who follow each other back.
        </p>
      </div>

      {!me && (
        <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {me && (
        <>
          <HandleCard me={me} onSet={(h) => setMe({ ...me, handle: h })} />

          {me.handle && (
            <p className="mb-8 text-sm text-ink/55">
              You are <span className="font-medium text-ink">@{me.handle}</span> ·{' '}
              {me.followers} follower{me.followers === 1 ? '' : 's'} · following {me.following}
            </p>
          )}

          {/* Search */}
          <section className="mb-10">
            <label htmlFor="friend-search" className="label">
              Find people
            </label>
            <input
              id="friend-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field max-w-md"
              placeholder="Search by handle…"
            />
            {results.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {results.map((u) => (
                  <Link
                    key={u.handle}
                    to={`/u/${u.handle}`}
                    className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm text-ink/75 transition hover:border-clay/50"
                  >
                    @{u.handle}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Picks inbox */}
          {picks && picks.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 font-serif text-2xl font-semibold text-ink">
                Picked for you
              </h2>
              <div className="space-y-4">
                {picks.map((pick) => (
                  <PickCard
                    key={pick.id}
                    pick={pick}
                    onGone={(id) => setPicks((prev) => prev?.filter((p) => p.id !== id) ?? prev)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Network */}
          {network && (network.following.length > 0 || network.followers.length > 0) && (
            <section className="grid gap-8 sm:grid-cols-2">
              <div>
                <h2 className="mb-3 font-serif text-xl font-semibold text-ink">
                  Following · {network.following.length}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {network.following.map((u) => (
                    <Link
                      key={u.handle}
                      to={`/u/${u.handle}`}
                      className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm text-ink/75 transition hover:border-clay/50"
                    >
                      @{u.handle} {u.isFriend ? '· friends' : ''}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="mb-3 font-serif text-xl font-semibold text-ink">
                  Followers · {network.followers.length}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {network.followers.map((u) => (
                    <Link
                      key={u.handle}
                      to={`/u/${u.handle}`}
                      className="rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm text-ink/75 transition hover:border-clay/50"
                    >
                      @{u.handle} {u.isFriend ? '· friends' : ''}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
