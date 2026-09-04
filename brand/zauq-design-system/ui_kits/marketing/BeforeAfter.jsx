import React from 'react'
import { Arch } from '../../components/surfaces/Arch.jsx'

/** Drag the seam: the photo before the Mirror, and after. */
export function BeforeAfter({ src }) {
  const [cut, setCut] = React.useState(52)
  return (
    <Arch aspect="3/4" photo style={{ width: '100%' }}>
      <div style={{ position: 'relative', height: '100%', width: '100%', userSelect: 'none' }}>
        <img src={src} alt="" style={{ position: 'absolute', inset: 0, zIndex: 1, height: '100%', width: '100%', objectFit: 'cover', filter: 'grayscale(1) brightness(0.55) blur(1px)' }} />
        <img src={src} alt="Dressed, in the Mirror" style={{ position: 'absolute', inset: 0, zIndex: 2, height: '100%', width: '100%', objectFit: 'cover', clipPath: `inset(0 0 0 ${cut}%)` }} />
        <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, zIndex: 3, width: 2, background: 'var(--c-brass)', left: `${cut}%`, transform: 'translateX(-1px)' }}>
          <span style={{ position: 'absolute', left: '50%', top: '50%', display: 'flex', height: 28, width: 28, transform: 'translate(-50%, -50%)', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', background: 'var(--c-brass)', color: 'var(--text-on-brass)', fontSize: 11, fontWeight: 700 }}>&#8660;</span>
        </div>
        <span style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 3, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'rgb(236 229 216 / 0.85)' }}>Before</span>
        <span style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 3, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'rgb(236 229 216 / 0.85)' }}>After</span>
        <input type="range" min={8} max={92} value={cut} onChange={(e) => setCut(Number(e.target.value))} aria-label="Before and after" style={{ position: 'absolute', inset: 0, zIndex: 4, height: '100%', width: '100%', cursor: 'ew-resize', opacity: 0, margin: 0 }} />
      </div>
    </Arch>
  )
}
