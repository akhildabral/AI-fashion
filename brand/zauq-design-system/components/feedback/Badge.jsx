import React from 'react'

/** A brass badge: a count or a one-word state on a filled chip. */
export function Badge({ children, tone = 'brass', className = '', style }) {
  const tones = {
    brass: { background: 'var(--fill-accent)', color: 'var(--text-on-brass)' },
    quiet: { background: 'var(--fill-wash)', color: 'var(--text-body)' },
  }
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--radius)',
        padding: '0.125rem 0.625rem',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-meta)',
        fontWeight: 'var(--weight-semibold)',
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  )
}
