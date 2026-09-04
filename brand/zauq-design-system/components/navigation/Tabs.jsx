import React from 'react'

/** Tabs: text on a hairline, a brass rule under the active one. Views of the same thing. */
export function Tabs({ items = [], value, onChange, label, className = '', style }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 'var(--space-6)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        boxShadow: 'inset 0 -1px 0 var(--border-hairline)',
        ...style,
      }}
    >
      {items.map((it) => {
        const on = value === it.key
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange?.(it.key)}
            className="zq-press"
            style={{
              position: 'relative',
              flex: 'none',
              whiteSpace: 'nowrap',
              padding: 'var(--space-1) 0 var(--space-3)',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-meta)',
              fontWeight: 'var(--weight-semibold)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-label-sm)',
              color: on ? 'var(--text-strong)' : 'var(--text-muted)',
              transition: 'color var(--dur-press) var(--ease-out)',
            }}
          >
            {it.label}
            {typeof it.count === 'number' && (
              <span style={{ marginLeft: 6, fontWeight: 'var(--weight-medium)', textTransform: 'none', letterSpacing: 'normal', color: 'rgb(var(--c-ink) / 0.4)' }}>
                {it.count}
              </span>
            )}
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 'var(--rule-active)',
                background: on ? 'var(--c-brass)' : 'transparent',
                transition: 'background-color var(--dur-press) var(--ease-out)',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}
