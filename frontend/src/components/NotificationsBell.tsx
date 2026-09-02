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
    default:
      return { text: `${who} did something.`, to: '/circle' }
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
            {items.map((n) => {
              const l = line(n)
              return (
                <li key={n.id} className="border-t border-ink/10 first:border-t-0">
                  <Link
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="press flex items-center gap-3 py-3 transition-colors hover:text-brass"
                  >
                    <Initials handle={n.actorHandle} className="h-9 w-9" />
                    <span className={`min-w-0 flex-1 text-sm ${n.read ? 'text-ink/70' : 'font-medium text-ink'}`}>
                      {l.text}
                    </span>
                    <span className="shrink-0 text-xs text-ink/40">{timeAgo(n.at)}</span>
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
