import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition ${
    isActive ? 'text-ink' : 'text-ink/50 hover:text-ink'
  }`

export function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-10 border-b border-ink/10 bg-bone/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/" className="group flex items-baseline gap-2">
          <span className="font-serif text-2xl font-semibold tracking-tight text-ink">
            AI Fashion
          </span>
          <span className="hidden text-xs uppercase tracking-[0.3em] text-clay sm:inline">
            Stylist
          </span>
        </Link>

        {user && (
          <div className="flex items-center gap-4 sm:gap-6">
            <nav className="flex items-center gap-4 sm:gap-5">
              <NavLink to="/" end className={navLinkClass}>
                Stylist
              </NavLink>
              <NavLink to="/looks" className={navLinkClass}>
                My Looks
              </NavLink>
              <NavLink to="/wardrobe" className={navLinkClass}>
                Wardrobe
              </NavLink>
              <NavLink to="/journal" className={navLinkClass}>
                Journal
              </NavLink>
              <NavLink to="/packing" className={navLinkClass}>
                Packing
              </NavLink>
              <NavLink to="/friends" className={navLinkClass}>
                Friends
              </NavLink>
              <NavLink to="/tryons" className={navLinkClass}>
                Try-Ons
              </NavLink>
              <NavLink to="/profile" className={navLinkClass}>
                Profile
              </NavLink>
              <NavLink to="/billing" className={navLinkClass}>
                Plan
              </NavLink>
              {user.role === 'admin' && (
                <NavLink to="/admin" className={navLinkClass}>
                  Admin
                </NavLink>
              )}
            </nav>
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-ink/60 lg:inline">{user.email}</span>
              <button type="button" onClick={handleLogout} className="btn-ghost">
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
