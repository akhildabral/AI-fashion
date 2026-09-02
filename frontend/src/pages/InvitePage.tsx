import { useEffect, useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/useAuth'
import { Spinner } from '../components/Spinner'
import type { User } from '../lib/types'

// The invite landing: set a password, claim your name, step inside.
export function InvitePage() {
  usePageTitle('You\'re invited')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { adoptSession } = useAuth()

  const [state, setState] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setState('invalid')
      return
    }
    apiFetch<{ email: string; firstName: string | null }>(
      `/auth/invite?token=${encodeURIComponent(token)}`,
      { auth: false },
    )
      .then((r) => {
        setEmail(r.email)
        if (r.firstName) setFirstName(r.firstName)
        setState('ready')
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function accept(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch<{ token: string; user: User }>('/auth/invite/accept', {
        method: 'POST',
        body: { token, password, firstName: firstName.trim(), lastName: lastName.trim() || null },
        auth: false,
      })
      adoptSession(res.token, res.user)
      navigate('/welcome', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate your account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <p className="animate-rise font-display text-lg font-extrabold tracking-tight text-ink">
          AI&nbsp;Fashion<span className="text-iris">*</span>
        </p>
        <h1 className="mt-4 animate-rise-1 font-display text-4xl font-extrabold tracking-tight text-ink">
          You're invited.
        </h1>
        {state === 'ready' && (
          <p className="mt-2 animate-rise-2 font-display text-sm italic text-ink/60">
            welcome, {email} — claim your account below
          </p>
        )}
      </div>

      {state === 'checking' && (
        <div className="flex justify-center py-10 text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {state === 'invalid' && (
        <div className="animate-rise rounded-[3px] border border-ink/10 bg-surface p-8 text-center">
          <p className="font-display text-lg font-bold text-ink">This invite isn't valid</p>
          <p className="mt-2 text-sm text-ink/55">
            The link may have expired — invites last 7 days. Ask for a fresh one, or join the
            waitlist again.
          </p>
          <Link to="/landing" className="btn-primary mt-5 inline-flex">
            Back to the waitlist
          </Link>
        </div>
      )}

      {state === 'ready' && (
        <form onSubmit={accept} className="animate-rise-3 space-y-5 rounded-[3px] border border-ink/10 bg-surface p-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="label">
                First name
              </label>
              <input
                id="firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="field"
                placeholder="Akhil"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="label">
                Last name
              </label>
              <input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="field"
                placeholder="optional"
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="label">
              Choose a password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="alert-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner className="h-4 w-4" /> : 'Activate my account →'}
          </button>
        </form>
      )}
    </div>
  )
}
