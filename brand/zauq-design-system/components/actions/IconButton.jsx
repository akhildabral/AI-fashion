import React from 'react'

/** A square 36px bordered control — the ··· overflow trigger, close buttons, steppers. */
export function IconButton({ label, onClick, disabled = false, children, className = '', style }) {
  const rest = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'var(--control-h-sm)',
    width: 'var(--control-h-sm)',
    borderRadius: 'var(--radius)',
    border: 'var(--border-hair) solid var(--border-control)',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background-color var(--dur-press) var(--ease-out), border-color var(--dur-press) var(--ease-out), color var(--dur-press) var(--ease-out)',
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`zq-press ${className}`}
      style={{ ...rest, ...style }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = 'var(--fill-accent)'; e.currentTarget.style.color = 'var(--text-strong)' } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.borderColor = 'var(--border-control)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
    >
      {children ?? <span style={{ fontSize: 18, lineHeight: 1, letterSpacing: '-0.03em' }}>···</span>}
    </button>
  )
}
