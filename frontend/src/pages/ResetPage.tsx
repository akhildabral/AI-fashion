import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch, clientFields } from '../lib/api'
import { useAuth } from '../context/useAuth'
import { Spinner } from '../components/Spinner'
import { DoorShell, PasswordField, SignInLink } from '../components/DoorShell'
import type { User } from '@zauq/shared/types'

// From the emailed link: choose a new password, then straight in.

export function ResetPage() {
  usePageTitle('New password')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { adoptSession } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await apiFetch<{ token: string | null; refreshToken?: string; user: User | null; message?: string }>('/auth/reset', {
        method: 'POST',
        body: { token, password, ...clientFields() },
        auth: false,
      })
      if (r.token && r.user) {
        adoptSession(r.token, r.user, r.refreshToken ?? null)
        navigate('/', { replace: true })
      } else {
        setClosed(r.message ?? 'Your password is set.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <DoorShell eyebrow="New password" title={<>This link is <em className="text-accent-text">missing its key.</em></>} lead="Open the link from the email, or ask for a fresh one." foot={<Link to="/forgot" className="font-semibold text-accent-text underline-offset-4 hover:underline">Send me a new link</Link>} />
    )
  }

  if (closed) {
    return <DoorShell eyebrow="New password" title={<>Set, and <em className="text-accent-text">waiting.</em></>} lead={closed} foot={<SignInLink label="Back to sign in" />} />
  }

  return (
    <DoorShell
      eyebrow="New password"
      title={
        <>
          Choose <em className="text-accent-text">a new one.</em>
        </>
      }
      lead="At least eight characters. You’ll be signed in straight after."
      foot={<SignInLink />}
    >
      <form onSubmit={save} className="space-y-4">
        <PasswordField id="new-password" label="New password" autoComplete="new-password" minLength={8} placeholder="at least 8 characters" value={password} onChange={setPassword} error={error} />
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner className="h-4 w-4" /> : 'Save and sign in'}
        </button>
      </form>
    </DoorShell>
  )
}
