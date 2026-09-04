import React from 'react'

/**
 * The ZAUQ wordmark, as live type. Playfair Display Regular in caps, optically
 * kerned ZA .24em / AU .20em / UQ .16em. Alone by default: no rule, no
 * tagline. `ceremonial` adds the gold rule beneath, for 200px and up only.
 */
export function Wordmark({ size = 19, color = 'currentColor', ceremonial = false, className = '', style }) {
  const word = (
    <span
      aria-label="ZAUQ"
      translate="no"
      className={className}
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-brand)',
        fontWeight: 400,
        fontSize: typeof size === 'number' ? `${size}px` : size,
        lineHeight: 1,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        color,
        ...style,
      }}
    >
      <span aria-hidden style={{ letterSpacing: 'var(--wordmark-track-za)' }}>Z</span>
      <span aria-hidden style={{ letterSpacing: 'var(--wordmark-track-au)' }}>A</span>
      <span aria-hidden style={{ letterSpacing: 'var(--wordmark-track-uq)' }}>U</span>
      <span aria-hidden>Q</span>
    </span>
  )
  if (!ceremonial) return word
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '.42em' }}>
      {word}
      <span aria-hidden style={{ display: 'block', height: 2, width: '1.55em', background: 'var(--brand-gold)' }} />
    </span>
  )
}
