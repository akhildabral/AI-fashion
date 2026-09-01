import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { ProfileResponse, StyleProfile } from '../lib/types'
import { useProfile } from '../context/useProfile'
import { Spinner } from '../components/Spinner'
import { PhotoManager } from '../components/PhotoManager'
import { Link } from 'react-router-dom'
import { getRitualStats, type RitualStats } from '../lib/brief'
import { Stat } from '../components/ui'

const BODY_TYPES = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const
const SKIN_TONES = ['fair', 'light', 'medium', 'tan', 'deep'] as const
const STYLE_VIBES = [
  'minimal',
  'classic',
  'streetwear',
  'bohemian',
  'formal',
  'sporty',
  'edgy',
] as const
const BUDGET_BANDS = ['budget', 'mid', 'premium', 'luxury'] as const

function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface FormState {
  bodyType: string
  heightCm: string
  sizeTop: string
  sizeBottom: string
  sizeShoe: string
  skinTone: string
  styleVibe: string
  budgetBand: string
  avoidColors: string[]
}

const EMPTY_FORM: FormState = {
  bodyType: '',
  heightCm: '',
  sizeTop: '',
  sizeBottom: '',
  sizeShoe: '',
  skinTone: '',
  styleVibe: '',
  budgetBand: '',
  avoidColors: [],
}

function toFormState(profile: StyleProfile): FormState {
  return {
    bodyType: profile.bodyType ?? '',
    heightCm:
      typeof profile.heightCm === 'number' && !Number.isNaN(profile.heightCm)
        ? String(profile.heightCm)
        : '',
    sizeTop: profile.sizes?.top ?? '',
    sizeBottom: profile.sizes?.bottom ?? '',
    sizeShoe: profile.sizes?.shoe ?? '',
    skinTone: profile.skinTone ?? '',
    styleVibe: profile.styleVibe ?? '',
    budgetBand: profile.budgetBand ?? '',
    avoidColors: Array.isArray(profile.avoidColors) ? profile.avoidColors : [],
  }
}

export function ProfilePage() {
  const [ritual, setRitual] = useState<RitualStats | null>(null)
  const navigate = useNavigate()
  const { profile, loading: profileLoading, setProfile } = useProfile()

  const isOnboarding = !profileLoading && !profile

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [hydrated, setHydrated] = useState(false)
  const [colorDraft, setColorDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill from the cached profile once it has settled. If the context has no
  // profile yet (fresh load), fall back to fetching directly.
  useEffect(() => {
    if (hydrated || profileLoading) return
    if (profile) {
      setForm(toFormState(profile))
      setHydrated(true)
      return
    }
    let cancelled = false
    apiFetch<ProfileResponse>('/profile')
      .then(({ profile: p }) => {
        if (cancelled) return
        if (p) setForm(toFormState(p))
      })
      .catch(() => {
        /* first-time users have no profile — start blank */
      })
      .finally(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [profile, profileLoading, hydrated])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addColor(raw: string) {
    const value = raw.trim()
    if (!value) return
    setForm((f) =>
      f.avoidColors.some((c) => c.toLowerCase() === value.toLowerCase())
        ? f
        : { ...f, avoidColors: [...f.avoidColors, value] },
    )
    setColorDraft('')
  }

  function removeColor(color: string) {
    setForm((f) => ({
      ...f,
      avoidColors: f.avoidColors.filter((c) => c !== color),
    }))
  }

  function handleColorKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addColor(colorDraft)
    } else if (e.key === 'Backspace' && colorDraft === '' && form.avoidColors.length) {
      removeColor(form.avoidColors[form.avoidColors.length - 1])
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    // Fold any pending draft color into the payload.
    const pending = colorDraft.trim()
    const avoidColors =
      pending && !form.avoidColors.some((c) => c.toLowerCase() === pending.toLowerCase())
        ? [...form.avoidColors, pending]
        : form.avoidColors

    const heightNum = Number(form.heightCm)

    const body: Partial<StyleProfile> = {
      bodyType: form.bodyType || undefined,
      heightCm: form.heightCm && !Number.isNaN(heightNum) ? heightNum : undefined,
      sizes: {
        top: form.sizeTop || undefined,
        bottom: form.sizeBottom || undefined,
        shoe: form.sizeShoe || undefined,
      },
      skinTone: form.skinTone || undefined,
      styleVibe: form.styleVibe || undefined,
      budgetBand: form.budgetBand || undefined,
      avoidColors,
    }

    try {
      const { profile: saved } = await apiFetch<{ profile: StyleProfile }>('/profile', {
        method: 'PUT',
        body,
      })
      setProfile(saved)
      setColorDraft('')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  if (profileLoading || !hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink/50">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  useEffect(() => {
    getRitualStats().then(setRitual).catch(() => undefined)
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10 max-w-2xl">
        {isOnboarding && (
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-clay">Welcome</p>
        )}
        <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          {isOnboarding ? "Let's set up your style profile" : 'Your style profile'}
        </h1>
        <p className="mt-3 text-ink/60">
          {isOnboarding
            ? 'A few details help your stylist compose looks that actually fit you. You can change these anytime.'
            : 'Update your measurements and taste so every look stays tailored to you.'}
        </p>
      </div>

      {!isOnboarding && ritual && (
        <section className="mb-10 rounded-2xl border border-ink/10 bg-surface p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">Your style story</h2>
            <Link to="/journal" className="text-sm font-medium text-iris hover:underline">
              Wear history →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat value={ritual.streak} label="day streak" />
            <Stat
              value={`₹${ritual.monthlyPayback.toLocaleString('en-IN')}`}
              label="payback this month"
            />
            <Stat value={`${ritual.rotationPct}%`} label="closet in rotation" />
            <Stat value={ritual.outfitsThisWeek} label="outfits this week" />
          </div>
        </section>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-8 rounded-2xl border border-ink/10 bg-surface p-6  sm:p-8"
      >
        {/* Fit */}
        <fieldset className="space-y-5">
          <legend className="font-serif text-xl font-semibold text-ink">Fit</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="bodyType" className="label">
                Body type
              </label>
              <select
                id="bodyType"
                value={form.bodyType}
                onChange={(e) => update('bodyType', e.target.value)}
                className="field"
              >
                <option value="">Select…</option>
                {BODY_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {title(v)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="heightCm" className="label">
                Height (cm)
              </label>
              <input
                id="heightCm"
                type="number"
                min={100}
                max={250}
                inputMode="numeric"
                value={form.heightCm}
                onChange={(e) => update('heightCm', e.target.value)}
                className="field"
                placeholder="e.g. 170"
              />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor="sizeTop" className="label">
                Top size
              </label>
              <input
                id="sizeTop"
                type="text"
                value={form.sizeTop}
                onChange={(e) => update('sizeTop', e.target.value)}
                className="field"
                placeholder="e.g. M"
              />
            </div>
            <div>
              <label htmlFor="sizeBottom" className="label">
                Bottom size
              </label>
              <input
                id="sizeBottom"
                type="text"
                value={form.sizeBottom}
                onChange={(e) => update('sizeBottom', e.target.value)}
                className="field"
                placeholder="e.g. 32"
              />
            </div>
            <div>
              <label htmlFor="sizeShoe" className="label">
                Shoe size
              </label>
              <input
                id="sizeShoe"
                type="text"
                value={form.sizeShoe}
                onChange={(e) => update('sizeShoe', e.target.value)}
                className="field"
                placeholder="e.g. 9"
              />
            </div>
          </div>
        </fieldset>

        {/* Taste */}
        <fieldset className="space-y-5 border-t border-ink/10 pt-8">
          <legend className="font-serif text-xl font-semibold text-ink">Taste</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="skinTone" className="label">
                Skin tone
              </label>
              <select
                id="skinTone"
                value={form.skinTone}
                onChange={(e) => update('skinTone', e.target.value)}
                className="field"
              >
                <option value="">Select…</option>
                {SKIN_TONES.map((v) => (
                  <option key={v} value={v}>
                    {title(v)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="styleVibe" className="label">
                Style vibe
              </label>
              <select
                id="styleVibe"
                value={form.styleVibe}
                onChange={(e) => update('styleVibe', e.target.value)}
                className="field"
              >
                <option value="">Select…</option>
                {STYLE_VIBES.map((v) => (
                  <option key={v} value={v}>
                    {title(v)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="budgetBand" className="label">
                Budget
              </label>
              <select
                id="budgetBand"
                value={form.budgetBand}
                onChange={(e) => update('budgetBand', e.target.value)}
                className="field"
              >
                <option value="">Select…</option>
                {BUDGET_BANDS.map((v) => (
                  <option key={v} value={v}>
                    {title(v)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="avoidColors" className="label">
              Colors to avoid
            </label>
            <div className="field flex flex-wrap items-center gap-2 py-2">
              {form.avoidColors.map((color) => (
                <span
                  key={color}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 py-1 pl-3 pr-1.5 text-sm text-ink"
                >
                  {color}
                  <button
                    type="button"
                    onClick={() => removeColor(color)}
                    aria-label={`Remove ${color}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-ink/50 transition hover:bg-ink/10 hover:text-ink"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="avoidColors"
                type="text"
                value={colorDraft}
                onChange={(e) => setColorDraft(e.target.value)}
                onKeyDown={handleColorKeyDown}
                onBlur={() => addColor(colorDraft)}
                className="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-sm text-ink outline-none placeholder:text-ink/40 focus:ring-0"
                placeholder={form.avoidColors.length ? 'Add another…' : 'e.g. neon green, orange'}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink/40">
              Press Enter or comma to add each color.
            </p>
          </div>
        </fieldset>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4 border-t border-ink/10 pt-6">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Saving…
              </>
            ) : isOnboarding ? (
              'Save & start styling'
            ) : (
              'Save profile'
            )}
          </button>
          {!isOnboarding && (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-ghost"
              disabled={saving}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="mt-8">
        <PhotoManager />
      </div>
    </div>
  )
}
