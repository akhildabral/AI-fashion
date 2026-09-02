import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { useAuth } from '../context/useAuth'
import { Spinner } from '../components/Spinner'
import { GoogleButton } from '../components/GoogleButton'
import { getJoinInfo, joinWithCode, type JoinInfo } from '../lib/invites'

// A friend's door. Their link brought you here: no waitlist, and you land
// following each other.

export function JoinPage() {
  usePageTitle('You’re invited')
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { user, adoptSession } = useAuth()

  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [state, setState] = useState<'checking' | 'ready' | 'closed' | 'invalid'>('checking')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      setState('invalid')
      return
    }
    getJoinInfo(code)
      .then((r) => {
        setInfo(r)
        setState(r.open ? 'ready' : 'closed')
      })
      .catch(() => setState('invalid'))
  }, [code])

  const who = info?.inviter.handle ? `@${info.inviter.handle}` : (info?.inviter.firstName ?? 'A friend')

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await joinWithCode(code, { email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() || null })
      adoptSession(res.token, res.user)
      navigate('/fitting', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the door.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <p className="animate-rise font-display text-lg font-semibold tracking-tight text-ink">
          AI&nbsp;Fashion<span className="text-brass">*</span>
        </p>
        {state === 'checking' && (
          <div className="flex justify-center py-10 text-ink/50">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {state === 'ready' && (
          <>
            <p className="mt-6 animate-rise-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">{who} invited you</p>
            <h1 className="mt-2 animate-rise-1 font-display text-4xl font-medium leading-[1.05] text-ink">
              Come in, <em className="text-brass">no waiting.</em>
            </h1>
            <p className="mt-3 animate-rise-2 font-display text-lg italic text-ink/55">A personal stylist for the clothes you already own. You’ll start following each other.</p>
          </>
        )}
      </div>

      {state === 'invalid' && (
        <div className="animate-rise rounded-[3px] border border-ink/10 bg-surface p-8 text-center">
          <p className="font-display text-xl font-medium text-ink">This link isn’t one of ours</p>
          <p className="mt-2 text-sm text-ink/55">Check it with whoever sent it, or join the waitlist.</p>
          <Link to="/landing" className="btn-primary mt-5 inline-flex">
            Join the waitlist
          </Link>
        </div>
      )}

      {state === 'closed' && (
        <div className="animate-rise rounded-[3px] border border-ink/10 bg-surface p-8 text-center">
          <p className="font-display text-xl font-medium text-ink">{who}’s invites are used up</p>
          <p className="mt-2 text-sm text-ink/55">Ask them for a fresh one when they have more, or join the waitlist.</p>
          <Link to="/landing" className="btn-primary mt-5 inline-flex">
            Join the waitlist
          </Link>
        </div>
      )}

      {state === 'ready' && user && (
        <div className="animate-rise rounded-[3px] border border-ink/10 bg-surface p-8 text-center">
          <p className="font-display text-xl font-medium text-ink">You’re already in</p>
          <p className="mt-2 text-sm text-ink/55">This link is for someone new. You can follow {who} from their room.</p>
          {info?.inviter.handle ? (
            <Link to={`/u/${info.inviter.handle}`} className="btn-primary mt-5 inline-flex">
              Go to {who}’s room
            </Link>
          ) : (
            <Link to="/circle" className="btn-primary mt-5 inline-flex">
              Back to the Circle
            </Link>
          )}
        </div>
      )}

      {state === 'ready' && !user && (
        <div className="animate-rise-3 rounded-[3px] border border-ink/10 bg-surface p-8">
          <GoogleButton onMessage={setError} joinCode={code} redirectTo="/fitting" />
          <form onSubmit={join} className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="label">
                  First name
                </label>
                <input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="field" autoComplete="given-name" />
              </div>
              <div>
                <label htmlFor="lastName" className="label">
                  Last name
                </label>
                <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="field" placeholder="optional" autoComplete="family-name" />
              </div>
            </div>
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field" autoComplete="email" />
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
                placeholder="at least 8 characters"
              />
            </div>
            {error && (
              <p className="alert-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner className="h-4 w-4" /> : 'Come in'}
            </button>
            <p className="text-center text-xs text-ink/45">
              Already a member?{' '}
              <Link to="/login" className="font-semibold text-brass hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      )}
    </div>
  )
}
