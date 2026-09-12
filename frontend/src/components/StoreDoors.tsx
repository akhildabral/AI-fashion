import { forwardRef, useImperativeHandle, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
import type { IngestSource } from '@zauq/shared/types'
import { readClipboardText, urlFromPaste } from '../lib/fitting-room'

// The three doors into the Fitting Room: a link from any shop, a photo in
// the shop, a screenshot from the gallery. The paste field imports on paste
// and on Enter; the Paste button reads the clipboard where the browser
// allows it, and says so plainly where it doesn't.

export interface PasteFieldHandle {
  focus(): void
}

export const PasteField = forwardRef<PasteFieldHandle, {
  onUrl: (url: string) => void
  disabled?: boolean
  className?: string
  /** 36-tall, for a header aside. */
  small?: boolean
}>(function PasteField({ onUrl, disabled = false, className = '', small = false }, ref) {
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [note, setNote] = useState<string | null>(null)
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), [])

  function submit(text: string): boolean {
    const url = urlFromPaste(text)
    if (!url) {
      setNote(text.trim() ? 'That isn’t a link. Copy the product’s address from the shop and paste it here.' : null)
      return false
    }
    setNote(null)
    setValue('')
    onUrl(url)
    return true
  }
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData?.getData('text') ?? ''
    if (submit(text)) e.preventDefault()
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit(value)
    }
  }
  async function pasteButton() {
    // Inside the click: the one moment the browser may hand over the clipboard.
    const text = await readClipboardText()
    if (text === null) {
      input.current?.focus()
      setNote('Your browser kept the clipboard to itself. Paste into the field instead.')
      return
    }
    submit(text)
  }

  return (
    <div className={className}>
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Paste a link from any shop</span>
          <input
            ref={input}
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onPaste={onPaste}
            onKeyDown={onKey}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Paste a link from any shop"
            className={`field ${small ? 'field-sm' : ''}`}
          />
        </label>
        <button type="button" disabled={disabled} onClick={() => void pasteButton()} className={`btn-quiet shrink-0 ${small ? 'btn-quiet-sm' : ''}`}>
          Paste
        </button>
      </div>
      {note && (
        <p className="mt-1.5 text-xs text-ink/50" aria-live="polite">
          {note}
        </p>
      )}
    </div>
  )
})

/**
 * The three doors, side by side: paste a link, take a photo, choose a photo
 * or screenshot. `onFile` receives the picked file and which door it came
 * through; the link door focuses the paste field.
 */
export function StoreDoors({
  onFile,
  onPasteDoor,
  disabled = false,
  className = '',
}: {
  onFile: (file: File, source: IngestSource) => void
  onPasteDoor: () => void
  disabled?: boolean
  className?: string
}) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  function pick(source: IngestSource) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (file) onFile(file, source)
    }
  }

  const door = 'card card-hover press flex min-h-[4.5rem] w-full flex-col items-start justify-center gap-1 px-4 py-3 text-left disabled:opacity-50'
  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`}>
      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={pick('camera')} className="hidden" />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={pick('screenshot')} className="hidden" />
      <button type="button" disabled={disabled} onClick={onPasteDoor} className={door}>
        <span className="text-[13px] font-semibold text-ink">Paste a link</span>
        <span className="text-xs text-ink/50">From any shop</span>
      </button>
      <button type="button" disabled={disabled} onClick={() => camera.current?.click()} className={door}>
        <span className="text-[13px] font-semibold text-ink">Take a photo</span>
        <span className="text-xs text-ink/50">In the shop, one shot</span>
      </button>
      <button type="button" disabled={disabled} onClick={() => gallery.current?.click()} className={door}>
        <span className="text-[13px] font-semibold text-ink">Choose a photo</span>
        <span className="text-xs text-ink/50">Or a screenshot</span>
      </button>
    </div>
  )
}
