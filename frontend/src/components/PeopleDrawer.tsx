import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from './ui'
import { Spinner } from './Spinner'
import {
  followUser,
  getNetwork,
  getStyleTwins,
  searchUsers,
  unfollowUser,
  type NetworkEntry,
  type StyleTwin,
} from '../lib/social'

// The people in your circle — a searchable drawer with tabs, never a wall
// of chips. Rows, not badges, so it scales to hundreds.

export type PeopleTab = 'following' | 'followers' | 'find' | 'suggested'

export function Initials({ handle, className = '' }: { handle: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-[3px] bg-iris text-[11px] font-bold text-[rgb(26_21_9)] ${className}`}
    >
      {(handle ?? '?').slice(0, 2).toUpperCase()}
    </span>
  )
}

function PersonRow({
  handle,
  sub,
  following,
  onToggle,
  onNavigate,
}: {
  handle: string
  sub?: string
  following: boolean | null
  onToggle?: () => Promise<void>
  onNavigate: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-3 border-t border-ink/10 py-3 first:border-t-0">
      <Link to={`/u/${handle}`} onClick={onNavigate} className="press flex min-w-0 flex-1 items-center gap-3">
        <Initials handle={handle} className="h-9 w-9" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">@{handle}</span>
          {sub && <span className="block truncate text-xs text-ink/50">{sub}</span>}
        </span>
      </Link>
      {onToggle && following !== null && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void onToggle().finally(() => setBusy(false))
          }}
          className={`press shrink-0 rounded-[3px] border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            following
              ? 'border-ink/15 text-ink/60 hover:border-ink/40'
              : 'border-brass/60 text-brass hover:bg-iris-soft'
          }`}
        >
          {busy ? '…' : following ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  )
}

export function PeopleDrawer({
  open,
  onClose,
  initialTab = 'following',
  onChanged,
}: {
  open: boolean
  onClose: () => void
  initialTab?: PeopleTab
  onChanged?: () => void
}) {
  const [tab, setTab] = useState<PeopleTab>(initialTab)
  const [network, setNetwork] = useState<{ following: NetworkEntry[]; followers: NetworkEntry[] } | null>(null)
  const [twins, setTwins] = useState<StyleTwin[] | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ handle: string }[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return
    void getNetwork().then(setNetwork).catch(() => setNetwork({ following: [], followers: [] }))
    void getStyleTwins().then(({ twins: t }) => setTwins(t ?? [])).catch(() => setTwins([]))
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchUsers(q)
        .then(({ users }) => setResults(users ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const followingSet = new Set((network?.following ?? []).map((u) => u.handle))

  async function toggle(handle: string) {
    if (followingSet.has(handle)) {
      await unfollowUser(handle)
      setNetwork((n) => (n ? { ...n, following: n.following.filter((u) => u.handle !== handle) } : n))
    } else {
      const { isFriend } = await followUser(handle)
      setNetwork((n) => (n ? { ...n, following: [{ handle, isFriend }, ...n.following] } : n))
      setTwins((t) => (t ? t.map((x) => (x.handle === handle ? { ...x, isFollowing: true } : x)) : t))
    }
    onChanged?.()
  }

  const tabs: { key: PeopleTab; label: string; count?: number }[] = [
    { key: 'following', label: 'Following', count: network?.following.length },
    { key: 'followers', label: 'Followers', count: network?.followers.length },
    { key: 'suggested', label: 'Kindred taste', count: twins?.length },
    { key: 'find', label: 'Find' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Your people">
      <div role="tablist" aria-label="People" className="-mt-1 flex flex-wrap gap-1 border-b border-ink/10 pb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-[2px] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/40 ${
              tab === t.key ? 'bg-brass text-[rgb(26_21_9)]' : 'text-ink/55 hover:text-ink'
            }`}
          >
            {t.label}
            {typeof t.count === 'number' ? <span className="ml-1 opacity-70">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'find' && (
        <div className="mt-4">
          <label htmlFor="people-search" className="sr-only">
            Find people by handle
          </label>
          <input
            id="people-search"
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field"
            placeholder="Search by handle…"
          />
          <div className="mt-2">
            {searching && (
              <div className="py-6 text-center text-ink/40">
                <Spinner className="h-5 w-5" />
              </div>
            )}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="py-6 text-center text-sm text-ink/50">No one goes by that yet.</p>
            )}
            {results.map((u) => (
              <PersonRow
                key={u.handle}
                handle={u.handle}
                following={followingSet.has(u.handle)}
                onToggle={() => toggle(u.handle)}
                onNavigate={onClose}
              />
            ))}
          </div>
        </div>
      )}

      {(tab === 'following' || tab === 'followers') && (
        <div className="mt-2">
          {network === null && (
            <div className="py-8 text-center text-ink/40">
              <Spinner className="h-5 w-5" />
            </div>
          )}
          {network && (tab === 'following' ? network.following : network.followers).length === 0 && (
            <p className="py-8 text-center text-sm text-ink/50">
              {tab === 'following' ? 'You aren’t following anyone yet.' : 'No followers yet.'}
            </p>
          )}
          {network &&
            (tab === 'following' ? network.following : network.followers).map((u) => (
              <PersonRow
                key={u.handle}
                handle={u.handle}
                sub={u.isFriend ? 'Friends — you follow each other' : undefined}
                following={followingSet.has(u.handle)}
                onToggle={() => toggle(u.handle)}
                onNavigate={onClose}
              />
            ))}
        </div>
      )}

      {tab === 'suggested' && (
        <div className="mt-2">
          <p className="pb-2 text-xs text-ink/50">Matched by wardrobe and taste — not follower counts.</p>
          {twins === null && (
            <div className="py-8 text-center text-ink/40">
              <Spinner className="h-5 w-5" />
            </div>
          )}
          {twins && twins.length === 0 && (
            <p className="py-8 text-center text-sm text-ink/50">No matches yet — take the style quiz and fill your closet.</p>
          )}
          {twins?.map((t) => (
            <PersonRow
              key={t.handle}
              handle={t.handle}
              sub={t.sharedTaste.length > 0 ? `You both: ${t.sharedTaste.join(' · ')}` : `${t.match}% match`}
              following={t.isFollowing || followingSet.has(t.handle)}
              onToggle={() => toggle(t.handle)}
              onNavigate={onClose}
            />
          ))}
        </div>
      )}
    </Modal>
  )
}
