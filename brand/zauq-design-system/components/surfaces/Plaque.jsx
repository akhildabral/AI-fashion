import React from 'react'

/** The ROI plaque — a brass-engraved figure, the proud payoff. */
export function Plaque({ label, value, note, children, className = '', style }) {
  return (
    <div className={`zq-plaque ${className}`} style={{ padding: 'var(--space-4)', paddingLeft: 'var(--space-5)', ...style }}>
      {label && (
        <p style={{ margin: 0, fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'var(--text-faint)' }}>
          {label}
        </p>
      )}
      {value && (
        <p style={{ margin: 'var(--space-1) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-4)', fontWeight: 'var(--weight-medium)', color: 'var(--text-accent)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
          {value}
          {note && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-ui)', fontWeight: 400, color: 'var(--text-muted)' }}> {note}</span>}
        </p>
      )}
      {children}
    </div>
  )
}
