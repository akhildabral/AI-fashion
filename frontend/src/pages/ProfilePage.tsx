import { CURRENCIES, guessCurrency } from '../lib/money'
import { setHandle } from '../lib/social'
import { checkHandle, deleteAccount, saveFitting, updateName, type FittingPatch } from '../lib/fitting'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { apiFetch, getToken } from '../lib/api'
import type { StyleProfile, User } from '../lib/types'
import { useProfile } from '../context/useProfile'
import { useAuth } from '../context/useAuth'
import { Spinner } from '../components/Spinner'
import { PhotoManager } from '../components/PhotoManager'
import { RitualSettings } from '../components/RitualSettings'
import { Modal, PageShell, Tabs, Toast, useFlash } from '../components/ui'

// You: the fitting's answers, editable with the fitting's own controls and
// saved as you change them; the ritual; and the account beside them.

const BUILDS = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const
const TONES: [string, string][] = [
  ['fair', '#F3DCC8'],
  ['light', '#E6BE9A'],
  ['medium', '#C9946A'],
  ['tan', '#A06A45'],
  ['deep', '#5E3B2A'],
]
const COLOURS: [string, string][] = [
  ['red', '#B8322E'],
  ['orange', '#D9782D'],
  ['yellow', '#E3C24B'],
  ['green', '#4E7A4B'],
  ['teal', '#2F7F84'],
  ['blue', '#3459A8'],
  ['purple', '#6E4B9E'],
  ['pink', '#D98AA9'],
  ['brown', '#7A5230'],
  ['neon', '#B6F53A'],
]
const INTENTS: [string, string][] = [
  ['decided', 'Decided for me'],
  ['own', 'Wearing what I own, better'],
  ['friends', 'Dressed by my friends'],
]
const OCCASIONS: [string, string][] = [
  ['work', 'Work'],
  ['casual', 'Weekends'],
  ['evening', 'Evenings out'],
  ['occasion', 'Occasions'],
  ['athletic', 'Training'],
]
const VIBES = ['minimal', 'classic', 'streetwear', 'bohemian', 'formal', 'sporty', 'edgy'] as const
const BUDGETS: [string, string][] = [
  ['budget', 'Carefully'],
  ['mid', 'Mid-range'],
  ['premium', 'Premium'],
  ['luxury', 'Luxury'],
]
const WHO: [string, string][] = [
  ['female', 'Her'],
  ['male', 'Him'],
  ['unisex', 'Either'],
]
const TOP_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const BOTTOM_SIZES = ['24', '26', '28', '30', '32', '34', '36', '38', '40']
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']

type Section = 'fit' | 'taste' | 'ritual' | 'account'

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`chip ${on ? 'chip-on' : ''}`}>
      {children}
    </button>
  )
}
function RowLabel({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return <p className={`${first ? '' : 'mt-7'} text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45`}>{children}</p>
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink/10 py-3.5 first:border-t-0">
      <span className="text-sm text-ink/55">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

/** Height reads in the member's units; it is always stored in centimetres. */
function heightLabel(cm: number, units: string | null | undefined): string {
  if (units === 'imperial') {
    const inches = Math.round(cm / 2.54)
    return `${Math.floor(inches / 12)}′ ${inches % 12}″`
  }
  return `${cm} cm`
}

export function ProfilePage() {
  usePageTitle('You')
  const navigate = useNavigate()
  const { toast, flash } = useFlash()
  const { user, logout, adoptSession } = useAuth()
  const { profile, loading: profileLoading, setProfile } = useProfile()
  const [section, setSection] = useState<Section>('fit')
  const [whisper, setWhisper] = useState<string>('')
  const [height, setHeight] = useState(170)
  const [city, setCity] = useState('')
  const [sizeDraft, setSizeDraft] = useState<{ top: string; bottom: string; shoe: string }>({ top: '', bottom: '', shoe: '' })
  const timers = useRef<Record<string, number>>({})
  const latest = useRef<StyleProfile | null>(profile)
  latest.current = profile
  const [redoing, setRedoing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!profile) return
    setHeight(profile.heightCm || 170)
    setCity(profile.city ?? '')
    setSizeDraft({ top: profile.sizes?.top ?? '', bottom: profile.sizes?.bottom ?? '', shoe: profile.sizes?.shoe ?? '' })
  }, [profile])

  // Every change saves itself, a moment after the last keystroke or tap.
  const save = useCallback(
    (patch: FittingPatch, key = 'profile', delay = 400) => {
      const merged = { ...(latest.current as StyleProfile), ...(patch as Partial<StyleProfile>) } as StyleProfile
      latest.current = merged
      setProfile(merged)
      if (timers.current[key]) window.clearTimeout(timers.current[key])
      timers.current[key] = window.setTimeout(() => {
        saveFitting(patch)
          .then(({ profile: saved }) => {
            setProfile(saved)
            setWhisper('Saved.')
            window.setTimeout(() => setWhisper(''), 1600)
          })
          .catch((err) => flash(err instanceof Error ? err.message : 'Could not save that.'))
      }, delay)
    },
    [setProfile, flash],
  )

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

  if (profileLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink/50">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const avoid = new Set((profile?.avoidColors ?? []).map((c) => c.toLowerCase()))
  const custom = (profile?.avoidColors ?? []).filter((c) => !COLOURS.some(([k]) => k === c.toLowerCase()))
  const units = profile?.units ?? 'metric'
  const sizes = profile?.sizes ?? {}

  function setSize(kind: 'top' | 'bottom' | 'shoe', value: string) {
    const next = { ...sizes, [kind]: value || undefined }
    setSizeDraft((d) => ({ ...d, [kind]: value }))
    save({ sizes: next }, `size-${kind}`)
  }
  function toggleAvoid(colour: string) {
    const list = profile?.avoidColors ?? []
    const next = avoid.has(colour) ? list.filter((c) => c.toLowerCase() !== colour) : [...list, colour]
    save({ avoidColors: next })
  }
  function toggleOccasion(k: string) {
    const list = profile?.occasions ?? []
    save({ occasions: list.includes(k) ? list.filter((x) => x !== k) : [...list, k] })
  }

  return (
    <PageShell>
      <Toast msg={toast} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">You</p>
          <h1 className="mt-1.5 animate-rise-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
            The facts you’re <em className="text-brass">dressed by.</em>
          </h1>
          <p className="mt-3 max-w-xl animate-rise-1 text-sm text-ink/55">What the fitting learned, editable here. Every change saves itself.</p>
        </div>
        {user?.handle && (
          <Link to={`/u/${user.handle}`} className="btn-ghost animate-rise-1">
            Your room
          </Link>
        )}
      </header>

      {!profile ? (
        <section className="card mt-8 animate-rise-2 p-6 text-center">
          <p className="font-display text-2xl text-ink">Your stylist hasn’t met you yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">The fitting takes a few minutes: who you dress for, your measure, your taste.</p>
          <Link to="/fitting" className="btn-primary mt-5 inline-flex">
            Start the fitting
          </Link>
        </section>
      ) : (
        <>
          <div className="mt-6 flex animate-rise-1 flex-wrap items-end justify-between gap-3">
            <Tabs
              label="Sections"
              value={section}
              onChange={setSection}
              items={[
                { key: 'fit', label: 'Fit' },
                { key: 'taste', label: 'Taste' },
                { key: 'ritual', label: 'Ritual' },
                { key: 'account', label: 'Account' },
              ]}
            />
            <p className="min-h-[1rem] font-display text-sm italic text-ink/45" aria-live="polite">
              {whisper}
            </p>
          </div>

          <div className="mt-6 animate-rise-2 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
            <div className="min-w-0">
              {section === 'fit' && (
                <section className="card p-5 sm:p-7">
                  <RowLabel first>How tall</RowLabel>
                  <p className="mt-2 font-display text-5xl leading-none text-ink [font-variant-numeric:tabular-nums]">{heightLabel(height, units)}</p>
                  <input
                    type="range"
                    min={140}
                    max={210}
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    onPointerUp={() => save({ heightCm: height }, 'height', 150)}
                    onKeyUp={() => save({ heightCm: height }, 'height', 500)}
                    aria-label="Height"
                    className="tape mt-4 w-full max-w-xl"
                    style={{ ['--p' as string]: `${((height - 140) / 70) * 100}%` }}
                  />
                  <div className="mt-2 flex max-w-xl justify-between text-[10px] tracking-[0.14em] text-ink/40">
                    <span>{heightLabel(140, units)}</span>
                    <span>{heightLabel(175, units)}</span>
                    <span>{heightLabel(210, units)}</span>
                  </div>

                  <RowLabel>Build</RowLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BUILDS.map((b) => (
                      <Chip key={b} on={profile.bodyType === b} onClick={() => save({ bodyType: b })}>
                        {title(b)}
                      </Chip>
                    ))}
                  </div>

                  <div className="mt-7 flex items-end justify-between gap-3">
                    <RowLabel first>What you reach for · tops</RowLabel>
                    <input value={sizeDraft.top} onChange={(e) => setSizeDraft((d) => ({ ...d, top: e.target.value }))} onBlur={(e) => setSize('top', e.target.value.trim())} className="field field-sm !h-8 w-20 text-center" placeholder="or type" aria-label="Top size" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {TOP_SIZES.map((s) => (
                      <Chip key={s} on={(sizes.top ?? '').toUpperCase() === s} onClick={() => setSize('top', s)}>
                        {s}
                      </Chip>
                    ))}
                  </div>
                  <div className="mt-7 flex items-end justify-between gap-3">
                    <RowLabel first>Bottoms</RowLabel>
                    <input value={sizeDraft.bottom} onChange={(e) => setSizeDraft((d) => ({ ...d, bottom: e.target.value }))} onBlur={(e) => setSize('bottom', e.target.value.trim())} className="field field-sm !h-8 w-20 text-center" placeholder="or type" aria-label="Bottom size" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {BOTTOM_SIZES.map((s) => (
                      <Chip key={s} on={sizes.bottom === s} onClick={() => setSize('bottom', s)}>
                        {s}
                      </Chip>
                    ))}
                  </div>
                  <div className="mt-7 flex items-end justify-between gap-3">
                    <RowLabel first>Shoes</RowLabel>
                    <input value={sizeDraft.shoe} onChange={(e) => setSizeDraft((d) => ({ ...d, shoe: e.target.value }))} onBlur={(e) => setSize('shoe', e.target.value.trim())} className="field field-sm !h-8 w-20 text-center" placeholder="or type" aria-label="Shoe size" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {SHOE_SIZES.map((s) => (
                      <Chip key={s} on={sizes.shoe === s} onClick={() => setSize('shoe', s)}>
                        {s}
                      </Chip>
                    ))}
                  </div>

                  <RowLabel>Who we dress</RowLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {WHO.map(([k, l]) => (
                      <Chip key={k} on={profile.styleFor === k} onClick={() => save({ styleFor: k })}>
                        {l}
                      </Chip>
                    ))}
                  </div>
                </section>
              )}

              {section === 'taste' && (
                <section className="card p-5 sm:p-7">
                  <RowLabel first>Your tone</RowLabel>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {TONES.map(([k, c]) => (
                      <button
                        key={k}
                        type="button"
                        aria-label={k}
                        aria-pressed={profile.skinTone === k}
                        onClick={() => save({ skinTone: k })}
                        className={`press h-11 w-11 rounded-[3px] border border-black/15 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2 focus-visible:ring-offset-bone ${profile.skinTone === k ? 'ring-2 ring-iris ring-offset-2 ring-offset-bone' : ''}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>

                  <RowLabel>Never on me</RowLabel>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {COLOURS.map(([k, c]) => {
                      const on = avoid.has(k)
                      return (
                        <button
                          key={k}
                          type="button"
                          aria-label={`Avoid ${k}`}
                          aria-pressed={on}
                          onClick={() => toggleAvoid(k)}
                          className={`press relative h-11 w-11 rounded-[3px] border border-black/15 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2 focus-visible:ring-offset-bone ${on ? 'opacity-45' : ''}`}
                          style={{ background: c }}
                        >
                          {on && <span aria-hidden className="absolute -left-1.5 -right-1.5 top-1/2 h-0.5 -rotate-45 bg-ink ring-2 ring-bone" />}
                        </button>
                      )
                    })}
                  </div>
                  {custom.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {custom.map((c) => (
                        <Chip key={c} on onClick={() => toggleAvoid(c.toLowerCase())}>
                          {c} ×
                        </Chip>
                      ))}
                    </div>
                  )}

                  <RowLabel>What matters most</RowLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {INTENTS.map(([k, l]) => (
                      <Chip key={k} on={(profile.intents ?? [])[0] === k} onClick={() => save({ intents: [k] })}>
                        {l}
                      </Chip>
                    ))}
                  </div>

                  <RowLabel>The days you dress for</RowLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {OCCASIONS.map(([k, l]) => (
                      <Chip key={k} on={(profile.occasions ?? []).includes(k)} onClick={() => toggleOccasion(k)}>
                        {l}
                      </Chip>
                    ))}
                  </div>

                  <RowLabel>Your vibe</RowLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {VIBES.map((v) => (
                      <Chip key={v} on={profile.styleVibe === v} onClick={() => save({ styleVibe: v })}>
                        {title(v)}
                      </Chip>
                    ))}
                  </div>

                  <RowLabel>How you shop</RowLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BUDGETS.map(([k, l]) => (
                      <Chip key={k} on={profile.budgetBand === k} onClick={() => save({ budgetBand: k })}>
                        {l}
                      </Chip>
                    ))}
                  </div>

                  <RowLabel>Currency</RowLabel>
                  <select value={profile.currency ?? ''} onChange={(e) => save({ currency: e.target.value || null })} className="field mt-3 max-w-xs" aria-label="Currency">
                    <option value="">Guess from my location ({guessCurrency()})</option>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </section>
              )}

              {section === 'ritual' && (
                <div className="grid gap-5">
                  <RitualSettings onNotice={flash} />
                  <section className="card p-5 sm:p-7">
                    <RowLabel first>Home city · for the weather in your brief</RowLabel>
                    <input value={city} onChange={(e) => setCity(e.target.value)} onBlur={() => (city.trim() || null) !== (profile.city ?? null) && save({ city: city.trim() || null }, 'city', 0)} className="field mt-3 max-w-xs" placeholder="e.g. Dubai" aria-label="Home city" />
                    <RowLabel>Units</RowLabel>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Chip on={units === 'metric'} onClick={() => save({ units: 'metric' })}>
                        °C · cm
                      </Chip>
                      <Chip on={units === 'imperial'} onClick={() => save({ units: 'imperial' })}>
                        °F · ft
                      </Chip>
                    </div>
                  </section>
                </div>
              )}

              {section === 'account' && (
                <AccountSection
                  user={user}
                  profile={profile}
                  onName={(u) => {
                    const t = getToken()
                    if (t) adoptSession(t, u)
                  }}
                  onNote={flash}
                  onRedo={() => void redoFitting()}
                  redoing={redoing}
                  onSignOut={() => {
                    logout()
                    navigate('/login', { replace: true })
                  }}
                  onDelete={() => setDeleting(true)}
                />
              )}
            </div>

            <aside className="mt-8 flex flex-col gap-5 lg:mt-0 lg:self-start">
              {section === 'fit' && <PhotoManager />}
              {section === 'fit' && (
                <section className="plaque p-5 pl-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Nothing here is shown to anyone</p>
                  <p className="mt-1 text-sm text-ink/60">Your measure and your photo stay between you and the stylist. Friends see your name, your room and the pieces you make public.</p>
                </section>
              )}
              {section === 'taste' && (
                <section className="plaque p-5 pl-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">How this is used</p>
                  <p className="mt-1 text-sm text-ink/60">Struck colours never come back in a brief. Your tone steers the shades. The days you dress for decide what the week is composed around.</p>
                  <Link to="/journal" className="mt-3 inline-block text-xs font-semibold text-brass hover:underline">
                    The record, where the numbers live →
                  </Link>
                </section>
              )}
              {section === 'ritual' && (
                <section className="plaque p-5 pl-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">The day, in three acts</p>
                  <p className="mt-1 text-sm text-ink/60">Morning: the brief, composed and waiting. Evening: a second look, or the recap. Tonight: tomorrow laid out at eight.</p>
                </section>
              )}
              {section === 'account' && <AddressCard current={user?.handle ?? null} onChanged={(h) => flash(`Your address is now /u/${h}.`)} />}
            </aside>
          </div>
        </>
      )}

      {deleting && (
        <DeleteModal
          email={user?.email ?? ''}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            logout()
            navigate('/landing', { replace: true })
          }}
        />
      )}
    </PageShell>
  )
}

function AccountSection({
  user,
  profile,
  onName,
  onNote,
  onRedo,
  redoing,
  onSignOut,
  onDelete,
}: {
  user: User | null
  profile: StyleProfile
  onName: (u: User) => void
  onNote: (msg: string) => void
  onRedo: () => void
  redoing: boolean
  onSignOut: () => void
  onDelete: () => void
}) {
  const [editingName, setEditingName] = useState(false)
  const [first, setFirst] = useState(user?.firstName ?? '')
  const [last, setLast] = useState(user?.lastName ?? '')
  const [savingName, setSavingName] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  const plan = user?.plan ?? 'free'
  const planLabel = plan === 'founder' ? 'Founding member' : plan === 'free' ? 'Free' : title(plan)

  async function saveName() {
    if (!first.trim() || savingName) return
    setSavingName(true)
    try {
      const { user: u } = await updateName(first.trim(), last.trim() || null)
      onName({ ...user, ...u })
      setEditingName(false)
      onNote('Saved.')
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not change your name.')
    } finally {
      setSavingName(false)
    }
  }
  async function sendLink() {
    if (!user?.email || linkSent) return
    try {
      await apiFetch('/auth/forgot', { method: 'POST', body: { email: user.email } })
      setLinkSent(true)
      onNote('A link to set a new password is on its way. It lasts an hour.')
    } catch {
      onNote('Could not send the link — try again in a moment.')
    }
  }

  return (
    <section className="card px-5 py-2 sm:px-7">
      <Row label="Name">
        {editingName ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void saveName()
            }}
          >
            <input value={first} onChange={(e) => setFirst(e.target.value)} className="field field-sm w-32" placeholder="First" aria-label="First name" autoFocus />
            <input value={last} onChange={(e) => setLast(e.target.value)} className="field field-sm w-32" placeholder="Last" aria-label="Last name" />
            <button type="submit" disabled={!first.trim() || savingName} className="btn-primary btn-sm">
              {savingName ? '…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditingName(false)} className="btn-quiet !h-9 !text-xs">
              Cancel
            </button>
          </form>
        ) : (
          <>
            <b className="text-sm font-semibold text-ink">{user?.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ') ?? '—'}</b>
            <button type="button" onClick={() => setEditingName(true)} className="text-xs font-semibold text-brass hover:underline">
              Change
            </button>
          </>
        )}
      </Row>
      <Row label="Email">
        <b className="truncate text-sm font-semibold text-ink">{user?.email}</b>
        <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${user?.emailVerified ? 'text-brass' : 'text-ink/40'}`}>{user?.emailVerified ? 'verified' : 'unverified'}</span>
      </Row>
      <Row label="Password">
        <b className="text-sm font-semibold text-ink">{user?.hasPassword ? '········' : user?.hasGoogle ? 'Google sign-in' : '—'}</b>
        <button type="button" onClick={() => void sendLink()} disabled={linkSent} className="text-xs font-semibold text-brass hover:underline disabled:opacity-50">
          {linkSent ? 'Link sent' : user?.hasPassword ? 'Send a change link' : 'Set a password'}
        </button>
      </Row>
      <Row label="Membership">
        <b className="text-sm font-semibold text-ink">{planLabel}</b>
        <Link to="/billing" className="text-xs font-semibold text-brass hover:underline">
          Plan &amp; usage
        </Link>
      </Row>
      <Row label="The fitting">
        <b className="text-sm font-semibold text-ink">{profile.fittingCompletedAt ? `Done ${new Date(profile.fittingCompletedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Not finished'}</b>
        <button type="button" onClick={onRedo} disabled={redoing} className="text-xs font-semibold text-brass hover:underline">
          {redoing ? 'One moment…' : 'Redo it'}
        </button>
      </Row>
      <Row label="Member since">
        <b className="text-sm font-semibold text-ink">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—'}</b>
      </Row>
      <Row label="Sign out">
        <button type="button" onClick={onSignOut} className="btn-quiet !h-9 !text-xs">
          Sign out of this device
        </button>
      </Row>
      <Row label="Delete the account">
        <span className="text-xs text-ink/45">Everything goes: the closet, the record, every photo.</span>
        <button type="button" onClick={onDelete} className="text-xs font-semibold text-[#D0524E] hover:underline">
          Delete…
        </button>
      </Row>
    </section>
  )
}

/** The way out, with the email typed to be sure. */
function DeleteModal({ email, onClose, onDeleted }: { email: string; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = typed.trim().toLowerCase() === email.toLowerCase()
  async function go() {
    if (!ok || busy) return
    setBusy(true)
    try {
      await deleteAccount(typed.trim())
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account.')
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Delete the account">
      <p className="text-sm text-ink/70">This removes your account, your closet, the record, your circle and every photo. There is no way back.</p>
      <label htmlFor="del-confirm" className="label mt-5">
        Type your email to confirm
      </label>
      <input id="del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} className="field" placeholder={email} autoComplete="off" />
      {error && (
        <p className="mt-3 alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="action-row mt-5">
        <button type="button" disabled={!ok || busy} onClick={() => void go()} className="btn-ghost !border-[#D0524E]/60 !text-[#D0524E] disabled:opacity-40">
          {busy ? 'Deleting…' : 'Delete everything'}
        </button>
        <button type="button" onClick={onClose} className="btn-quiet">
          Keep my account
        </button>
      </div>
    </Modal>
  )
}

/** Your address on the circle: given automatically, changeable here, never asked for. */
function AddressCard({ current, onChanged }: { current: string | null; onChanged: (handle: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current ?? '')
  const [state, setState] = useState<{ ok: boolean; msg: string }>({ ok: false, msg: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const handle = saved ?? current

  useEffect(() => {
    if (!editing) return
    const h = value.trim()
    if (h === handle) {
      setState({ ok: false, msg: 'That’s your address now.' })
      return
    }
    if (!/^[a-z0-9_]{3,20}$/.test(h)) {
      setState({ ok: false, msg: '3–20 characters: a–z, 0–9, underscore.' })
      return
    }
    const t = window.setTimeout(() => {
      checkHandle(h)
        .then((r) => setState(r.available ? { ok: true, msg: 'Free.' } : { ok: false, msg: 'Taken — try another.' }))
        .catch(() => setState({ ok: false, msg: 'Could not check that just now.' }))
    }, 250)
    return () => window.clearTimeout(t)
  }, [value, editing, handle])

  async function save() {
    if (!state.ok || saving) return
    setSaving(true)
    try {
      const { user } = await setHandle(value.trim())
      setSaved(user.handle)
      setEditing(false)
      onChanged(user.handle)
    } catch (err) {
      setState({ ok: false, msg: err instanceof Error ? err.message : 'Could not change that.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card p-5">
      <p className="font-display text-xl font-medium text-ink">Your address</p>
      <p className="mt-1 text-sm text-ink/55">Friends see your name. This is the link to your room.</p>
      {!editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <code className="text-sm text-ink">/u/{handle ?? '…'}</code>
          <button type="button" onClick={() => setEditing(true)} className="btn-quiet !h-8 !text-xs">
            Change
          </button>
        </div>
      ) : (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="flex gap-2">
            <input value={value} onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))} className="field field-sm min-w-0 flex-1" autoCapitalize="none" autoFocus aria-label="Your address" />
            <button type="submit" disabled={!state.ok || saving} className="btn-primary btn-sm shrink-0">
              {saving ? '…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-quiet !h-9 !text-xs">
              Cancel
            </button>
          </div>
          <p className={`mt-1.5 text-xs ${state.ok ? 'text-brass' : 'text-ink/50'}`} aria-live="polite">
            {state.msg}
          </p>
        </form>
      )}
    </section>
  )
}
