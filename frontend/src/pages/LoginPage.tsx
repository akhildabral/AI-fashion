import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { useAuth } from '../context/useAuth'
import { apiFetch, clearSessionExpired } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { GoogleButton } from '../components/GoogleButton'
import { DoorShell, InviteDoor, Or, PasswordField, WaitlistLink } from '../components/DoorShell'

// Sign in. One panel: email and password, a hairline "or", Google. Errors sit
// under the field they belong to; the backend's honest messages are kept.

const ROOM: Record<string, string> = {
  '/': 'Today',
  '/closet': 'the Closet',
  '/mirror': 'the Mirror',
  '/circle': 'the Circle',
  '/trips': 'Trips',
  '/journal': 'your wear history',
  '/profile': 'your profile',
}

function roomName(path: string): string {
  const base = '/' + path.split('/').filter(Boolean)[0]
  return ROOM[base] ?? ROOM[path] ?? 'where you were'
}

function safeFrom(from: string | null): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/login') || from.startsWith('/landing')) return '/'
  return from
}

type Where = 'email' | 'password'

// Which field an error belongs to, and any follow-up it deserves.
function place(message: string): { where: Where; resend?: boolean; forgot?: boolean } {
  const m = message.toLowerCase()
  if (m.includes('invalid email or password')) return { where: 'password', forgot: true }
  if (m.includes('verify your email')) return { where: 'email', resend: true }
  return { where: 'email' }
}

export function LoginPage() {
  usePageTitle('Sign in')
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const from = safeFrom(params.get('from'))
  const expired = params.get('reason') === 'expired'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ where: Where; text: string; resend?: boolean; forgot?: boolean } | null>(null)
  const [resent, setResent] = useState(false)

  // The flag has done its job once we're here.
  useEffect(() => {
    if (expired) clearSessionExpired()
  }, [expired])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
      clearSessionExpired()
      navigate(from, { replace: true })
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Something went wrong.'
      setError({ text: text === 'Invalid email or password' ? 'That password doesn’t match.' : text, ...place(text) })
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    try {
      await apiFetch('/auth/resend-verification', { method: 'POST', body: { email: email.trim() }, auth: false })
      setResent(true)
    } catch {
      setResent(false)
    }
  }

  const emailError =
    error?.where === 'email' ? (
      <>
        {error.text}
        {error.resend && (
          <>
            {' '}
            {resent ? (
              <span className="text-ink/60">Sent. Check your inbox.</span>
            ) : (
              <button type="button" onClick={() => void resend()} className="font-semibold text-brass underline-offset-4 hover:underline">
                Send it again.
              </button>
            )}
          </>
        )}
      </>
    ) : null

  return (
    <DoorShell
      eyebrow="Welcome back"
      title={
        <>
          Your stylist has been <em className="text-brass">expecting you.</em>
        </>
      }
      note={
        expired ? (
          <>
            <span className="font-semibold text-ink">Signed out.</span> Your session ended while you were in {roomName(from)}. Sign in to pick up where you were.
          </>
        ) : undefined
      }
      foot={
        <>
          <WaitlistLink />
          <InviteDoor />
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate={false}>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="you@example.com"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'email-error' : undefined}
          />
          {emailError && (
            <p id="email-error" className="mt-1.5 text-xs text-red-500 dark:text-red-300" role="alert">
              {emailError}
            </p>
          )}
        </div>

        <PasswordField
          id="password"
          value={password}
          onChange={setPassword}
          aside={
            <Link to={`/forgot${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`} className="text-[11px] font-semibold text-brass underline-offset-4 hover:underline">
              Forgot?
            </Link>
          }
          error={
            error?.where === 'password' ? (
              <>
                {error.text}{' '}
                {error.forgot && (
                  <Link to={`/forgot${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`} className="font-semibold text-brass underline-offset-4 hover:underline">
                    Send me a link instead.
                  </Link>
                )}
              </>
            ) : null
          }
        />

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? <Spinner className="h-4 w-4" /> : expired && from !== '/' ? `Sign in and go back to ${roomName(from)}` : 'Sign in'}
        </button>
      </form>

      <Or />
      <GoogleButton onMessage={(m) => setError({ where: 'email', text: m })} redirectTo={from} />
    </DoorShell>
  )
}
