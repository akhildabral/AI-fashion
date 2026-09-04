import React from 'react'

/**
 * An iPhone-sized viewport: 390 x 844, safe areas, a status bar and the home
 * indicator. Not a decorative bezel — the frame exists so the native type
 * ladder and the 48dp touch floor can be judged at true size.
 */
export function PhoneFrame({ children, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: 390,
          height: 844,
          overflow: 'hidden',
          borderRadius: 30,
          background: 'var(--surface-page)',
          border: '1px solid var(--border-control)',
          boxShadow: 'var(--shadow-float)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <StatusBar />
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
      {label && (
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--text-faint)' }}>{label}</span>
      )}
    </div>
  )
}

/** The 59px iOS safe area, with the time and the indicators as plain type. */
export function StatusBar() {
  return (
    <div style={{ display: 'flex', height: 59, flex: 'none', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 26px 8px', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
      <span>7:39</span>
      <span style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: 0.85 }}>
        <span style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
          {[4, 6, 8, 10].map((h) => (
            <span key={h} style={{ width: 3, height: h, borderRadius: 1, background: 'currentColor' }} />
          ))}
        </span>
        <span style={{ width: 22, height: 11, borderRadius: 2, border: '1px solid currentColor', padding: 1.5, boxSizing: 'border-box' }}>
          <span style={{ display: 'block', height: '100%', width: '72%', borderRadius: 1, background: 'currentColor' }} />
        </span>
      </span>
    </div>
  )
}
