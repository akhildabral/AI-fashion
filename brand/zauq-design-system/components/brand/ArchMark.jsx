import React from 'react'

/**
 * The arch mark — the brand's signature object, drawn as SVG at a locked 3:4.
 * `script` carries ذوق and its rule (the ceremonial face, 48px and up).
 * `mirror` is the empty arch. `bare` is the favicon's heavier stroke.
 * `solid` fills the arch: the only form that survives below 32px.
 */
export function ArchMark({ variant = 'script', size = 40, color = 'var(--brand-gold)', ink, className = '' }) {
  const h = Math.round((size * 4) / 3)
  const path = 'M4 392V150A146 146 0 0 1 296 150V392A4 4 0 0 1 292 396H8A4 4 0 0 1 4 392Z'
  return (
    <svg width={size} height={h} viewBox="0 0 300 400" className={className} aria-hidden focusable="false">
      {variant === 'solid' ? (
        <path d={path} fill={color} />
      ) : (
        <path d={path} fill="none" stroke={color} strokeWidth={variant === 'bare' ? 6 : 4} />
      )}
      {variant === 'script' && (
        <>
          <text
            x="150"
            y="316"
            textAnchor="middle"
            fontFamily="var(--font-script)"
            fontSize="50"
            fontWeight="600"
            fill={ink ?? 'currentColor'}
            direction="rtl"
          >
            ذوق
          </text>
          <rect x="119" y="333" width="62" height="3" fill={color} />
        </>
      )}
    </svg>
  )
}
