import React from 'react'

/** A card rests flat: a hairline on a raised fill. Depth is bezels and grain, never a drop shadow. */
export function Card({ hover = false, children, className = '', style }) {
  const [hov, setHov] = React.useState(false)
  return (
    <div
      className={className}
      onMouseEnter={hover ? () => setHov(true) : undefined}
      onMouseLeave={hover ? () => setHov(false) : undefined}
      style={{
        borderRadius: 'var(--radius)',
        border: `var(--border-hair) solid ${hov ? 'rgb(var(--c-iris) / 0.5)' : 'var(--border-hairline)'}`,
        background: 'var(--surface-raised)',
        transition: 'border-color var(--dur-press) var(--ease-out)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
