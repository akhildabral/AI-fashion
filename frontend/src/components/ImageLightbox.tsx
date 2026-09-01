import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const MIN_ZOOM = 1
const MAX_ZOOM = 5

/**
 * Fullscreen zoomable image preview. Wheel / buttons / double-click to zoom,
 * drag to pan while zoomed, Esc or backdrop click to close.
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  )

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  const changeZoom = useCallback((next: number) => {
    const z = clampZoom(next)
    if (z === MIN_ZOOM) setOffset({ x: 0, y: 0 })
    setZoom(z)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') changeZoom(zoom + 0.5)
      if (e.key === '-') changeZoom(zoom - 0.5)
    }
    window.addEventListener('keydown', onKey)
    // Lock background scroll while open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, changeZoom, zoom])

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    changeZoom(zoom - Math.sign(e.deltaY) * 0.5)
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (zoom === 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const d = dragging.current
    if (!d) return
    setOffset({ x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) })
  }

  function handlePointerUp() {
    dragging.current = null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${alt}`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl text-white transition hover:bg-white/30"
      >
        ×
      </button>

      <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/15 px-2 py-1">
        <ZoomButton label="Zoom out" onClick={(e) => { e.stopPropagation(); changeZoom(zoom - 0.5) }}>−</ZoomButton>
        <span className="min-w-[3.5rem] text-center text-sm tabular-nums text-white/90">
          {Math.round(zoom * 100)}%
        </span>
        <ZoomButton label="Zoom in" onClick={(e) => { e.stopPropagation(); changeZoom(zoom + 0.5) }}>+</ZoomButton>
      </div>

      <div
        className="max-h-full max-w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onDoubleClick={() => changeZoom(zoom > 1 ? 1 : 2)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in', touchAction: 'none' }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-[88vh] max-w-[92vw] select-none rounded-lg object-contain transition-transform duration-75"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        />
      </div>
    </div>
  )
}

function ZoomButton({
  onClick,
  children,
  label,
}: {
  onClick: (e: React.MouseEvent) => void
  children: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white transition hover:bg-white/20"
    >
      {children}
    </button>
  )
}

/** Wraps any thumbnail/image block; tap opens the zoomable preview. */
export function ZoomableImage({
  src,
  alt,
  className,
  imgClassName,
}: {
  src: string
  alt: string
  className?: string
  imgClassName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'block h-full w-full cursor-zoom-in'}
        aria-label={`Open preview of ${alt}`}
      >
        <img src={src} alt={alt} className={imgClassName ?? 'h-full w-full object-cover'} loading="lazy" />
      </button>
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}
