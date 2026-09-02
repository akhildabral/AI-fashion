import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Modal } from './ui'
import { Spinner } from './Spinner'
import { Initials } from './PeopleDrawer'
import {
  getNotifications,
  getUnreadCount,
  markNotificationsRead,
  timeAgo,
  type Notification,
} from '../lib/circle'

// Things that happened to you live here, behind the bell — never as feed
// cards. Polled gently; opening the bell marks everything read.

const POLL_MS = 60_000

function line(n: Notification): { text: string; to: string } {
  const who = n.actorHandle ? `@${n.actorHandle}` : 'Someone'
  const profile = n.actorHandle ? `/u/${n.actorHandle}` : '/circle'
  switch (n.type) {
    case 'new_follower':
      return { text: `${who} started following your closet.`, to: profile }
    case 'pick_received':
      return { text: `${who} styled a look for you.`, to: '/circle' }
    case 'pick_worn':
      return { text: `${who} wore the look you picked — a good eye.`, to: profile }
    case 'look_reacted': {
      const kind = String(n.payload.kind ?? '')
      const verb = kind === 'bold' ? 'called your look bold' : kind === 'love' ? 'loved your look' : 'would wear your look'
      return { text: `${who} ${verb}.`, to: '/circle' }
    }
    case 'look_recreated':
      return { text: `${who} recreated your look from their own closet.`, to: profile }
    case 'commented': {
      const preview = String(n.payload.preview ?? '')
      return { text: `${who} left a note on your ${n.payload.target === 'verdict' ? 'verdict' : 'look'}${preview ? `: “${preview}”` : '.'}`, to: '/circle' }
    }
    case 'mentioned':
      return { text: `${who} mentioned you in a note.`, to: '/circle' }
    case 'verdict_settled': {
      const w = n.payload.winner ? String(n.payload.winner).toUpperCase() : null
      const q = String(n.payload.question ?? 'your verdict')
      const mine = !n.actorHandle
      return {
        text: mine
          ? w ? `The verdict is in on “${q}”: ${w} won.` : `The verdict is in on “${q}” — a split. Your call.`
          : w ? `${who}’s verdict settled: ${w} won.` : `${who}’s verdict settled in a split.`,
        to: '/circle',
      }
    }
    case 'laundry_due': {
      const n2 = Number(n.payload.count ?? 0)
      return { text: `${n2} pieces in the wash — worth a load. The stylist is working around them.`, to: '/closet/basket' }
    }
    case 'wishlist_nudge': {
      const what = String(n.payload.label ?? 'that piece')
      return { text: `Still thinking about the ${what}? It’s waiting in your wishlist.`, to: '/closet/wishlist' }
    }
    default:
      return { text: `${who} did something.`, to: '/circle' }
  }
}

const DIGEST_TYPES = new Set<Notification['type']>(['new_follower', 'look_reacted', 'look_recreated'])

interface Digest {
  key: string
  type: Notification['type']
  handles: string[]
  count: number
  at: string
  read: boolean
  first: Notification
}

/** Collapse runs of the same low-value event on the same day — "@a, @b and 3 others…" */
function digest(items: Notification[]): Digest[] {
  const out: Digest[] = []
  for (const n of items) {
    const day = n.at.slice(0, 10)
    const key = DIGEST_TYPES.has(n.type) ? `${n.type}:${day}` : n.id
    const last = out[out.length - 1]
    if (last && last.key === key) {
      last.count++
      if (n.actorHandle && !last.handles.includes(n.actorHandle)) last.handles.push(n.actorHandle)
      last.read = last.read && n.read
      continue
    }
    out.push({ key, type: n.type, handles: n.actorHandle ? [n.actorHandle] : [], count: 1, at: n.at, read: n.read, first: n })
  }
  return out
}

function digestLine(d: Digest): { text: string; to: string } {
  if (d.count === 1) return line(d.first)
  const shown = d.handles.slice(0, 2).map((h) => `@${h}`)
  const rest = d.count - shown.length
  const who = shown.length === 0 ? `${d.count} people` : rest > 0 ? `${shown.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}` : shown.join(' and ')
  switch (d.type) {
    case 'new_follower':
      return { text: `${who} started following your closet.`, to: '/circle' }
    case 'look_reacted':
      return { text: `${who} reacted to your looks.`, to: '/circle' }
    case 'look_recreated':
      return { text: `${who} recreated your looks from their own closets.`, to: '/circle' }
    default:
      return line(d.first)
  }
}

export function NotificationsBell() {
  const { pathname } = useLocation()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[] | null>(null)

  useEffect(() => {
    let alive = true
    const tick = () => {
      void getUnreadCount()
        .then((r) => alive && setUnread(r.unread))
        .catch(() => undefined)
    }
    tick()
    const id = window.setInterval(tick, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [pathname])

  function openBell() {
    setOpen(true)
    setItems(null)
    void getNotifications()
      .then((r) => {
        setItems(r.items)
        if (r.unread > 0) {
          setUnread(0)
          void markNotificationsRead().catch(() => undefined)
        }
      })
      .catch(() => setItems([]))
  }

  return (
    <>
      <button
        type="button"
        onClick={openBell}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="press relative flex h-9 w-9 items-center justify-center rounded-[3px] border border-ink/15 text-ink/60 transition-colors hover:border-brass hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-iris px-1 text-[9px] font-bold text-[rgb(26_21_9)]"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="What happened">
        {items === null && (
          <div className="py-10 text-center text-ink/40">
            <Spinner className="h-5 w-5" />
          </div>
        )}
        {items && items.length === 0 && (
          <p className="py-10 text-center text-sm text-ink/50">Nothing yet. When your circle reacts, it lands here.</p>
        )}
        {items && items.length > 0 && (
          <ul className="-mt-1">
            {digest(items).map((d) => {
              const l = digestLine(d)
              return (
                <li key={d.key} className="border-t border-ink/10 first:border-t-0">
                  <Link
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="press flex items-center gap-3 py-3 transition-colors hover:text-brass"
                  >
                    <Initials handle={d.handles[0] ?? null} className="h-9 w-9" />
                    <span className={`min-w-0 flex-1 text-sm ${d.read ? 'text-ink/70' : 'font-medium text-ink'}`}>
                      {l.text}
                    </span>
                    <span className="shrink-0 text-xs text-ink/40">{timeAgo(d.at)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
    </>
  )
}
