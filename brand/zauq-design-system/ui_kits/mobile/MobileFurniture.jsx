import React from 'react'

/**
 * The furniture every room shares on mobile, ported from
 * mobile/src/components/Room.tsx: the header a room draws itself, the thumb-zone
 * ActionBar above the tab bar, and the platform tab bar itself.
 *
 * The native type ladder is used here, not the web one:
 * h1 32/40 · body 16/24 · bodySm 14/20 · micro 10/12 (.16em) · stat 30/38.
 */

export const GUTTER = 20
export const TAB_BAR_HEIGHT = 62
export const ACTION_BAR_HEIGHT = 72 + TAB_BAR_HEIGHT

export const nativeType = {
  display: { fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: '54px', letterSpacing: '-0.5px' },
  h1: { fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 32, lineHeight: '40px', letterSpacing: '-0.32px' },
  h2: { fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 24, lineHeight: '30px' },
  h3: { fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, lineHeight: '26px' },
  lede: { fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, lineHeight: '26px' },
  body: { fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: '24px' },
  bodySm: { fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: '20px' },
  caption: { fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: '16px' },
  label: { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 11, lineHeight: '14px', letterSpacing: '1.98px', textTransform: 'uppercase' },
  micro: { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 10, lineHeight: '12px', letterSpacing: '1.6px', textTransform: 'uppercase' },
  stat: { fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 30, lineHeight: '38px', fontVariantNumeric: 'tabular-nums' },
}

/** A room's own header: eyebrow, Bodoni title with a brass italic emphasis, lead. */
export function RoomHeader({ eyebrow, eyebrowVoice = 'label', title, emphasis, lead, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '8px 0 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        {eyebrow &&
          (eyebrowVoice === 'italic' ? (
            <p style={{ margin: 0, ...nativeType.bodySm, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text-accent)' }}>{eyebrow}</p>
          ) : (
            <p style={{ margin: 0, ...nativeType.micro, letterSpacing: '2.8px', color: 'var(--text-accent)' }}>{eyebrow}</p>
          ))}
        <h1 style={{ margin: 0, ...nativeType.h1, color: 'var(--text-strong)' }}>
          {title}
          {emphasis && <em style={{ color: 'var(--text-accent)' }}> {emphasis}</em>}
        </h1>
        {lead && <p style={{ margin: 0, ...nativeType.body, color: 'var(--text-muted)' }}>{lead}</p>}
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>{right}</div>}
    </div>
  )
}

/** The bar above the tab bar: the screen's one primary action, always in the thumb zone. */
export function ActionBar({ children }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: TAB_BAR_HEIGHT,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: `12px ${GUTTER}px`,
        background: 'rgb(var(--c-bone) / 0.94)',
        backdropFilter: 'blur(12px)',
        borderTop: 'var(--border-hair) solid var(--border-hairline)',
      }}
    >
      {children}
    </div>
  )
}

const ROOMS = [
  { key: 'Today', icon: 'wb_sunny' },
  { key: 'Closet', icon: 'checkroom' },
  { key: 'Mirror', icon: 'auto_awesome' },
  { key: 'Circle', icon: 'group' },
  { key: 'You', icon: 'account_circle' },
]

/**
 * The platform tab bar. The real app uses SF Symbols on iOS and MaterialIcons
 * on Android via expo-router's NativeTabs; this recreation uses Material
 * Symbols from Google's CDN, which is the Android set exactly.
 */
export function TabBar({ room, onRoom }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        height: TAB_BAR_HEIGHT,
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        alignItems: 'center',
        background: 'rgb(var(--c-bone) / 0.9)',
        backdropFilter: 'blur(18px)',
        borderTop: 'var(--border-hair) solid var(--border-hairline)',
        paddingBottom: 6,
      }}
    >
      {ROOMS.map((r) => {
        const on = r.key === room
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onRoom(r.key)}
            aria-label={r.key}
            aria-current={on ? 'page' : undefined}
            className="zq-press"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              height: 48,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: on ? 'var(--fill-accent)' : 'rgb(var(--c-ink) / 0.55)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24, fontVariationSettings: on ? "'FILL' 1, 'wght' 400" : "'FILL' 0, 'wght' 400" }}>
              {r.icon}
            </span>
            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 10 }}>{r.key}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A room's scroll body: gutter padding and room for the ActionBar. */
export function RoomBody({ children, withActionBar = true }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: `0 ${GUTTER}px ${withActionBar ? ACTION_BAR_HEIGHT + 16 : TAB_BAR_HEIGHT + 16}px`,
      }}
    >
      {children}
    </div>
  )
}

/** A tracked label over a hairline — the mobile section head. */
export function MobileSectionHead({ title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '20px 0 10px' }}>
      <h2 style={{ margin: 0, ...nativeType.h2, color: 'var(--text-strong)' }}>{title}</h2>
      {right}
    </div>
  )
}
