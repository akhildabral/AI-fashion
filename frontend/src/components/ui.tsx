import { useState as useFlashState, useRef as useFlashRef, useEffect as useFlashEffect,  useEffect, type ReactNode } from 'react'
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
  const width = wide ? 'max-w-7xl' : narrow ? 'max-w-3xl' : 'max-w-6xl'
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
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {action}
    </div>
  )
}

/** The one garment tile, used everywhere an item appears. */
export function GarmentTile({
  imageUrl,
  label,
  sublabel,
  onClick,
  selected = false,
  processing = false,
  aspect = 'aspect-square',
  arch = false,
}: {
  imageUrl: string
  label?: string
  sublabel?: string
  onClick?: () => void
  selected?: boolean
  processing?: boolean
  aspect?: string
  /** Arched top — the mirror-frame geometry as a shape language. */
  arch?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={arch ? { borderRadius: '45% 45% 16px 16px / 22% 22% 16px 16px' } : undefined}
      className={`group relative overflow-hidden border bg-surface text-left transition ${
        arch ? '' : 'rounded-2xl'
      } ${selected ? 'border-iris ring-2 ring-iris/30' : 'border-ink/10'} ${
        onClick ? 'cursor-pointer hover:border-ink/35' : 'cursor-default'
      }`}
    >
      <div className={`${aspect} w-full overflow-hidden bg-white`}>
        <img
          src={resolveImageUrl(imageUrl)}
          alt={label ?? ''}
          loading="lazy"
          className={`h-full w-full object-contain transition ${arch ? 'px-3 pb-2 pt-8' : 'p-2'} ${
            processing ? 'opacity-40 blur-[1px]' : ''
          }`}
        />
      </div>
      {processing && (
        <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium text-bone">
          analyzing…
        </span>
      )}
      {(label || sublabel) && (
        <div className="px-3 pb-2.5 pt-1">
          {label && (
            <p className="truncate text-sm font-medium capitalize text-ink">{label}</p>
          )}
          {sublabel && <p className="truncate text-xs text-ink/50">{sublabel}</p>}
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
  return (
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
        className="relative flex max-h-[88vh] w-full max-w-lg animate-rise flex-col overflow-hidden rounded-3xl border border-ink/10 bg-bone shadow-float outline-none"
      >
        <div className="flex items-center justify-between border-b border-ink/10 bg-bone px-5 py-4">
          <p className="font-display text-base font-bold capitalize text-ink">{title ?? 'Details'}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 text-ink/60 transition-colors hover:border-ink/40 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

/** Small labelled stat, used in health strips and ritual lines. */
export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <p className="font-display text-xl font-extrabold leading-tight text-ink">{value}</p>
      <p className="text-xs uppercase tracking-wide text-ink/45">{label}</p>
    </div>
  )
}

/** The arched mirror — the brand's visual anchor, reused across spaces. */
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
        className="bg-gradient-to-b from-[#E5E1D4] via-[#CFC9B8] to-[#B4AD99] p-2.5 dark:from-[#3E3A31] dark:via-[#2A2721] dark:to-[#1C1A15]"
        style={{ borderRadius: '48% 48% 24px 24px / 30% 30% 24px 24px' }}
      >
        <div
          className="relative overflow-hidden border border-black/10 bg-surface dark:border-white/5"
          style={{ borderRadius: '47% 47% 20px 20px / 29% 29% 20px 20px' }}
        >
          {children}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.10) 47%, rgba(255,255,255,0.02) 55%, transparent 60%)',
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
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-xl bg-ink px-5 py-3 text-sm font-medium text-bone shadow-float">
      {msg}
    </div>
  )
}
