import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from './ui'
import { Spinner } from './Spinner'
import {
  followUser,
  getHidden,
  getNetwork,
  getStyleTwins,
  searchUsers,
  unblockUser,
  unfollowUser,
  unmuteUser,
  type Hidden,
  type NetworkEntry,
  type StyleTwin,
} from '@zauq/shared/social'

// The people in your circle — a searchable drawer with tabs, never a wall
// of chips. Rows, not badges, so it scales to hundreds.

export type PeopleTab = 'following' | 'followers' | 'find' | 'suggested' | 'hidden'

/** Two letters from a name ("Sam K." → SK), or from the handle when that's all there is. */
export function initialsOf(name?: string | null, handle?: string | null): string {
  const n = (name ?? '').trim()
  if (n) {
    const parts = n.replace(/\./g, '').split(/\s+/).filter(Boolean)
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
  }
  return (handle ?? '?').slice(0, 2).toUpperCase()
}

export function Initials({ handle, name, className = '' }: { handle: string | null; name?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-[3px] bg-iris text-[11px] font-bold text-on-brass ${className}`}
    >
      {initialsOf(name, handle)}
    </span>
  )
}

function PersonRow({
  handle,
  name,
  sub,
  following,
  onToggle,
  onNavigate,
}: {
  handle: string
  name: string
  sub?: string
  following: boolean | null
  onToggle?: () => Promise<void>
  onNavigate: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-3 border-t border-ink/10 py-3 first:border-t-0">
      <Link to={`/u/${handle}`} onClick={onNavigate} className="press flex min-w-0 flex-1 items-center gap-3">
        <Initials handle={handle} name={name} className="h-9 w-9" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{name}</span>
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
          className={`btn-ghost btn-sm shrink-0 ${
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
  const [hidden, setHidden] = useState<Hidden | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ handle: string; name: string }[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return
    void getNetwork().then(setNetwork).catch(() => setNetwork({ following: [], followers: [] }))
    void getStyleTwins().then(({ twins: t }) => setTwins(t ?? [])).catch(() => setTwins([]))
    void getHidden().then(setHidden).catch(() => setHidden({ blocked: [], muted: [] }))
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
    setNote(null)
    try {
      if (followingSet.has(handle)) {
        await unfollowUser(handle)
        setNetwork((n) => (n ? { ...n, following: n.following.filter((u) => u.handle !== handle) } : n))
      } else {
        const { isFriend } = await followUser(handle)
        const known = network?.followers.find((u) => u.handle === handle) ?? twins?.find((t) => t.handle === handle) ?? results.find((r) => r.handle === handle)
        setNetwork((n) => (n ? { ...n, following: [{ handle, name: known?.name ?? handle, isFriend }, ...n.following] } : n))
        setTwins((t) => (t ? t.map((x) => (x.handle === handle ? { ...x, isFollowing: true } : x)) : t))
      }
      onChanged?.()
    } catch {
      setNote('Couldn’t update that. Check your connection and try again.')
    }
  }

  const tabs: { key: PeopleTab; label: string; count?: number }[] = [
    { key: 'following', label: 'Following', count: network?.following.length },
    { key: 'followers', label: 'Followers', count: network?.followers.length },
    { key: 'suggested', label: 'Kindred taste', count: twins?.length },
    { key: 'find', label: 'Find' },
    ...((hidden?.blocked.length ?? 0) + (hidden?.muted.length ?? 0) > 0 ? [{ key: 'hidden' as const, label: 'Hidden', count: hidden!.blocked.length + hidden!.muted.length }] : []),
  ]

  async function unhide(kind: 'mute' | 'block', handle: string) {
    setNote(null)
    try {
      if (kind === 'mute') await unmuteUser(handle)
      else await unblockUser(handle)
      setHidden((h) => (h ? { blocked: kind === 'block' ? h.blocked.filter((b) => b.handle !== handle) : h.blocked, muted: kind === 'mute' ? h.muted.filter((m) => m.handle !== handle) : h.muted } : h))
      onChanged?.()
    } catch {
      setNote('Couldn’t update that. Check your connection and try again.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Your people">
      <div role="tablist" aria-label="People" className="tabs -mt-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="tab press"
          >
            {t.label}
            {typeof t.count === 'number' ? <span className="count">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {note && (
        <p className="mt-3 alert-error !py-2 text-xs" role="alert">{note}</p>
      )}

      {tab === 'find' && (
        <div className="mt-4">
          <label htmlFor="people-search" className="sr-only">
            Find people by name
          </label>
          <input
            id="people-search"
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field"
            placeholder="Search by name…"
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
                name={u.name}
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
                name={u.name}
                sub={u.isFriend ? 'Friends, you follow each other' : undefined}
                following={followingSet.has(u.handle)}
                onToggle={() => toggle(u.handle)}
                onNavigate={onClose}
              />
            ))}
        </div>
      )}

      {tab === 'hidden' && hidden && (
        <div className="mt-2">
          <p className="pb-2 text-xs text-ink/50">People you’ve muted or blocked. They don’t know; you can undo it here.</p>
          {hidden.muted.map((m) => (
            <div key={`m-${m.handle}`} className="flex items-center gap-3 border-t border-ink/10 py-3 first:border-t-0">
              <Initials handle={m.handle} name={m.name} className="h-9 w-9 opacity-60" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{m.name}</span>
                <span className="block truncate text-xs text-ink/50">
                  Muted{m.until ? ` until ${new Date(m.until).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                </span>
              </span>
              <button type="button" onClick={() => void unhide('mute', m.handle ?? '')} className="btn-ghost btn-sm shrink-0">
                Unmute
              </button>
            </div>
          ))}
          {hidden.blocked.map((b) => (
            <div key={`b-${b.handle}`} className="flex items-center gap-3 border-t border-ink/10 py-3 first:border-t-0">
              <Initials handle={b.handle} name={b.name} className="h-9 w-9 opacity-60" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{b.name}</span>
                <span className="block truncate text-xs text-ink/50">Blocked. Invisible both ways</span>
              </span>
              <button type="button" onClick={() => void unhide('block', b.handle ?? '')} className="btn-ghost btn-sm shrink-0">
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'suggested' && (
        <div className="mt-2">
          <p className="pb-2 text-xs text-ink/50">Matched by wardrobe and taste, not follower counts.</p>
          {twins === null && (
            <div className="py-8 text-center text-ink/40">
              <Spinner className="h-5 w-5" />
            </div>
          )}
          {twins && twins.length === 0 && (
            <p className="py-8 text-center text-sm text-ink/50">No matches yet. Take the style quiz and fill your closet.</p>
          )}
          {twins?.map((t) => (
            <PersonRow
              key={t.handle}
              handle={t.handle}
              name={t.name}
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
