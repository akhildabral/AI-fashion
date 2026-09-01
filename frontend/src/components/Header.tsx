import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { PullCord } from './PullCord'

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

export function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
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
    <header className="sticky top-0 z-20 bg-bone/70 backdrop-blur-md">
      <div className="relative mx-auto flex h-[76px] max-w-6xl items-center justify-between px-6">
        <Link to="/" className="group flex items-baseline gap-2">
          <span className="font-display text-xl font-extrabold tracking-tight text-ink">
            AI&nbsp;Fashion<span className="text-iris transition-colors group-hover:text-iris-deep">*</span>
          </span>
          <span className="hidden font-serif text-xs italic text-ink/40 md:inline">
            your daily stylist
          </span>
        </Link>

        {user && (
          <>
            {/* Centered floating nav */}
            <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-full border border-ink/5 bg-surface/80 p-1 backdrop-blur sm:flex">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive(pathname, item.match)
                      ? 'bg-ink text-bone'
                      : 'text-ink/55 hover:text-ink'
                  }`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* The light cord hangs from the very top, clear of the avatar */}
            <div className="absolute right-24 top-0">
              <PullCord />
            </div>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-spark text-xs font-bold text-bone transition-colors hover:bg-spark-deep"
              >
                {initials}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-ink/10 bg-surface py-2 shadow-float">
                  <p className="truncate px-4 py-2 text-xs text-ink/45">{user.email}</p>
                  {MENU.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="block px-4 py-2 text-sm text-ink/75 transition-colors hover:bg-bone hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  ))}
                  {user.role === 'admin' && (
                    <Link
                      to="/admin"
                      className="block px-4 py-2 text-sm text-ink/75 transition-colors hover:bg-bone hover:text-ink"
                    >
                      Admin
                    </Link>
                  )}
                  <div className="my-1 border-t border-ink/5" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-2 text-left text-sm text-ink/75 transition-colors hover:bg-bone hover:text-ink"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {user && (
        <nav className="flex gap-0.5 overflow-x-auto px-6 pb-3 sm:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive(pathname, item.match)
                  ? 'bg-ink text-bone'
                  : 'text-ink/55 hover:text-ink'
              }`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
