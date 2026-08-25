import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-10 border-b border-ink/10 bg-bone/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link to="/" className="group flex items-baseline gap-2">
          <span className="font-serif text-2xl font-semibold tracking-tight text-ink">
            AI Fashion
          </span>
          <span className="hidden text-xs uppercase tracking-[0.3em] text-clay sm:inline">
            Stylist
          </span>
        </Link>

        {user && (
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink/60 sm:inline">{user.email}</span>
            <button type="button" onClick={handleLogout} className="btn-ghost">
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
