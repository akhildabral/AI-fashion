import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Arch, FieldError, PageShell } from './ui'

// The door shell every public page shares: the panel on the left, the dawn
// photograph in the arch on the right, phone-first stacking. Only the panel
// changes between sign in, forgot, reset, verify, invite and join.

export function DoorShell({
  eyebrow,
  title,
  lead,
  note,
  children,
  foot,
  photo = 'morning',
  alt = 'An outfit laid out on a chair at dawn',
}: {
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  /** A quiet line above the title, e.g. "Signed out." */
  note?: ReactNode
  children?: ReactNode
  foot?: ReactNode
  photo?: 'morning' | 'mirror'
  alt?: string
}) {
  return (
    <PageShell>
      {/* Copy then picture: two columns from md, the copy the wider half. */}
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:py-8">
        <div className="mx-auto w-full max-w-md md:max-w-[480px]">
          {note && <div className="plaque mb-5 animate-rise p-3 pl-4 text-sm text-ink/70">{note}</div>}
          <p className="animate-rise eyebrow">{eyebrow}</p>
          <h1 className="page-title mt-2 animate-rise-1 [text-wrap:balance]">{title}</h1>
          {lead && <p className="mt-3 animate-rise-2 font-display text-xl italic text-ink/55">{lead}</p>}
          {children && <div className="card mt-8 animate-rise-3 p-5">{children}</div>}
          {foot && <div className="mt-4 flex animate-rise-3 flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink/55">{foot}</div>}
          <LegalLinks className="mt-8 animate-rise-3" />
        </div>
        <div className="mx-auto hidden w-full max-w-sm md:block">
          <Arch aspect="aspect-[3/4]" className="arch-photo w-full">
            <img src={`/landing/${photo}.webp`} alt={alt} width={1024} height={1024} className="relative z-[1] h-full w-full object-cover" />
          </Arch>
        </div>
      </div>
    </PageShell>
  )
}

/** Privacy and terms, quietly, on every public page. */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`flex flex-wrap gap-x-4 text-xs text-ink/45 ${className}`}>
      <Link to="/privacy" className="transition-colors hover:text-ink">
        Privacy
      </Link>
      <Link to="/terms" className="transition-colors hover:text-ink">
        Terms
      </Link>
    </p>
  )
}

/** The hairline "or" between the password and Google. */
export function Or() {
  return (
    <div className="my-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-label-xl text-ink/35" aria-hidden>
      <span className="h-px flex-1 bg-ink/10" />
      or
      <span className="h-px flex-1 bg-ink/10" />
    </div>
  )
}

/** A password field with show/hide inside it. */
export function PasswordField({
  id,
  value,
  onChange,
  label = 'Password',
  autoComplete = 'current-password',
  minLength,
  placeholder = '••••••••',
  aside,
  error,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  label?: string
  autoComplete?: string
  minLength?: number
  placeholder?: string
  /** A small link beside the label, e.g. "Forgot?" */
  aside?: ReactNode
  error?: ReactNode
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="label !mb-0">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field !pr-16"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="press absolute right-1 top-1/2 flex h-9 -translate-y-1/2 items-center px-3 text-[11px] font-semibold uppercase tracking-label-sm text-ink/55 transition-colors hover:text-ink"
          aria-pressed={show}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}

/** "Have an invite? Come in →" — reveals a field for a code or a pasted link. */
export function InviteDoor() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  function go(e: FormEvent) {
    e.preventDefault()
    const c = code.trim().toLowerCase().replace(/^.*\/join\//, '')
    if (c) navigate(`/join/${encodeURIComponent(c)}`)
  }
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} className="press font-semibold text-accent-text underline-offset-4 hover:underline">
        Have an invite? Come in →
      </button>
      {open && (
        <form onSubmit={go} className="flex w-full gap-2">
          <label htmlFor="invite-code" className="sr-only">
            Invite code
          </label>
          <input id="invite-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="your friend’s code or link" className="field field-sm min-w-0 flex-1" />
          <button type="submit" className="btn-ghost btn-sm shrink-0">
            Come in
          </button>
        </form>
      )}
    </>
  )
}

export function WaitlistLink() {
  return (
    <span>
      New here?{' '}
      <Link to="/landing" className="font-semibold text-accent-text underline-offset-4 hover:underline">
        Join the waitlist
      </Link>
    </span>
  )
}

export function SignInLink({ label = '← Back to sign in' }: { label?: string }) {
  return (
    <Link to="/login" className="font-semibold text-accent-text underline-offset-4 hover:underline">
      {label}
    </Link>
  )
}
