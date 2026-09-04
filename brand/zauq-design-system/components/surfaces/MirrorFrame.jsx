import React from 'react'

/** The arched mirror — a true brass bezel around a dark reflective surface. The Mirror room's hero. */
export function MirrorFrame({ children, className = '', style }) {
  const radius = 'var(--mirror-radius)'
  return (
    <div className={className} style={style}>
      <div style={{ padding: 3, borderRadius: radius, background: 'linear-gradient(160deg, var(--c-brass-hi), var(--c-brass) 45%, var(--c-brass-lo) 82%)' }}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: radius, background: 'radial-gradient(76% 66% at 50% 30%, #211d17, #0c0b09 84%)' }}>
          {children}
          <div
            aria-hidden
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(123deg, transparent 48%, rgba(236,229,216,0.05) 50%, transparent 52%)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
