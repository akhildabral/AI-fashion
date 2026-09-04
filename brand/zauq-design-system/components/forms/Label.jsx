import React from 'react'

/** A field label: uppercase Archivo, wide tracking, faint. The brand's most-repeated gesture. */
export function Label({ htmlFor, children, className = '', style }) {
  return (
    <label
      htmlFor={htmlFor}
      className={className}
      style={{
        display: 'block',
        marginBottom: 'var(--space-1-5)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-meta)',
        fontWeight: 'var(--weight-semibold)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-label-lg)',
        color: 'var(--text-faint)',
        ...style,
      }}
    >
      {children}
    </label>
  )
}
