import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { Spinner } from '../components/Spinner'

// The public front door: invite-only, so strangers meet the story and a
// waitlist form — not a signup form.
export function LandingPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch<{ message: string }>('/auth/waitlist', {
        method: 'POST',
        body: { email: email.trim() },
        auth: false,
      })
      setDone(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the waitlist.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-24">
      <p className="animate-rise font-display text-xl font-extrabold tracking-tight text-ink">
        AI&nbsp;Fashion<span className="text-iris">*</span>
      </p>
      <h1 className="mx-auto mt-6 max-w-2xl animate-rise-1 font-display text-5xl font-extrabold leading-[0.98] tracking-tight text-ink sm:text-6xl">
        Every morning, an outfit —{' '}
        <em className="not-italic text-iris">already waiting.</em>
      </h1>
      <p className="mx-auto mt-5 max-w-xl animate-rise-2 font-serif text-lg italic text-ink/60">
        a personal stylist that knows your closet: it composes your look each day, renders it on
        you, and turns what you own into outfits you love
      </p>

      <div className="mx-auto mt-10 max-w-md animate-rise-3">
        {done ? (
          <div className="rounded-2xl border border-iris/25 bg-iris-soft/60 px-6 py-5">
            <p className="font-display text-lg font-bold text-ink">You're on the list ✦</p>
            <p className="mt-1 text-sm text-ink/60">{done}</p>
          </div>
        ) : (
          <>
            <form
              onSubmit={join}
              className="flex items-center gap-2 rounded-2xl border border-ink/10 bg-surface p-1.5 pl-5"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-ink outline-none placeholder:text-ink/35"
              />
              <button type="submit" disabled={busy} className="btn-primary shrink-0 !px-5">
                {busy ? <Spinner className="h-4 w-4" /> : 'Join the waitlist'}
              </button>
            </form>
            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
            <p className="mt-3 text-xs text-ink/40">
              Invite-only while we grow — spots open regularly.
            </p>
          </>
        )}
      </div>

      <div className="mx-auto mt-16 grid max-w-2xl animate-rise-3 grid-cols-1 gap-4 text-left sm:grid-cols-3">
        {[
          { t: 'Your daily brief', d: 'Open the app; the outfit is composed — weather-aware, from clothes you own.' },
          { t: 'See it on you', d: 'Any look rendered on your own photo, in the Mirror.' },
          { t: 'Friends who style you', d: 'Share the fit, get verdicts, recreate any look from your closet.' },
        ].map((f) => (
          <div key={f.t} className="card p-5">
            <p className="font-display text-base font-bold text-ink">{f.t}</p>
            <p className="mt-1 text-sm text-ink/55">{f.d}</p>
          </div>
        ))}
      </div>

      <p className="mt-12 animate-rise-3 text-sm text-ink/55">
        Already a member?{' '}
        <Link to="/login" className="font-semibold text-iris underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
