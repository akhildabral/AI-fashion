import React from 'react'

/** A choice: picks a value (a day type, a size). Bordered by default, brass fill when chosen. */
export function Chip({ on = false, onClick, disabled = false, children, className = '', style }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={`zq-press ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 'var(--control-h-sm)',
        padding: '0 0.875rem',
        whiteSpace: 'nowrap',
        borderRadius: 'var(--radius)',
        border: `var(--border-hair) solid ${on ? 'var(--fill-accent)' : 'var(--border-field)'}`,
        background: on ? 'var(--fill-accent)' : 'transparent',
        color: on ? 'var(--text-on-brass)' : 'rgb(var(--c-ink) / 0.65)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-ui-sm)',
        fontWeight: 'var(--weight-medium)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color var(--dur-press) var(--ease-out), border-color var(--dur-press) var(--ease-out), color var(--dur-press) var(--ease-out)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
