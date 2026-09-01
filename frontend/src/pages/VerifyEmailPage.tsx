import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'

/** Landing page for the emailed verification link. */
export function VerifyEmailPage() {
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
    apiFetch<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, {
      auth: false,
    })
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

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-12 text-center">
      {state === 'working' ? (
        <div className="flex flex-col items-center gap-3 text-ink/60">
          <Spinner className="h-6 w-6" />
          <p className="text-sm">Verifying your email…</p>
        </div>
      ) : (
        <>
          <p className="text-5xl" aria-hidden="true">
            {state === 'ok' ? '✓' : '✗'}
          </p>
          <h1 className="mt-4 font-serif text-3xl font-semibold text-ink">
            {state === 'ok' ? 'Email verified' : 'Something went wrong'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink/65">{message}</p>
          <Link
            to="/login"
            className="mt-6 text-sm font-medium text-clay underline-offset-4 hover:underline"
          >
            Go to sign in
          </Link>
        </>
      )}
    </div>
  )
}
