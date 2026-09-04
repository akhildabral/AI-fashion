import React from 'react'

/** A small labelled figure — a Bodoni number over a tracked label. */
export function Stat({ value, label, accent = false, className = '', style }) {
  return (
    <div className={className} style={style}>
      <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-display-6)', fontWeight: 'var(--weight-medium)', lineHeight: 1.2, color: accent ? 'var(--text-accent)' : 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      <p style={{ margin: 0, fontSize: 'var(--text-nano)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--text-faint)' }}>
        {label}
      </p>
    </div>
  )
}
