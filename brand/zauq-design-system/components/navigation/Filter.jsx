import React from 'react'

/** A filter token: narrows a set. Quiet by default, an ink wash when on — never brass. */
export function Filter({ on = false, onClick, count, children, className = '', style }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`zq-press ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 'var(--control-h-xs)',
        padding: '0 var(--space-2-5)',
        whiteSpace: 'nowrap',
        borderRadius: 'var(--radius)',
        border: 'none',
        background: on ? 'var(--fill-wash)' : 'transparent',
        color: on ? 'var(--text-strong)' : 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-ui-sm)',
        fontWeight: 'var(--weight-medium)',
        cursor: 'pointer',
        transition: 'background-color var(--dur-press) var(--ease-out), color var(--dur-press) var(--ease-out)',
        ...style,
      }}
    >
      {children}
      {typeof count === 'number' && <span style={{ marginLeft: 4, color: 'rgb(var(--c-ink) / 0.4)' }}>{count}</span>}
    </button>
  )
}
