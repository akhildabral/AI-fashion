import React from 'react'

const TONE = {
  error: { ch: '--c-danger', a: 0.1 },
  warning: { ch: '--c-warning', a: 0.12 },
  success: { ch: '--c-success', a: 0.12 },
}

/** An inline message tied to the thing that produced it. Tinted wash, no icon, no border. */
export function Alert({ tone = 'error', children, className = '', style }) {
  const t = TONE[tone] ?? TONE.error
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={className}
      style={{
        margin: 0,
        borderRadius: 'var(--radius)',
        background: `rgb(var(${t.ch}) / ${t.a})`,
        padding: '0.625rem var(--space-4)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-ui)',
        color: `rgb(var(${t.ch}))`,
        ...style,
      }}
    >
      {children}
    </p>
  )
}
