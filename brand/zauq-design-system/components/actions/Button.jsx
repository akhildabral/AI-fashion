import React from 'react'

const H = { md: 'var(--control-h)', sm: 'var(--control-h-sm)' }

const base = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  borderRadius: 'var(--radius)',
  fontFamily: 'var(--font-sans)',
  border: 'none',
  cursor: 'pointer',
  transition: 'background-color var(--dur-press) var(--ease-out), border-color var(--dur-press) var(--ease-out), color var(--dur-press) var(--ease-out), transform var(--dur-press) var(--ease-out)',
}

/**
 * The one action. Brass fill leads; at most one ghost per row; quiet is a text
 * action that still sits on the button height scale so rows align.
 */
export function Button({ variant = 'primary', size = 'md', disabled = false, onClick, type = 'button', children, className = '', style }) {
  const small = size === 'sm'
  const height = H[size] ?? H.md
  const font = small ? 'var(--text-ui-sm)' : 'var(--text-ui)'

  const variants = {
    primary: {
      height,
      padding: small ? '0 var(--space-4)' : '0 var(--space-6)',
      background: 'var(--fill-accent)',
      color: 'var(--text-on-brass)',
      fontSize: font,
      fontWeight: 'var(--weight-semibold)',
    },
    ghost: {
      height,
      padding: small ? '0 var(--space-4)' : '0 var(--space-5)',
      background: 'transparent',
      border: 'var(--border-hair) solid var(--border-control)',
      color: 'var(--text-body)',
      fontSize: font,
      fontWeight: 'var(--weight-medium)',
    },
    quiet: {
      height,
      padding: '0 var(--space-1)',
      background: 'transparent',
      color: 'var(--text-muted)',
      fontSize: font,
      fontWeight: 'var(--weight-medium)',
      textUnderlineOffset: 4,
    },
    danger: {
      height,
      padding: small ? '0 var(--space-4)' : '0 var(--space-5)',
      background: 'transparent',
      border: 'var(--border-hair) solid rgb(var(--c-danger) / 0.4)',
      color: 'rgb(var(--c-danger))',
      fontSize: font,
      fontWeight: 'var(--weight-medium)',
    },
    dark: {
      height,
      padding: small ? '0 var(--space-4)' : '0 var(--space-6)',
      background: 'var(--text-strong)',
      color: 'var(--surface-page)',
      fontSize: font,
      fontWeight: 'var(--weight-semibold)',
    },
  }

  const hover = {
    primary: { background: 'var(--fill-accent-hover)' },
    ghost: { borderColor: 'var(--fill-accent)', color: 'var(--text-strong)' },
    quiet: { color: 'var(--text-strong)', textDecoration: 'underline' },
    danger: { borderColor: 'rgb(var(--c-danger))', background: 'rgb(var(--c-danger) / 0.08)' },
    dark: { background: 'rgb(var(--c-ink) / 0.85)' },
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`zq-press ${className}`}
      style={{
        ...base,
        ...variants[variant],
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : null),
        ...style,
      }}
      onMouseEnter={(e) => { if (!disabled) Object.assign(e.currentTarget.style, hover[variant]) }}
      onMouseLeave={(e) => { if (!disabled) Object.assign(e.currentTarget.style, { ...variants[variant], textDecoration: 'none' }) }}
    >
      {children}
    </button>
  )
}
