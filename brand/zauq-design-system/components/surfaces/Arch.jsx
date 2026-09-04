import React from 'react'

// Crown = a semicircle of radius w/2, so --arch-h = 50% x (w/h).
// Portrait only: the arch is not a landscape form. A wide picture is a 3px
// rectangle, never an arch.
const ARCH_H = { '2/3': '33.3%', '3/4': '37.5%', '4/5': '40%', '5/6': '41.7%', '1/1': '50%' }

/**
 * The arch — the ONE curved form in ZAUQ. A brass-bezel aperture with a lit
 * niche inside, used wherever a garment or a reflection appears. The crown is a
 * TRUE SEMICIRCLE of radius w/2 — the brand mark's own geometry — so
 * --arch-h = 50% × (w/h). Because the crown is half the width, the arch is a
 * PORTRAIT form: 1/1 is the widest it may ever be, and a landscape picture is a
 * 3px rectangle with a hairline, never an arch.
 */
export function Arch({ aspect = '3/4', photo = false, bright = false, children, className = '', style }) {
  return (
    <div
      className={`zq-arch-bezel ${photo ? 'zq-arch-photo' : ''} ${className}`}
      style={{
        aspectRatio: aspect.replace('/', ' / '),
        '--arch-h': ARCH_H[aspect] ?? '37.5%',
        ...(bright ? { filter: 'brightness(1.18) saturate(1.05)' } : null),
        ...style,
      }}
    >
      <div className="zq-arch-niche">{children}</div>
    </div>
  )
}
