import React from 'react'

/** The centred modal — the one detail surface. Escape closes; focus lands centre-stage. */
export function Modal({ open, onClose, title, children, className = '', style }) {
  const panel = React.useRef(null)
  React.useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    panel.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
      <div aria-hidden onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(var(--backdrop-blur))' }} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Details'}
        tabIndex={-1}
        className={`zq-rise ${className}`}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '88vh',
          width: '100%',
          maxWidth: '32rem',
          overflow: 'hidden',
          borderRadius: 'var(--radius)',
          border: 'var(--border-hair) solid var(--border-accent)',
          background: 'var(--surface-page)',
          boxShadow: 'var(--shadow-float)',
          outline: 'none',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 'var(--border-hair) solid var(--border-hairline)', padding: 'var(--space-4) var(--space-5)' }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-7)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>{title ?? 'Details'}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="zq-press"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32, width: 32, borderRadius: 'var(--radius)', border: 'var(--border-hair) solid var(--border-field)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>{children}</div>
      </div>
    </div>
  )
}
