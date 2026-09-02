import { CURRENCIES, guessCurrency, money } from '../lib/money'
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch } from '../lib/api'
import type { ProfileResponse, StyleProfile } from '../lib/types'
import { useProfile } from '../context/useProfile'
import { useAuth } from '../context/useAuth'
import { Spinner } from '../components/Spinner'
import { PhotoManager } from '../components/PhotoManager'
import { RitualSettings } from '../components/RitualSettings'
import { getRitualStats, type RitualStats } from '../lib/brief'
import { PageShell, Stat, Toast, useFlash } from '../components/ui'

// Your profile: the facts your stylist dresses you by, the ritual that
// wakes you with a look, and the story your closet is telling.

const BODY_TYPES = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const
const SKIN_TONES = ['fair', 'light', 'medium', 'tan', 'deep'] as const
const STYLE_VIBES = ['minimal', 'classic', 'streetwear', 'bohemian', 'formal', 'sporty', 'edgy'] as const
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
  styleFor: string
  currency: string
  budgetBand: string
  city: string
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
  styleFor: '',
  currency: '',
  budgetBand: '',
  city: '',
  avoidColors: [],
}

function toFormState(profile: StyleProfile): FormState {
  return {
    bodyType: profile.bodyType ?? '',
    heightCm: typeof profile.heightCm === 'number' && !Number.isNaN(profile.heightCm) ? String(profile.heightCm) : '',
    sizeTop: profile.sizes?.top ?? '',
    sizeBottom: profile.sizes?.bottom ?? '',
    sizeShoe: profile.sizes?.shoe ?? '',
    skinTone: profile.skinTone ?? '',
    styleVibe: profile.styleVibe ?? '',
    styleFor: profile.styleFor ?? '',
    currency: profile.currency ?? '',
    budgetBand: profile.budgetBand ?? '',
    city: (profile as StyleProfile & { city?: string | null }).city ?? '',
    avoidColors: Array.isArray(profile.avoidColors) ? profile.avoidColors : [],
  }
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
    </div>
  )
}

function Select({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="field">
      <option value="">Select…</option>
      {options.map((v) => (
        <option key={v} value={v}>
          {title(v)}
        </option>
      ))}
    </select>
  )
}

export function ProfilePage() {
  usePageTitle('Your profile')
  const navigate = useNavigate()
  const { toast, flash } = useFlash()
  const { user } = useAuth()
  const { profile, loading: profileLoading, setProfile } = useProfile()
  const [ritual, setRitual] = useState<RitualStats | null>(null)
  const [redoing, setRedoing] = useState(false)
  async function redoFitting() {
    setRedoing(true)
    try {
      const { profile: saved } = await apiFetch<{ profile: StyleProfile }>('/profile', { method: 'PUT', body: { fittingStep: 0, fittingDone: false } })
      setProfile(saved)
      navigate('/fitting?s=0')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not restart the fitting.')
      setRedoing(false)
    }
  }
  useEffect(() => {
    getRitualStats().then(setRitual).catch(() => undefined)
  }, [])

  const isOnboarding = !profileLoading && !profile
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [hydrated, setHydrated] = useState(false)
  const [colorDraft, setColorDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        if (!cancelled && p) setForm(toFormState(p))
      })
      .catch(() => {})
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
    setForm((f) => (f.avoidColors.some((c) => c.toLowerCase() === value.toLowerCase()) ? f : { ...f, avoidColors: [...f.avoidColors, value] }))
    setColorDraft('')
  }
  function removeColor(color: string) {
    setForm((f) => ({ ...f, avoidColors: f.avoidColors.filter((c) => c !== color) }))
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
    const pending = colorDraft.trim()
    const avoidColors = pending && !form.avoidColors.some((c) => c.toLowerCase() === pending.toLowerCase()) ? [...form.avoidColors, pending] : form.avoidColors
    const heightNum = Number(form.heightCm)
    const body: Partial<StyleProfile> & { city?: string | null } = {
      bodyType: form.bodyType || undefined,
      heightCm: form.heightCm && !Number.isNaN(heightNum) ? heightNum : undefined,
      sizes: { top: form.sizeTop || undefined, bottom: form.sizeBottom || undefined, shoe: form.sizeShoe || undefined },
      skinTone: form.skinTone || undefined,
      styleVibe: form.styleVibe || undefined,
      styleFor: form.styleFor || undefined,
      currency: form.currency || null,
      budgetBand: form.budgetBand || undefined,
      city: form.city.trim() || null,
      avoidColors,
    }
    try {
      const { profile: saved } = await apiFetch<{ profile: StyleProfile }>('/profile', { method: 'PUT', body })
      setProfile(saved)
      setColorDraft('')
      if (isOnboarding) navigate('/', { replace: true })
      else flash('Saved. Your stylist has the update.')
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

  return (
    <PageShell>
      <Toast msg={toast} />

      {/* ---- mantel ---- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">{isOnboarding ? 'Welcome' : 'Your profile'}</p>
          <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
            {isOnboarding ? (
              <>
                Tell your <em className="text-brass">stylist.</em>
              </>
            ) : (
              <>
                The facts you’re <em className="text-brass">dressed by.</em>
              </>
            )}
          </h1>
          <p className="mt-3 max-w-xl animate-rise-1 text-sm text-ink/55">
            {isOnboarding
              ? 'A few details so every look actually fits you. Change any of it whenever you like.'
              : 'Measurements, taste and the things to avoid. Every brief is composed from these.'}
          </p>
        </div>
        {!isOnboarding && user?.handle && (
          <Link to={`/u/${user.handle}`} className="btn-ghost animate-rise-1">
            Your room · @{user.handle}
          </Link>
        )}
      </header>

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="min-w-0">
          <form onSubmit={handleSubmit} className="card animate-rise-2 p-5 sm:p-7">
            <fieldset className="space-y-5">
              <legend className="font-display text-2xl font-medium text-ink">Fit</legend>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="bodyType" label="Body type">
                  <Select id="bodyType" value={form.bodyType} onChange={(v) => update('bodyType', v)} options={BODY_TYPES} />
                </Field>
                <Field id="heightCm" label="Height (cm)">
                  <input id="heightCm" type="number" min={100} max={250} inputMode="numeric" value={form.heightCm} onChange={(e) => update('heightCm', e.target.value)} className="field" placeholder="e.g. 170" />
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field id="sizeTop" label="Top size">
                  <input id="sizeTop" type="text" value={form.sizeTop} onChange={(e) => update('sizeTop', e.target.value)} className="field" placeholder="e.g. M" />
                </Field>
                <Field id="sizeBottom" label="Bottom size">
                  <input id="sizeBottom" type="text" value={form.sizeBottom} onChange={(e) => update('sizeBottom', e.target.value)} className="field" placeholder="e.g. 32" />
                </Field>
                <Field id="sizeShoe" label="Shoe size">
                  <input id="sizeShoe" type="text" value={form.sizeShoe} onChange={(e) => update('sizeShoe', e.target.value)} className="field" placeholder="e.g. 9" />
                </Field>
              </div>
            </fieldset>

            <fieldset className="mt-8 space-y-5 border-t border-ink/10 pt-7">
              <legend className="font-display text-2xl font-medium text-ink">Taste</legend>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="skinTone" label="Skin tone">
                  <Select id="skinTone" value={form.skinTone} onChange={(v) => update('skinTone', v)} options={SKIN_TONES} />
                </Field>
                <Field id="styleVibe" label="Style vibe">
                  <Select id="styleVibe" value={form.styleVibe} onChange={(v) => update('styleVibe', v)} options={STYLE_VIBES} />
                </Field>
                <Field id="styleFor" label="Style me for">
                  <select id="styleFor" value={form.styleFor} onChange={(e) => update('styleFor', e.target.value)} className="field">
                    <option value="">Select…</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="unisex">Unisex</option>
                  </select>
                </Field>
                <Field id="currency" label="Currency">
                  <select id="currency" value={form.currency} onChange={(e) => update('currency', e.target.value)} className="field">
                    <option value="">Guess from my location ({guessCurrency()})</option>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="budgetBand" label="Budget">
                  <Select id="budgetBand" value={form.budgetBand} onChange={(v) => update('budgetBand', v)} options={BUDGET_BANDS} />
                </Field>
              </div>
              <Field id="city" label="Home city (for the weather in your brief)">
                <input id="city" type="text" value={form.city} onChange={(e) => update('city', e.target.value)} className="field" placeholder="e.g. Bengaluru" />
              </Field>
              <div>
                <label htmlFor="avoidColors" className="label">
                  Colours to avoid
                </label>
                <div className="field flex flex-wrap items-center gap-2 py-2">
                  {form.avoidColors.map((color) => (
                    <span key={color} className="inline-flex items-center gap-1.5 rounded-[3px] border border-ink/15 bg-bone py-1 pl-2.5 pr-1 text-sm text-ink">
                      {color}
                      <button type="button" onClick={() => removeColor(color)} aria-label={`Remove ${color}`} className="press flex h-5 w-5 items-center justify-center rounded-[2px] text-ink/50 hover:bg-ink/10 hover:text-ink">
                        <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        </svg>
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
                <p className="mt-1.5 text-xs text-ink/40">Press Enter or comma to add each colour.</p>
              </div>
            </fieldset>

            {error && (
              <p className="mt-6 alert-error" role="alert">
                {error}
              </p>
            )}
            <div className="mt-7 flex items-center gap-3 border-t border-ink/10 pt-6">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" /> Saving…
                  </>
                ) : isOnboarding ? (
                  'Save and start styling'
                ) : (
                  'Save profile'
                )}
              </button>
              {!isOnboarding && (
                <button type="button" onClick={() => navigate('/')} className="btn-ghost" disabled={saving}>
                  Back to Today
                </button>
              )}
            </div>
          </form>

          <div className="mt-6 animate-rise-3">
            <PhotoManager />
          </div>
        </div>

        {/* ---- right rail: the ritual, the story ---- */}
        {!isOnboarding && (
          <aside className="mt-8 flex flex-col gap-5 lg:mt-0 lg:self-start">
            <RitualSettings onNotice={flash} />
            <section className="card p-5">
              <p className="font-display text-xl font-medium text-ink">The fitting</p>
              <p className="mt-1 text-sm text-ink/55">Start the fitting again — who you dress for, your week, your pieces. Your closet and history stay.</p>
              <button
                type="button"
                disabled={redoing}
                onClick={() => void redoFitting()}
                className="btn-ghost mt-4 btn-sm"
              >
                {redoing ? 'One moment…' : 'Redo the fitting'}
              </button>
            </section>
            {ritual && (
              <section className="plaque p-5 pl-6">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Your closet, working</p>
                  <Link to="/journal" className="text-xs font-semibold text-brass hover:underline">
                    Wear history
                  </Link>
                </div>
                <p className="mt-1 font-display text-3xl font-semibold text-brass [font-variant-numeric:tabular-nums]">
                  {money(ritual.monthlyPayback)} <span className="font-sans text-xs font-semibold text-ink/55">back this month</span>
                </p>
                <div className="mt-3 grid grid-cols-3 gap-4 border-t border-ink/10 pt-3">
                  <Stat value={ritual.streak} label="day streak" />
                  <Stat value={`${ritual.rotationPct}%`} label="in rotation" />
                  <Stat value={ritual.outfitsThisWeek} label="this week" />
                </div>
              </section>
            )}
          </aside>
        )}
      </div>
    </PageShell>
  )
}
