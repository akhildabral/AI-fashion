import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { DoorShell, SignInLink } from '../components/DoorShell'

// Forgot your password: one field, one button, then "check your inbox".

export function ForgotPage() {
  usePageTitle('Forgot your password')
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [again, setAgain] = useState(false)

  async function send(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await apiFetch<{ message: string }>('/auth/forgot', { method: 'POST', body: { email: email.trim() }, auth: false })
      if (sent) setAgain(true)
      setSent(r.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <DoorShell
        eyebrow="Check your inbox"
        title={
          <>
            The link is <em className="text-brass">on its way.</em>
          </>
        }
        lead={sent}
        foot={<SignInLink />}
      >
        <p className="text-sm text-ink/60">
          Nothing there after a minute? Look in spam, or{' '}
          {again ? (
            <span className="text-ink/45">sent again.</span>
          ) : (
            <button type="button" disabled={busy} onClick={() => void send()} className="font-semibold text-brass underline-offset-4 hover:underline">
              send it again.
            </button>
          )}
        </p>
      </DoorShell>
    )
  }

  return (
    <DoorShell
      eyebrow="Forgot your password"
      title={
        <>
          We’ll send you <em className="text-brass">a way in.</em>
        </>
      }
      lead="A link that lets you choose a new one. It lasts an hour."
      foot={<SignInLink />}
    >
      <form onSubmit={send} className="space-y-5">
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="field" placeholder="you@example.com" />
        </div>
        {error && (
          <p className="text-xs text-red-500 dark:text-red-300" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner className="h-4 w-4" /> : 'Send me a link'}
        </button>
      </form>
    </DoorShell>
  )
}
