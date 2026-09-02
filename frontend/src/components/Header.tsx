import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { PullCord } from './PullCord'
import { isDark, toggleTheme } from '../lib/theme'
import { NotificationsBell } from './NotificationsBell'

// The header: the wordmark, the four rooms as text on the header's own
// hairline (brass under the one you're in), and on the right the light
// cord, the bell and you. Nothing boxed; the page below carries the weight.

const NAV = [
  { to: '/', label: 'Today', match: ['/'] },
  { to: '/closet', label: 'Closet', match: ['/closet'] },
  { to: '/mirror', label: 'Mirror', match: ['/mirror'] },
  { to: '/circle', label: 'Circle', match: ['/circle', '/u'] },
]

const MENU = [
  { to: '/trips', label: 'Trips' },
  { to: '/journal', label: 'Wear history' },
  { to: '/profile', label: 'Profile' },
  { to: '/billing', label: 'Plan & usage' },
]

function isActive(pathname: string, match: string[]) {
  return match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m)))
}

function RoomLink({ to, label, on, className = '' }: { to: string; label: string; on: boolean; className?: string }) {
  return (
    <NavLink
      to={to}
      aria-current={on ? 'page' : undefined}
      className={`relative flex h-full items-center whitespace-nowrap px-1 text-[13px] font-semibold uppercase tracking-[0.14em] transition-colors ${on ? 'text-ink' : 'text-ink/50 hover:text-ink'} ${className}`}
    >
      {label}
      <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[2px] transition-colors ${on ? 'bg-brass' : 'bg-transparent'}`} />
    </NavLink>
  )
}

export function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // The fitting is a sitting, not a room: no room-switcher while it's on.
  const inFitting = pathname.startsWith('/fitting')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  function handleLogout() {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  const initials = (user?.handle ?? user?.email ?? '?').slice(0, 2).toUpperCase()

  return (
    <header className="sticky top-0 z-30 bg-bone/80 backdrop-blur-md" style={{ boxShadow: 'inset 0 -1px 0 rgb(var(--c-ink) / 0.1)' }}>
      <div className="mx-auto flex h-16 max-w-[1400px] items-stretch justify-between gap-6 px-4 sm:px-6">
        <Link to="/" className="group flex items-baseline gap-2 self-center">
          <span className="font-display text-xl font-extrabold tracking-tight text-ink">
            AI&nbsp;Fashion
            <span className="text-iris transition-colors group-hover:text-iris-deep">*</span>
          </span>
          <span className="hidden font-display text-xs italic text-ink/40 lg:inline">your daily stylist</span>
        </Link>

        {!user && pathname !== '/login' && (
          <Link to="/login" className="btn-ghost btn-sm self-center">
            Sign in
          </Link>
        )}

        {user && !inFitting && (
          <nav aria-label="Rooms" className="hidden items-stretch gap-7 sm:flex">
            {NAV.map((item) => (
              <RoomLink key={item.to} to={item.to} label={item.label} on={isActive(pathname, item.match)} />
            ))}
          </nav>
        )}

        {user && (
          <div className="flex items-center gap-3 self-center" ref={menuRef}>
            {/* The light cord hangs from the top edge in its own slot, clear of the bell */}
            <div className="relative hidden h-16 w-6 sm:block">
              <div className="absolute left-1/2 top-0 -translate-x-1/2">
                <PullCord />
              </div>
            </div>
            <NotificationsBell />
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                className="press flex h-9 w-9 items-center justify-center rounded-[3px] bg-iris text-xs font-bold text-[rgb(26_21_9)] transition-colors hover:bg-iris-deep"
              >
                {initials}
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-[3px] border border-brass/30 bg-surface py-2 shadow-float">
                  <p className="truncate px-4 py-2 text-xs text-ink/45">{user.email}</p>
                  {MENU.map((item) => (
                    <Link key={item.to} to={item.to} role="menuitem" className="block px-4 py-2 text-sm text-ink/75 transition-colors hover:bg-bone hover:text-ink">
                      {item.label}
                    </Link>
                  ))}
                  {user.role === 'admin' && (
                    <Link to="/admin" role="menuitem" className="block px-4 py-2 text-sm text-ink/75 transition-colors hover:bg-bone hover:text-ink">
                      Admin
                    </Link>
                  )}
                  <div className="my-1 border-t border-ink/10" />
                  <button type="button" role="menuitem" onClick={() => {
                      toggleTheme()
                      setMenuOpen(false)
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-ink/75 transition-colors hover:bg-bone hover:text-ink sm:hidden"
                  >
                    {isDark() ? 'Lights on' : 'Lights off'}
                  </button>
                  <button type="button" role="menuitem" onClick={handleLogout} className="block w-full px-4 py-2 text-left text-sm text-ink/75 transition-colors hover:bg-bone hover:text-ink">
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Phones: the rooms on their own hairline under the wordmark */}
      {user && !inFitting && (
        <nav aria-label="Rooms" className="flex h-11 items-stretch gap-6 overflow-x-auto px-4 sm:hidden" style={{ scrollbarWidth: 'none' }}>
          {NAV.map((item) => (
            <RoomLink key={item.to} to={item.to} label={item.label} on={isActive(pathname, item.match)} className="!text-[12px]" />
          ))}
        </nav>
      )}
    </header>
  )
}
