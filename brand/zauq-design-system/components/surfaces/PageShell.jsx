import React from 'react'

/** The layout system. Every screen composes from this — no page invents its own container. */
export function PageShell({ width = 'default', children, className = '', style }) {
  const max = { narrow: 'var(--shell-narrow)', default: 'var(--shell)', wide: 'var(--shell-wide)' }[width]
  return (
    <div
      className={className}
      style={{
        margin: '0 auto',
        maxWidth: max,
        padding: 'var(--space-8) var(--gutter)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** A section head: a Bodoni title with an optional action pushed right. */
export function SectionHead({ title, action, className = '', style }) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', ...style }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-6)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>{title}</h2>
      {action}
    </div>
  )
}
