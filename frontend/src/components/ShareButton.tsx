import { useState } from 'react'
import { outcomeLine, shareCard, type ShareTarget } from '../lib/share'

// The share verb, everywhere: one button that renders the card and opens
// the OS sheet. Quiet by default; the toast comes from the page.

export function ShareButton({ target, onDone, className = 'btn-ghost !px-4 !py-2 !text-xs', label = 'Share' }: { target: ShareTarget; onDone?: (line: string | null) => void; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      className={className}
      onClick={async () => {
        setBusy(true)
        try {
          const o = await shareCard(target)
          onDone?.(outcomeLine(o))
        } finally {
          setBusy(false)
        }
      }}
    >
      <svg viewBox="0 0 24 24" className="mr-1.5 h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5" />
      </svg>
      {busy ? 'Preparing…' : label}
    </button>
  )
}
