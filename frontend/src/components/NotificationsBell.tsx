import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
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

/** Where a notification lands: the post it's about when the payload names one. */
function landing(n: Notification, fallback: string): string {
  const t = n.payload.target
  const id = n.payload.targetId
  if (typeof t === 'string' && typeof id === 'string') return `/circle?focus=${t}:${id}`
  if (typeof n.payload.wearLogId === 'string') return `/circle?focus=look:${n.payload.wearLogId}`
  if (typeof n.payload.pickId === 'string') return `/circle?focus=pick:${n.payload.pickId}`
  if (typeof n.payload.pollId === 'string') return `/circle?focus=verdict:${n.payload.pollId}`
  return fallback
}

function line(n: Notification): { text: string; to: string } {
  const who = n.actorName ?? n.actorHandle ?? 'Someone'
  const profile = n.actorHandle ? `/u/${n.actorHandle}` : '/circle'
  switch (n.type) {
    case 'new_follower':
      return { text: `${who} started following your closet.`, to: profile }
    case 'invite_joined':
      return { text: `${who} came in on your invite. You follow each other now.`, to: profile }
    case 'pick_received':
      return { text: `${who} styled a look for you.`, to: landing(n, '/circle') }
    case 'pick_thanked': {
      const preview = String(n.payload.preview ?? '')
      return { text: `${who} said thanks for the look you picked${preview ? `: “${preview}”` : '.'}`, to: landing(n, '/circle') }
    }
    case 'pick_worn':
      return { text: `${who} wore the look you picked. Good eye.`, to: landing(n, profile) }
    case 'look_reacted': {
      const kind = String(n.payload.kind ?? '')
      const what = n.payload.target === 'verdict' ? 'your verdict' : n.payload.target === 'pick' ? 'the look you picked' : 'your look'
      const verb = kind === 'bold' ? `called ${what} bold` : kind === 'love' ? `loved ${what}` : `would wear ${what}`
      return { text: `${who} ${verb}.`, to: landing(n, '/circle') }
    }
    case 'look_recreated':
      return { text: `${who} recreated your look from their own closet.`, to: profile }
    case 'commented': {
      const preview = String(n.payload.preview ?? '')
      const on = n.payload.target === 'verdict' ? 'your verdict' : n.payload.target === 'pick' ? 'a pick' : 'your look'
      return { text: `${who} left a note on ${on}${preview ? `: “${preview}”` : '.'}`, to: landing(n, '/circle') }
    }
    case 'mentioned':
      return { text: `${who} mentioned you in a note.`, to: landing(n, '/circle') }
    case 'verdict_asked': {
      const q = String(n.payload.question ?? 'which one')
      return { text: `${who} asked you: “${q}”`, to: landing(n, '/circle') }
    }
    case 'verdict_settled': {
      const w = n.payload.winner ? String(n.payload.winner).toUpperCase() : null
      const q = String(n.payload.question ?? 'your verdict')
      const mine = !n.actorHandle
      return {
        text: mine
          ? w ? `The verdict is in on “${q}”: ${w} won.` : `The verdict’s in on “${q}”: a dead split. Your call.`
          : w ? `${who}’s verdict settled: ${w} won.` : `${who}’s verdict settled in a split.`,
        to: landing(n, '/circle'),
      }
    }
    case 'laundry_due': {
      const n2 = Number(n.payload.count ?? 0)
      return { text: `${n2} pieces in the wash, worth a load. The stylist’s working around them.`, to: '/closet/basket' }
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
      const nm = n.actorName ?? n.actorHandle
      if (nm && !last.handles.includes(nm)) last.handles.push(nm)
      last.read = last.read && n.read
      continue
    }
    out.push({ key, type: n.type, handles: (n.actorName ?? n.actorHandle) ? [n.actorName ?? (n.actorHandle as string)] : [], count: 1, at: n.at, read: n.read, first: n })
  }
  return out
}

function digestLine(d: Digest): { text: string; to: string } {
  if (d.count === 1) return line(d.first)
  const shown = d.handles.slice(0, 2)
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

/** Where the panel opens: under the bell on a wide screen, as a drawer from the bottom on a phone. */
function panelPlacement(bell: HTMLElement | null): { top: number; right: number } | null {
  if (!bell || window.innerWidth < 640) return null
  const r = bell.getBoundingClientRect()
  return { top: Math.round(r.bottom + 8), right: Math.round(window.innerWidth - r.right) }
}

export function NotificationsBell() {
  const { pathname } = useLocation()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Mark-read waits until the panel closes, so the bold "new" rows stay
  // visible the whole time it's open.
  const hadUnreadRef = useRef(false)

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

  // The panel closes on Escape, on a click outside, and when the page changes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || bellRef.current?.contains(t)) return
      setOpen(false)
    }
    const onResize = () => setPlace(panelPlacement(bellRef.current))
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('resize', onResize)
    }
  }, [open])
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // When the panel closes, settle the "new" rows: clear the badge and tell
  // the server, once, so the next open shows a clean slate.
  useEffect(() => {
    if (!open) return
    return () => {
      if (hadUnreadRef.current) {
        hadUnreadRef.current = false
        setUnread(0)
        void markNotificationsRead().catch(() => undefined)
      }
    }
  }, [open])

  function toggleBell() {
    if (open) {
      setOpen(false)
      return
    }
    setPlace(panelPlacement(bellRef.current))
    setOpen(true)
    loadNotifications()
  }

  function loadNotifications() {
    setItems(null)
    setFailed(false)
    void getNotifications()
      .then((r) => {
        setItems(r.items)
        hadUnreadRef.current = r.unread > 0
      })
      .catch(() => setFailed(true))
  }

  const list = (
    <>
      {items === null && !failed && (
        <div className="py-10 text-center text-ink/40">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {failed && (
        <div className="py-10 text-center">
          <p className="text-sm text-ink/55">Couldn’t load these.</p>
          <button type="button" onClick={loadNotifications} className="btn-quiet btn-quiet-sm mt-2 !text-brass">Try again</button>
        </div>
      )}
      {!failed && items && items.length === 0 && <p className="py-10 text-center text-sm text-ink/50">Nothing yet. When your circle reacts, it lands here.</p>}
      {items && items.length > 0 && (
        <ul>
          {digest(items).map((d) => {
            const l = digestLine(d)
            return (
              <li key={d.key} className="border-t border-ink/10 first:border-t-0">
                <Link to={l.to} onClick={() => setOpen(false)} className="press flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone/60 hover:text-brass">
                  <Initials handle={d.handles[0] ?? null} className="h-8 w-8 shrink-0" />
                  <span className={`min-w-0 flex-1 text-sm leading-snug ${d.read ? 'text-ink/70' : 'font-medium text-ink'}`}>{l.text}</span>
                  <span className="shrink-0 text-xs text-ink/40">{timeAgo(d.at)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )

  const panel =
    open &&
    createPortal(
      place ? (
        // Under the bell: a dropping panel, like the account menu.
        <div ref={panelRef} role="dialog" aria-label="What happened" style={{ top: place.top, right: place.right }} className="menu-pop fixed z-50 w-[380px] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-[3px] border border-brass/30 bg-surface shadow-float">
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">What happened</p>
            <Link to="/circle" onClick={() => setOpen(false)} className="text-xs font-semibold text-ink/50 hover:text-ink">
              The Circle →
            </Link>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">{list}</div>
        </div>
      ) : (
        // On a phone: a drawer from the bottom, over a dimmed page.
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[rgb(14_13_11/0.55)]" aria-hidden />
          <div ref={panelRef} role="dialog" aria-label="What happened" className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-hidden rounded-t-[3px] border-t border-brass/40 bg-surface pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <p className="font-display text-xl text-ink">What happened</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="btn-quiet !h-8 !w-8 !px-0">
                ×
              </button>
            </div>
            <div className="max-h-[calc(80vh-3.5rem)] overflow-y-auto">{list}</div>
          </div>
        </div>
      ),
      document.body,
    )

  return (
    <>
      <button
        ref={bellRef}
        type="button"
        onClick={toggleBell}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="press relative flex h-9 w-9 items-center justify-center rounded-[3px] border border-ink/15 text-ink/60 transition-colors hover:border-brass hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span aria-hidden className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-iris px-1 text-[9px] font-bold text-on-brass">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {panel}
    </>
  )
}
