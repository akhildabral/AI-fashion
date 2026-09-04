import React from 'react'

/** A transient bottom-centre notice. Pair with useFlash so every page's feedback looks identical. */
export function Toast({ msg }) {
  if (!msg) return null
  return (
    <div
      role="status"
      className="zq-rise"
      style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        left: '50%',
        zIndex: 50,
        transform: 'translateX(-50%)',
        borderRadius: 'var(--radius)',
        border: 'var(--border-hair) solid var(--border-accent)',
        background: 'var(--surface-raised)',
        padding: '0.75rem var(--space-5)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-ui)',
        fontWeight: 'var(--weight-medium)',
        color: 'var(--text-strong)',
        boxShadow: 'var(--shadow-float)',
      }}
    >
      {msg}
    </div>
  )
}

/** const { toast, flash } = useFlash(); render <Toast msg={toast} /> once per page. */
export function useFlash() {
  const [toast, setToast] = React.useState(null)
  const timer = React.useRef(null)
  React.useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const flash = React.useCallback((msg) => {
    setToast(msg)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 4000)
  }, [])
  return { toast, flash }
}

/** The bottom undo bar for deferred deletes: it's gone, but not yet. */
export function UndoBar({ message, onUndo }) {
  return (
    <div
      role="status"
      className="zq-rise"
      style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        left: '50%',
        zIndex: 40,
        display: 'flex',
        transform: 'translateX(-50%)',
        alignItems: 'center',
        gap: 'var(--space-3)',
        borderRadius: 'var(--radius)',
        border: 'var(--border-hair) solid rgb(var(--c-iris) / 0.4)',
        background: 'var(--surface-raised)',
        padding: '0.625rem var(--space-4)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-ui)',
        color: 'var(--text-strong)',
        boxShadow: 'var(--shadow-float)',
      }}
    >
      <span>{message}</span>
      <button type="button" onClick={onUndo} className="zq-press" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'var(--weight-semibold)', color: 'var(--text-accent)' }}>
        Undo
      </button>
    </div>
  )
}
