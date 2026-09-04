import React from 'react'

/**
 * The week as a timeline rather than a calendar: seven days on one hairline,
 * today underlined in brass. Past days carry a small mark when something was
 * worn; future days a quiet word when they've been named. Nothing boxed.
 */
export function WeekStrip({ days, selected, onSelect }) {
  return (
    <div role="tablist" aria-label="The week" className="zq-rise-1" style={{ marginTop: 'var(--space-6)', borderBottom: 'var(--border-hair) solid var(--border-hairline)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((d) => {
          const on = d.key === selected
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(d.key)}
              className="zq-press"
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)', padding: 'var(--space-1) 0 var(--space-3)', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'center' }}
            >
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label-xl)', color: d.today ? 'var(--text-accent)' : 'rgb(var(--c-ink) / 0.35)' }}>{d.wd}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1, color: d.rest ? 'rgb(var(--c-ink) / 0.3)' : d.today ? 'var(--text-accent)' : on ? 'var(--text-strong)' : 'var(--text-body)' }}>{d.n}</span>
              <span style={{ display: 'flex', height: 14, alignItems: 'center', justifyContent: 'center' }}>
                {d.worn && <i style={{ display: 'block', height: 4, width: 4, borderRadius: 3, background: 'rgb(var(--c-iris) / 0.7)' }} />}
                {d.word && <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontStyle: 'italic', lineHeight: 1, color: d.rest ? 'rgb(var(--c-ink) / 0.35)' : 'rgb(var(--c-iris) / 0.8)' }}>{d.word}</span>}
              </span>
              <span aria-hidden style={{ position: 'absolute', left: '18%', right: '18%', bottom: -1, height: 'var(--rule-active)', background: d.today ? 'var(--c-brass)' : on ? 'rgb(var(--c-ink) / 0.5)' : 'transparent' }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
