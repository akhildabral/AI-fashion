import { useEffect, useState } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { SkeletonBlock } from '../components/ui'
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
      <DoorShell eyebrow="One moment" title={<>Checking <em className="text-accent-text">the link.</em></>}>
        <div aria-busy="true" aria-label="Verifying your email">
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="mt-2 h-4 w-1/2 !bg-ink/[0.07]" />
        </div>
      </DoorShell>
    )
  }
  return (
    <DoorShell
      eyebrow={state === 'ok' ? 'Verified' : 'Not verified'}
      title={state === 'ok' ? <>Your email is <em className="text-accent-text">confirmed.</em></> : <>That link <em className="text-accent-text">didn’t work.</em></>}
      lead={message}
      foot={<SignInLink label={state === 'ok' ? 'Sign in →' : 'Back to sign in'} />}
    />
  )
}
