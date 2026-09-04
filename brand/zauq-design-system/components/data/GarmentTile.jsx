import React from 'react'
import { Arch } from '../surfaces/Arch.jsx'

/** The one garment tile — a garment spotlit in its arched niche, with a tracked label under it. */
export function GarmentTile({ imageUrl, label, sublabel, onClick, selected = false, processing = false, aspect = '5/6', className = '', style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`zq-press ${className}`}
      style={{
        display: 'block',
        width: '100%',
        minWidth: 0,
        textAlign: 'left',
        border: 'none',
        background: 'none',
        padding: 0,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <Arch aspect={aspect} bright={selected}>
        <img
          src={imageUrl}
          alt={label ?? ''}
          loading="lazy"
          style={{
            position: 'relative',
            zIndex: 1,
            height: '100%',
            width: '100%',
            objectFit: 'contain',
            padding: '7%',
            boxSizing: 'border-box',
            transition: 'all 500ms var(--ease-out)',
            ...(processing ? { transform: 'scale(0.95)', opacity: 0.4, filter: 'blur(2px)' } : null),
          }}
        />
        {processing && (
          <span style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 2, transform: 'translate(-50%, -50%)', fontSize: 9, fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: 'var(--text-accent)' }}>
            developing
          </span>
        )}
      </Arch>
      {(label || sublabel) && (
        <div style={{ padding: 'var(--space-2) var(--space-1) 0', textAlign: 'center' }}>
          {label && (
            <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xs)', color: 'var(--text-body)' }}>
              {label}
            </p>
          )}
          {sublabel && (
            <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-meta)', color: 'var(--text-accent)' }}>{sublabel}</p>
          )}
        </div>
      )}
    </button>
  )
}
