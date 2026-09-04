import React from 'react'

/** The only spinning thing in ZAUQ. A brass arc. */
export function Spinner({ size = 16, className = '', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ animation: 'zq-spin 0.8s linear infinite', ...style }} role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <style>{'@keyframes zq-spin{to{transform:rotate(360deg)}}'}</style>
    </svg>
  )
}

/** A single pulsing placeholder block — the atom of every skeleton. */
export function SkeletonBlock({ className = '', style }) {
  return <div aria-hidden className={className} style={{ borderRadius: 'var(--radius)', background: 'rgb(var(--c-ink) / 0.1)', animation: 'zq-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite', ...style }} />
}

/** A grid of pulsing arches, matching the app's garment grids. */
export function ArchSkeleton({ count = 6, aspect = '5/6', columns = 'repeat(auto-fill, minmax(140px, 1fr))', className = '', style }) {
  const ARCH_H = { '2/3': '33.3%', '3/4': '37.5%', '4/5': '40%', '5/6': '41.7%', '1/1': '50%' }
  return (
    <div aria-busy="true" aria-label="Loading" className={className} style={{ display: 'grid', gridTemplateColumns: columns, gap: 'var(--space-4)', ...style }}>
      <style>{'@keyframes zq-pulse{50%{opacity:.5}}'}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="zq-arch-bezel" style={{ aspectRatio: aspect.replace('/', ' / '), '--arch-h': ARCH_H[aspect] ?? '41.7%', opacity: 0.6, animation: 'zq-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite', animationDelay: `${i * 80}ms` }}>
          <div className="zq-arch-niche" />
        </div>
      ))}
    </div>
  )
}

/** The standard "the fetch failed" state: a line, and a way back in. */
export function LoadError({ message = 'That didn’t load. Check your connection and try again.', onRetry, className = '', style }) {
  return (
    <div role="alert" className={className} style={{ display: 'flex', minHeight: '40vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', padding: '0 var(--space-6)', textAlign: 'center', ...style }}>
      <p style={{ margin: 0, maxWidth: '24rem', fontSize: 'var(--text-ui)', color: 'var(--text-muted)' }}>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="zq-press" style={{ height: 'var(--control-h)', padding: '0 var(--space-6)', borderRadius: 'var(--radius)', border: 'none', background: 'var(--fill-accent)', color: 'var(--text-on-brass)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-ui)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer' }}>
          Try again
        </button>
      )}
    </div>
  )
}
