import { useState as useFlashState, useRef as useFlashRef, useEffect as useFlashEffect,  useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { resolveImageUrl } from '../lib/api'

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
  const width = wide ? 'max-w-[1400px]' : narrow ? 'max-w-3xl' : 'max-w-6xl'
  return <div className={`mx-auto ${width} px-4 py-8 sm:px-6 sm:py-10`}>{children}</div>
}

export function SectionHead({
  title,
  action,
  className = '',
}: {
  title: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 ${className}`}>
      <h2 className="font-display text-2xl font-medium text-ink">{title}</h2>
      {action}
    </div>
  )
}

/**
 * The arch — the one curved form in the app. A brass-bezel aperture with a
 * lit niche inside, used wherever a garment or a reflection appears. Wrap any
 * content (image, silhouette, ghost) in it.
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
  // A gently-tall arch that garments (aspect ~0.7–1.1) fill well; contain
  // still preserves every garment's true proportions.
  aspect = 'aspect-[5/6]',
  // kept for source compatibility; the tile is always arched now.
  arch: _arch,
}: {
  imageUrl: string
  label?: string
  sublabel?: string
  onClick?: () => void
  selected?: boolean
  processing?: boolean
  aspect?: string
  arch?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`press group block w-full min-w-0 text-left ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
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
          <span className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-[0.2em] text-brass">
            developing
          </span>
        )}
      </Arch>
      {(label || sublabel) && (
        <div className="px-1 pt-2 text-center">
          {label && (
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/70">
              {label}
            </p>
          )}
          {sublabel && <p className="truncate text-xs text-brass">{sublabel}</p>}
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
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
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
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Small labelled stat — Bodoni figure over a tracked label. */
export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-medium leading-tight text-ink [font-variant-numeric:tabular-nums]">
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</p>
    </div>
  )
}

/** The arched mirror — the brand's signature object. A true brass bezel
 *  around a lit niche; the sheen is what the light-catch sweeps across. */
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
          borderRadius: '48% 48% 6px 6px / 26% 26% 6px 6px',
          background:
            'linear-gradient(160deg, var(--c-brass-hi), var(--c-brass) 45%, var(--c-brass-lo) 82%)',
        }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            /* Match the bezel radius so the niche nests cleanly — a smaller
               radius lets the fill spill past the brass edge at the corners. */
            borderRadius: '48% 48% 6px 6px / 26% 26% 6px 6px',
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
