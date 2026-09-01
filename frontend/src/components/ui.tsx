import { useEffect, type ReactNode } from 'react'
import { resolveImageUrl } from '../lib/api'

/**
 * The layout system. Every screen composes from these primitives — same
 * shell, same rhythm, no page invents its own containers.
 */

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto ${wide ? 'max-w-7xl' : 'max-w-6xl'} px-4 py-8 sm:px-6 sm:py-10`}>
      {children}
    </div>
  )
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
}: {
  imageUrl: string
  label?: string
  sublabel?: string
  onClick?: () => void
  selected?: boolean
  processing?: boolean
  aspect?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group relative overflow-hidden rounded-2xl border bg-surface text-left transition ${
        selected ? 'border-iris ring-2 ring-iris/30' : 'border-ink/10'
      } ${onClick ? 'cursor-pointer hover:border-ink/35' : 'cursor-default'}`}
    >
      <div className={`${aspect} w-full overflow-hidden bg-white`}>
        <img
          src={resolveImageUrl(imageUrl)}
          alt={label ?? ''}
          loading="lazy"
          className={`h-full w-full object-contain p-2 transition ${
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
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div className="relative flex max-h-[88vh] w-full max-w-lg animate-rise flex-col overflow-hidden rounded-3xl border border-ink/10 bg-bone shadow-float">
        <div className="flex items-center justify-between border-b border-ink/10 bg-bone px-5 py-4">
          <p className="font-display text-base font-bold capitalize text-ink">{title ?? 'Details'}</p>
          <button
            type="button"
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
