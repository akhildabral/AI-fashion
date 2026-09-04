import React from 'react'
import { IconButton } from '../actions/IconButton.jsx'

/** An origin-aware overflow menu. Closes on outside click, Escape, or any item selection. */
export function MoreMenu({ trigger, align = 'left', up = false, label = 'More options', children, className = '', style }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!open) return
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className={className} style={{ position: 'relative', ...style }}>
      {trigger ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          className="zq-press"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
        >
          {trigger}
        </button>
      ) : (
        <IconButton label={label} onClick={() => setOpen((v) => !v)} />
      )}
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="zq-menu-pop"
          style={{
            position: 'absolute',
            zIndex: 40,
            minWidth: '13rem',
            overflow: 'hidden',
            borderRadius: 'var(--radius)',
            border: 'var(--border-hair) solid var(--border-accent)',
            background: 'var(--surface-raised)',
            padding: 'var(--space-1-5) 0',
            boxShadow: 'var(--shadow-float)',
            ...(up ? { bottom: '100%', marginBottom: 'var(--space-2)' } : { top: '100%', marginTop: 'var(--space-2)' }),
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
            transformOrigin: `${up ? 'bottom' : 'top'} ${align}`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A row inside a MoreMenu. */
export function MenuItem({ onClick, danger = false, children, className = '', style }) {
  const [hov, setHov] = React.useState(false)
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        padding: 'var(--space-2) var(--space-4)',
        textAlign: 'left',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-ui)',
        background: hov ? (danger ? 'rgb(var(--c-danger) / 0.08)' : 'var(--surface-page)') : 'transparent',
        color: danger ? 'rgb(var(--c-danger))' : hov ? 'var(--text-strong)' : 'var(--text-body)',
        transition: 'background-color var(--dur-press) var(--ease-out), color var(--dur-press) var(--ease-out)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
