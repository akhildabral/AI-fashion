import React from 'react'

const ARCH_H = { '3/4': '28%', '4/5': '29.8%', '5/6': '31.1%', '1/1': '37.3%', '5/4': '46.6%', '4/3': '49.7%' }

/**
 * The arch — the ONE curved form in ZAUQ. A brass-bezel aperture with a lit
 * niche inside, used wherever a garment or a reflection appears. The crown is
 * 46% of the width across and 0.373x the width tall at any aspect, so a
 * landscape board and a portrait mirror share one arch.
 */
export function Arch({ aspect = '3/4', photo = false, bright = false, children, className = '', style }) {
  return (
    <div
      className={`zq-arch-bezel ${photo ? 'zq-arch-photo' : ''} ${className}`}
      style={{
        aspectRatio: aspect.replace('/', ' / '),
        '--arch-h': ARCH_H[aspect] ?? '28%',
        ...(bright ? { filter: 'brightness(1.18) saturate(1.05)' } : null),
        ...style,
      }}
    >
      <div className="zq-arch-niche">{children}</div>
    </div>
  )
}
