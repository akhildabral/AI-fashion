import { useEffect, useState, type FormEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, clientFields } from '../lib/api'
import { useAuth } from '../context/useAuth'
import { Spinner } from '../components/Spinner'
import { SkeletonBlock } from '../components/ui'
import type { AuthResponse } from '@zauq/shared/types'
import { DoorShell, PasswordField } from '../components/DoorShell'

// The invite landing: set a password, claim your name, step inside.
export function InvitePage() {
  usePageTitle('You’re invited')
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
      const res = await apiFetch<AuthResponse>('/auth/invite/accept', {
        method: 'POST',
        body: { token, password, firstName: firstName.trim(), lastName: lastName.trim() || null, ...clientFields() },
        auth: false,
      })
      adoptSession(res.token, res.user, res.refreshToken ?? null)
      navigate('/welcome', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate your account.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'checking') {
    return (
      <DoorShell eyebrow="One moment" title={<>Checking <em className="text-accent-text">the invite.</em></>}>
        <div aria-busy="true" aria-label="Checking your invite">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="mt-2 h-11 w-full !bg-ink/[0.07]" />
          <SkeletonBlock className="mt-4 h-3 w-16" />
          <SkeletonBlock className="mt-2 h-11 w-full !bg-ink/[0.07]" />
        </div>
      </DoorShell>
    )
  }
  if (state === 'invalid') {
    return (
      <DoorShell
        eyebrow="The door"
        title={<>This invite <em className="text-accent-text">isn’t valid.</em></>}
        lead="The link may have expired. Invites last 7 days. Ask for a fresh one, or join the waitlist again."
        foot={<Link to="/landing" className="font-semibold text-accent-text underline-offset-4 hover:underline">Back to the waitlist</Link>}
      />
    )
  }
  return (
    <DoorShell eyebrow="You’re invited" title={<>Claim <em className="text-accent-text">your account.</em></>} lead={`Welcome, ${email}.`}>
      <form onSubmit={accept} className="space-y-4">
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
        <PasswordField id="password" label="Choose a password" autoComplete="new-password" minLength={8} placeholder="at least 8 characters" value={password} onChange={setPassword} error={error} />
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner className="h-4 w-4" /> : 'Activate my account'}
        </button>
      </form>
    </DoorShell>
  )

}
