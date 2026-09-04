import { useState as useFlashState, useRef as useFlashRef, useEffect as useFlashEffect,  useEffect, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { resolveImageUrl } from '../lib/api'
import type { OutfitVerdict } from '@zauq/shared/types'

/**
 * The layout system. Every screen composes from these primitives — same
 * shell, same rhythm, no page invents its own containers.
 */

export function PageShell({
  children,
  wide = false,
  narrow = false,
}: {
  children: ReactNode
  wide?: boolean
  narrow?: boolean
}) {
  const width = wide ? 'max-w-shell-wide' : narrow ? 'max-w-shell-narrow' : 'max-w-shell'
  return <div className={`mx-auto ${width} px-4 py-8 sm:px-6 sm:py-10`}>{children}</div>
}

/** The tracked uppercase label: 10px / 600 / .28em / brass. Sits 8px above the
 *  Bodoni line it labels. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>
}

/**
 * The page head: an eyebrow over a Bodoni line at the section-head size
 * (30 → 36 at sm), one italic brass clause in the title, an optional 15px
 * supporting line, and a right-hand slot that wraps under on a phone.
 */
export function PageHead({
  eyebrow,
  title,
  line,
  aside,
  className = '',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  line?: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex animate-rise flex-wrap items-end justify-between gap-x-6 gap-y-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className={`page-title ${eyebrow ? 'mt-2' : ''}`}>{title}</h1>
        {line && <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-ink/55">{line}</p>}
      </div>
      {aside}
    </div>
  )
}

/** A section head: a Bodoni title (24) with an optional eyebrow above and an
 *  optional action pushed right. 16px below it, the body. */
export function SectionHead({
  title,
  eyebrow,
  action,
  className = '',
}: {
  title: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`mb-4 flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className={`section-title ${eyebrow ? 'mt-2' : ''}`}>{title}</h2>
      </div>
      {action}
    </div>
  )
}

/** The empty state: one italic Bodoni line and the single action that fixes it. */
export function EmptyState({
  line,
  action,
  className = '',
}: {
  line: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`max-w-lg ${className}`}>
      <p className="empty-line">{line}</p>
      {action && <div className="action-row mt-4">{action}</div>}
    </div>
  )
}

/** An inline message on a 10–12% wash of its own colour, directly above the
 *  thing it concerns. No icon, no border. */
export function Alert({
  tone = 'error',
  children,
  className = '',
}: {
  tone?: 'error' | 'warning' | 'success'
  children: ReactNode
  className?: string
}) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`alert-${tone} ${className}`}>
      {children}
    </p>
  )
}

/** The stylist's verdict on a look, as inline alerts under the facts it
 *  concerns: the broken rules as one error line when the look is not
 *  complete, then each bent rule as a warning (joined by " · " past two).
 *  Messages arrive in the ZAUQ voice and render verbatim. Nothing for an
 *  absent or clean verdict, so older responses look exactly as before.
 *  16 between blocks. */
export function VerdictNotes({ verdict, className = '' }: { verdict?: OutfitVerdict | null; className?: string }) {
  if (!verdict) return null
  const warnings = (verdict.warnings ?? []).map((w) => w?.message).filter((m): m is string => !!m)
  const violations = (verdict.violations ?? []).map((v) => v?.message).filter((m): m is string => !!m)
  const broken = verdict.ok === false
  if (!broken && warnings.length === 0) return null
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {broken && <Alert tone="error">Nothing in the closet makes this complete{violations.length ? `: ${violations.join(' · ')}` : '.'}</Alert>}
      {warnings.length > 2 ? (
        <Alert tone="warning">{warnings.join(' · ')}</Alert>
      ) : (
        warnings.map((w) => (
          <Alert key={w} tone="warning">
            {w}
          </Alert>
        ))
      )}
    </div>
  )
}

/** The invalid state of a field: one 12px danger line directly under the
 *  field it belongs to. Point the field's aria-describedby at `id`. */
export function FieldError({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} role="alert" className={`field-error ${className}`}>
      {children}
    </p>
  )
}

/** The tracked label above a row of chips or fields: 32 above it (block to
 *  block), 8 below it — the row that follows carries `mt-2`. `first` drops
 *  the 32 when it opens a card. */
export function RowLabel({ children, first = false, className = '' }: { children: ReactNode; first?: boolean; className?: string }) {
  return <p className={`${first ? '' : 'mt-8'} text-xs font-semibold uppercase tracking-label-lg text-ink/45 ${className}`}>{children}</p>
}

/** A count or a one-word state. Brass by default; `quiet` for an ink wash. Never a button. */
export function Badge({
  tone = 'brass',
  children,
  className = '',
}: {
  tone?: 'brass' | 'quiet'
  children: ReactNode
  className?: string
}) {
  return <span className={`${tone === 'quiet' ? 'badge-quiet' : 'badge-spark'} ${className}`}>{children}</span>
}

/** A chip picks a value: bordered off, brass fill when on. 36 tall. */
export function Chip({
  on = false,
  onClick,
  disabled,
  children,
  className = '',
  title,
}: {
  on?: boolean
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick} title={title} className={`chip ${on ? 'chip-on' : ''} ${className}`}>
      {children}
    </button>
  )
}

/** A 36px square bordered button. Default content is the ··· overflow glyph;
 *  pass a 12–16px hand-drawn SVG for anything else. `label` is the accessible name. */
export function IconButton({
  label,
  onClick,
  children,
  className = '',
  ...rest
}: {
  label: string
  onClick?: () => void
  children?: ReactNode
  className?: string
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: boolean
  disabled?: boolean
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`btn-icon ${className}`} {...rest}>
      {children ?? <span className="text-lg leading-none tracking-tight">···</span>}
    </button>
  )
}

/** The engraved plaque: a tracked label, a Bodoni figure at the section-head
 *  size, a note beside it. Never a control, never clickable. */
export function Plaque({
  label,
  value,
  note,
  children,
  className = '',
}: {
  label?: ReactNode
  value?: ReactNode
  note?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={`plaque p-4 pl-5 ${className}`}>
      {label && <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">{label}</p>}
      {value && (
        <p className="mt-1 font-display text-4xl font-medium leading-[1.1] text-brass-ink [font-variant-numeric:tabular-nums]">
          {value}
          {note && <span className="font-sans text-sm font-normal text-ink/55"> {note}</span>}
        </p>
      )}
      {children}
    </div>
  )
}

/**
 * The arch — the one curved form in the app. A brass-bezel aperture with a
 * lit niche inside, used wherever a garment or a reflection appears. Wrap any
 * content (image, silhouette, ghost) in it.
 *
 * The crown is a semicircle of radius w/2 (the brand mark's own curve), so the
 * arch is a PORTRAIT form: `aspect-[2/3]`, `[3/4]`, `[4/5]`, `[5/6]` or
 * `aspect-square` (the limit). A landscape picture is never an arch — use a
 * `.rect-frame` (3px rectangle, hairline) instead.
 */
export function Arch({
  children,
  className = '',
  aspect = 'aspect-[3/4]',
  bright = false,
}: {
  children: ReactNode
  className?: string
  aspect?: string
  /** A brighter bezel — the "lit / selected" state. */
  bright?: boolean
}) {
  return (
    <div
      className={`arch-bezel ${aspect} ${className}`}
      style={bright ? { filter: 'brightness(1.18) saturate(1.05)' } : undefined}
    >
      <div className="arch-niche h-full w-full">{children}</div>
    </div>
  )
}

/** The one garment tile — a garment spotlit in its arched niche. */
export function GarmentTile({
  imageUrl,
  label,
  sublabel,
  onClick,
  selected = false,
  processing = false,
  // A small brass plate over the top-right of the niche (e.g. "New").
  badge,
  // A gently-tall arch that garments (aspect ~0.7–1.1) fill well; contain
  // still preserves every garment's true proportions.
  aspect = 'aspect-[5/6]',
  // kept for source compatibility; the tile is always arched now.
  arch: _arch,
  className = '',
  style,
}: {
  imageUrl: string
  label?: string
  sublabel?: string
  onClick?: () => void
  selected?: boolean
  processing?: boolean
  badge?: string
  aspect?: string
  arch?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={style}
      className={`press group relative block w-full min-w-0 text-left ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className}`}
    >
      {badge && <Badge className="absolute right-2 top-2 z-[4]">{badge}</Badge>}
      <Arch aspect={aspect} bright={selected}>
        <img
          src={resolveImageUrl(imageUrl)}
          alt={label ?? ''}
          loading="lazy"
          className={`relative z-[1] h-full w-full object-contain p-[7%] transition duration-500 ${
            processing ? 'scale-95 opacity-40 blur-[2px]' : ''
          }`}
        />
        {processing && (
          <span className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--text-in-niche)]">
            developing
          </span>
        )}
      </Arch>
      {(label || sublabel) && (
        <div className="px-1 pt-2 text-center">
          {label && (
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/75">
              {label}
            </p>
          )}
          {sublabel && <p className="truncate text-xs text-brass-ink">{sublabel}</p>}
        </div>
      )}
    </button>
  )
}

/** Centered modal — the one detail surface. Focus lands center-stage. */
export function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}) {
  const panelRef = useFlashRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Details'}
        tabIndex={-1}
        className="relative flex max-h-[88vh] w-full max-w-lg animate-rise flex-col overflow-hidden rounded-[3px] border border-brass/30 bg-bone shadow-float outline-none"
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <p className="font-display text-xl font-medium text-ink">{title ?? 'Details'}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="press flex h-8 w-8 items-center justify-center rounded-[3px] border border-ink/15 text-ink/60 transition-colors hover:border-brass hover:text-ink"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Small labelled stat — Bodoni figure over a tracked label. */
export function Stat({ value, label, accent = false, className = '' }: { value: ReactNode; label: string; accent?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className={`font-display text-2xl font-medium leading-[1.2] [font-variant-numeric:tabular-nums] ${accent ? 'text-brass-ink' : 'text-ink'}`}>
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</p>
    </div>
  )
}

/** The arched mirror — the brand's signature object. A 3px brass bezel around
 *  a dark reflective surface; the sheen is what the light-catch sweeps across.
 *  Give the child a 2/3 box (--ratio-mirror): a mirror holds a standing figure.
 *  One crown formula only — the same semicircle as every arch, at 2/3. */
export function MirrorFrame({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div
        className="p-[3px]"
        style={{
          borderRadius: 'var(--mirror-radius)',
          background:
            'linear-gradient(160deg, var(--c-brass-hi), var(--c-brass) 45%, var(--c-brass-lo) 82%)',
        }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            /* Match the bezel radius so the niche nests cleanly — a smaller
               radius lets the fill spill past the brass edge at the corners. */
            borderRadius: 'var(--mirror-radius)',
            /* The mirror keeps a dark reflective surface (renders cover it;
               the empty state stays atmospheric) — not the garment vitrine. */
            background: 'radial-gradient(76% 66% at 50% 30%, #211d17, #0c0b09 84%)',
          }}
        >
          {children}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              /* A whisper of shine on the glass — the mirror surface is near-
                 black, so even a faint band reads; keep it barely there. */
              background:
                'linear-gradient(123deg, transparent 48%, rgba(236,229,216,0.05) 50%, transparent 52%)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Transient bottom-center notice, shared across pages: const { toast, flash } =
 * useFlash(); render <Toast msg={toast} /> once per page. Matches the pattern
 * TodayPage pioneered so feedback looks identical everywhere.
 */
export function useFlash(): { toast: string | null; flash: (msg: string) => void } {
  const [toast, setToast] = useFlashState<string | null>(null)
  const timer = useFlashRef<number | null>(null)
  useFlashEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )
  const flash = (msg: string) => {
    setToast(msg)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 4000)
  }
  return { toast, flash }
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-[3px] border border-brass/30 bg-surface px-5 py-3 text-sm font-medium text-ink shadow-float">
      {msg}
    </div>
  )
}

/** Tabs: text on a hairline, brass rule under the active one. Views of the same thing. */
export function Tabs<T extends string>({ items, value, onChange, label, className = '' }: { items: { key: T; label: ReactNode; count?: number }[]; value: T; onChange: (key: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={`tabs ${className}`}>
      {items.map((it) => (
        <button key={it.key} type="button" role="tab" aria-selected={value === it.key} onClick={() => onChange(it.key)} className="tab press">
          {it.label}
          {typeof it.count === 'number' && <span className="count">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** A filter token: narrows a set; an ink wash when on. */
export function Filter({ on, onClick, children, count }: { on: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="filter press">
      {children}
      {typeof count === 'number' && <span className="count">{count}</span>}
    </button>
  )
}

/** An origin-aware overflow menu. Default trigger is a ··· icon button; pass
 *  `trigger` for a labelled control. Closes on outside click, Escape, or any
 *  item selection. Items are <MenuItem>. */
export function MoreMenu({
  trigger,
  align = 'left',
  up = false,
  label = 'More options',
  className = '',
  children,
}: {
  trigger?: ReactNode
  align?: 'left' | 'right'
  /** Open above the trigger — for controls that sit low on the screen. */
  up?: boolean
  label?: string
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useFlashState(false)
  const ref = useFlashRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={trigger ? 'press inline-flex items-center gap-1.5' : 'btn-icon'}
      >
        {trigger ?? <span className="text-lg leading-none tracking-tight">···</span>}
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={`menu-pop absolute z-40 min-w-[13rem] overflow-hidden rounded-[3px] border border-brass/30 bg-surface py-1.5 shadow-float ${
            up ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${
            align === 'right'
              ? `right-0 ${up ? 'origin-bottom-right' : 'origin-top-right'}`
              : `left-0 ${up ? 'origin-bottom-left' : 'origin-top-left'}`
          }`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A row inside a MoreMenu. */
export function MenuItem({
  onClick,
  danger = false,
  children,
}: {
  onClick?: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-bone ${
        danger ? 'text-[rgb(var(--c-danger))] hover:!bg-[rgb(var(--c-danger)/0.08)]' : 'text-ink/75 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** A single pulsing placeholder block — the atom of every skeleton. */
export function SkeletonBlock({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-[3px] bg-ink/10 ${className}`} style={style} aria-hidden />
}

/** A grid of pulsing arches, matching the app's garment/render grids. */
export function ArchSkeleton({
  count = 6,
  className = 'grid-board',
  aspect = 'aspect-[5/6]',
}: {
  count?: number
  className?: string
  aspect?: string
}) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`arch-bezel ${aspect} animate-pulse opacity-60`} style={{ animationDelay: `${i * 80}ms` }}>
          <div className="arch-niche h-full w-full" />
        </div>
      ))}
    </div>
  )
}

/** The shape of a list of people or things while it loads: a 32px square
 *  placeholder and one or two lines, on hairline-divided rows. `padded` insets
 *  the rows 16px for a panel whose dividers run edge to edge. */
export function RowSkeleton({
  count = 3,
  lines = 2,
  padded = false,
  label = 'Loading',
  className = '',
}: {
  count?: number
  lines?: 1 | 2
  padded?: boolean
  label?: string
  className?: string
}) {
  return (
    <div aria-busy="true" aria-label={label} className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`flex items-center gap-3 border-t border-ink/10 py-3 first:border-t-0 ${padded ? 'px-4' : ''}`}>
          <SkeletonBlock className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-32" />
            {lines === 2 && <SkeletonBlock className="mt-1.5 h-3 w-48 !bg-ink/[0.07]" />}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The standard "the fetch failed" state: a line, and a way back in. */
export function LoadError({
  message = 'That didn’t load. Check your connection and try again.',
  onRetry,
  className = '',
}: {
  message?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={`flex min-h-[40vh] flex-col items-center justify-center gap-4 px-6 text-center ${className}`} role="alert">
      <p className="max-w-sm text-sm text-ink/60">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-primary">
          Try again
        </button>
      )}
    </div>
  )
}

/** The bottom undo bar for deferred deletes: an item's gone, but not yet. */
export function UndoBar({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[3px] border border-brass/40 bg-surface px-4 py-2.5 text-sm text-ink shadow-float animate-rise" role="status">
      <span>{message}</span>
      <button type="button" onClick={onUndo} className="press font-semibold text-brass-ink hover:underline">
        Undo
      </button>
    </div>
  )
}
