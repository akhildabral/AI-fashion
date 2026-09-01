import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from './Spinner'

interface AuthFormProps {
  mode: 'login' | 'register'
  onSubmit: (email: string, password: string) => Promise<void>
}

const COPY = {
  login: {
    title: 'Welcome back',
    subtitle: 'Your stylist has been expecting you.',
    action: 'Sign in',
    footer: 'New here?',
    footerLink: 'Create an account',
    footerTo: '/register',
  },
  register: {
    title: 'Meet your stylist',
    subtitle: 'A personal stylist that knows your closet — and your taste.',
    action: 'Create account',
    footer: 'Already have an account?',
    footerLink: 'Sign in',
    footerTo: '/login',
  },
} as const

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const copy = COPY[mode]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSubmit(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <p className="animate-rise font-display text-lg font-extrabold tracking-tight text-ink">
          AI&nbsp;Fashion<span className="text-iris">*</span>
        </p>
        <h1 className="mt-4 animate-rise-1 font-display text-4xl font-extrabold tracking-tight text-ink">
          {copy.title}
        </h1>
        <p className="mt-2 animate-rise-2 font-serif text-sm italic text-ink/60">{copy.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="animate-rise-3 space-y-5 rounded-2xl border border-ink/10 bg-surface p-8 shadow-sm">
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
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? <Spinner className="h-4 w-4" /> : copy.action}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink/60">
        {copy.footer}{' '}
        <Link to={copy.footerTo} className="font-medium text-iris underline-offset-4 hover:underline">
          {copy.footerLink}
        </Link>
      </p>
    </div>
  )
}
