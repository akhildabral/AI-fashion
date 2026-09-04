import React from 'react'
import { Wordmark } from '../../components/brand/Wordmark.jsx'
import { MoreMenu, MenuItem } from '../../components/navigation/MoreMenu.jsx'

const ROOMS = ['Today', 'Closet', 'Mirror', 'Circle']

/**
 * The header: the wordmark, the four rooms as text on the header's own
 * hairline (brass under the one you're in), and on the right the light cord,
 * the bell and you. Nothing boxed; the page below carries the weight.
 */
export function AppHeader({ room, onRoom, dark, onToggleTheme }) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: 'rgb(var(--c-bone) / 0.8)',
        backdropFilter: 'blur(var(--header-blur))',
        boxShadow: 'inset 0 -1px 0 var(--border-hairline)',
      }}
    >
      <div style={{ margin: '0 auto', display: 'flex', height: 'var(--header-h)', maxWidth: 'var(--shell-wide)', alignItems: 'stretch', justifyContent: 'space-between', gap: 'var(--space-6)', padding: '0 var(--space-6)' }}>
        <a href="#" onClick={(e) => { e.preventDefault(); onRoom('Today') }} style={{ alignSelf: 'center', textDecoration: 'none' }}>
          <Wordmark size={19} color="var(--text-strong)" />
        </a>

        <nav aria-label="Rooms" style={{ display: 'flex', alignItems: 'stretch', gap: 28 }}>
          {ROOMS.map((r) => {
            const on = r === room
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRoom(r)}
                aria-current={on ? 'page' : undefined}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  padding: '0 var(--space-1)',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: 'var(--weight-semibold)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-label-sm)',
                  color: on ? 'var(--text-strong)' : 'var(--text-muted)',
                  transition: 'color var(--dur-press) var(--ease-out)',
                }}
              >
                {r}
                <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 'var(--rule-active)', background: on ? 'var(--c-brass)' : 'transparent' }} />
              </button>
            )
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', alignSelf: 'center' }}>
          {/* the light cord: pull it to change the room's light */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={dark ? 'Turn the lights up' : 'Turn the lights down'}
            title="Pull the cord"
            className="zq-press"
            style={{ position: 'relative', height: 'var(--header-h)', width: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span aria-hidden style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: 26, background: 'rgb(var(--c-ink) / 0.3)' }} />
            <span aria-hidden style={{ position: 'absolute', left: '50%', top: 26, transform: 'translateX(-50%)', width: 9, height: 13, borderRadius: '2px', background: 'var(--c-brass)' }} />
          </button>

          <button type="button" aria-label="Notifications" className="zq-press" style={{ position: 'relative', height: 36, width: 36, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z" />
              <path d="M6.5 13a1.6 1.6 0 0 0 3 0" />
            </svg>
            <span aria-hidden style={{ position: 'absolute', top: 8, right: 9, height: 5, width: 5, borderRadius: 3, background: 'var(--c-brass)' }} />
          </button>

          <MoreMenu align="right" label="Account menu" trigger={
            <span style={{ display: 'flex', height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', background: 'var(--fill-accent)', color: 'var(--text-on-brass)', fontSize: 12, fontWeight: 700, letterSpacing: '.04em' }}>AK</span>
          }>
            <p style={{ margin: 0, padding: 'var(--space-2) var(--space-4)', fontSize: 'var(--text-meta)', color: 'var(--text-faint)' }}>akhil@zauq.co</p>
            <MenuItem>Trips</MenuItem>
            <MenuItem>Wear history</MenuItem>
            <MenuItem>Profile</MenuItem>
            <MenuItem>Plan &amp; usage</MenuItem>
            <MenuItem danger>Log out</MenuItem>
          </MoreMenu>
        </div>
      </div>
    </header>
  )
}
