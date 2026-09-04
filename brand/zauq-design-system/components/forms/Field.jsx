import React from 'react'

/** The one text input. 44px, hairline border, brass focus ring. */
export function Field({ id, type = 'text', value, onChange, placeholder, size = 'md', disabled = false, invalid = false, className = '', style, ...rest }) {
  const [focus, setFocus] = React.useState(false)
  const small = size === 'sm'
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={className}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        height: small ? 'var(--control-h-sm)' : 'var(--control-h)',
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: 'var(--radius)',
        border: `var(--border-hair) solid ${invalid ? 'rgb(var(--c-danger) / 0.6)' : focus ? 'rgb(var(--c-iris) / 0.7)' : 'var(--border-field)'}`,
        boxShadow: focus && !invalid ? '0 0 0 2px rgb(var(--c-iris) / 0.2)' : 'none',
        background: 'var(--surface-raised)',
        padding: small ? '0 var(--space-3)' : '0 var(--space-4)',
        fontFamily: 'var(--font-sans)',
        fontSize: small ? 'var(--text-ui-sm)' : 'var(--text-ui)',
        color: 'var(--text-strong)',
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color var(--dur-press) var(--ease-out), box-shadow var(--dur-press) var(--ease-out)',
        ...style,
      }}
      {...rest}
    />
  )
}
