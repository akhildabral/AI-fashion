import { useEffect, useState } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'
import { DoorShell, SignInLink } from '../components/DoorShell'

/** Landing page for the emailed verification link. */
export function VerifyEmailPage() {
  usePageTitle('Verify email')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage('This link is missing its verification token.')
      return
    }
    let cancelled = false
    apiFetch<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, { auth: false })
      .then((res) => {
        if (cancelled) return
        setState('ok')
        setMessage(res.message)
      })
      .catch((err) => {
        if (cancelled) return
        setState('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (state === 'working') {
    return (
      <DoorShell eyebrow="One moment" title={<>Checking <em className="text-brass">the link.</em></>}>
        <div className="flex items-center gap-3 text-sm text-ink/60">
          <Spinner className="h-5 w-5" /> Verifying your email…
        </div>
      </DoorShell>
    )
  }
  return (
    <DoorShell
      eyebrow={state === 'ok' ? 'Verified' : 'Not verified'}
      title={state === 'ok' ? <>Your email is <em className="text-brass">confirmed.</em></> : <>That link <em className="text-brass">didn’t work.</em></>}
      lead={message}
      foot={<SignInLink label={state === 'ok' ? 'Sign in →' : 'Back to sign in'} />}
    />
  )
}
