import { useState } from 'react'
import { PageShell } from '../components/ui'
import { usePageTitle } from '../lib/usePageTitle'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useProfile } from '../context/useProfile'
import { useAuth } from '../context/useAuth'
import { PhotoManager } from '../components/PhotoManager'
import { Spinner } from '../components/Spinner'
import type { StyleProfile } from '../lib/types'

const VIBES = ['Minimal', 'Tailored', 'Street', 'Classic', 'Bold', 'Cosy']
const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unisex', label: 'Unisex' },
]

// First run: three steps from signup to styled. Taste capture IS the
// onboarding; the reward is the Today brief waiting at the end.
export function WelcomePage() {
  usePageTitle('Welcome')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { setProfile } = useProfile()
  const { user } = useAuth()
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [step] = useState(() => (params.get('step') === '3' ? 3 : 1))
  const [vibe, setVibe] = useState<string | null>(null)
  const [city, setCity] = useState('')
  const [gender, setGender] = useState('female')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveBasics() {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch<{ profile: StyleProfile }>('/profile', {
        method: 'PUT',
        body: {
          styleVibe: vibe?.toLowerCase() ?? null,
          city: city.trim() || null,
          styleFor: gender,
        },
      })
      setProfile(res.profile)
      if (firstName.trim()) {
        await apiFetch('/auth/me', {
          method: 'PATCH',
          body: { firstName: firstName.trim(), lastName: lastName.trim() || null },
        }).catch(() => undefined)
      }
      localStorage.setItem('ai-fashion-style-for', gender)
      navigate('/quiz?from=welcome')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — try again.')
      setSaving(false)
    }
  }

  return (
    <PageShell narrow>
      <p className="animate-rise text-xs font-semibold uppercase tracking-[0.25em] text-iris">
        Welcome · step {step} of 3
      </p>

      {step === 1 && (
        <div className="mt-3">
          <h1 className="animate-rise-1 font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-5xl">
            Let's learn <em className="not-italic text-iris">your style.</em>
          </h1>
          <p className="mt-3 max-w-md animate-rise-2 text-ink/60">
            Three quick steps and your stylist starts composing outfits that are actually you.
          </p>

          <div className="mt-8 animate-rise-3 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="wFirst" className="label">
                  First name
                </label>
                <input
                  id="wFirst"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="field"
                  placeholder="What should we call you?"
                />
              </div>
              <div>
                <label htmlFor="wLast" className="label">
                  Last name
                </label>
                <input
                  id="wLast"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="field"
                  placeholder="optional"
                />
              </div>
            </div>
            <div>
              <p className="label">Your vibe — tap what feels right</p>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVibe((prev) => (prev === v ? null : v))}
                    className={`chip ${vibe === v ? 'chip-on' : ''}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="city" className="label">
                  Your city — for weather-aware outfits
                </label>
                <input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="field"
                  placeholder="e.g. Dubai"
                />
              </div>
              <div>
                <label htmlFor="gender" className="label">
                  Style you for
                </label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="field"
                >
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="alert-error">{error}</p>}
            <button
              type="button"
              onClick={() => void saveBasics()}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> Saving…
                </>
              ) : (
                'Next: your taste →'
              )}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-3">
          <h1 className="animate-rise-1 font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-5xl">
            One photo for <em className="not-italic text-iris">the Mirror.</em>
          </h1>
          <p className="mt-3 max-w-md animate-rise-2 text-ink/60">
            Add a full-length photo and every look can be rendered on <em>you</em>. Skippable —
            you can add it any time from your profile.
          </p>
          <div className="mt-8 animate-rise-3">
            <PhotoManager />
          </div>
          <div className="mt-8 flex animate-rise-3 gap-3">
            <button type="button" onClick={() => navigate('/', { replace: true })} className="btn-primary">
              Meet your stylist →
            </button>
            <button
              type="button"
              onClick={() => navigate('/quiz?from=welcome')}
              className="btn-ghost"
            >
              ← Back to the quiz
            </button>
          </div>
        </div>
      )}
    </PageShell>
  )
}
