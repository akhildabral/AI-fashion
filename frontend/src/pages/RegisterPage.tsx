import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../context/useAuth'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null)

  async function handleSubmit(email: string, password: string) {
    const message = await register(email, password)
    if (message) {
      setWaitlistMessage(message)
    } else {
      navigate('/', { replace: true })
    }
  }

  if (waitlistMessage) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-12 text-center">
        <p className="text-5xl" aria-hidden="true">
          ✉️
        </p>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-ink">Check your inbox</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/65">{waitlistMessage}</p>
        <Link
          to="/login"
          className="mt-6 text-sm font-medium text-clay underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return <AuthForm mode="register" onSubmit={handleSubmit} />
}
