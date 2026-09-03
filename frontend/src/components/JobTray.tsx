import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJobs } from '../context/useJobs'
import { Spinner } from './Spinner'

const RENDER_LINES = ['Reading the light…', 'Placing the pieces…', 'Falling into shape…', 'The final light…']

/**
 * The one persistent progress surface. It lives above the router in App, so
 * uploads and renders keep reporting no matter where the user goes or if they
 * switch tabs and come back. A finished render lands here as a tappable card
 * even if the user has left the Mirror.
 */
export function JobTray() {
  const { upload, processingCount, activeRenders, uploadError, readyRender, clearReadyRender } = useJobs()
  const navigate = useNavigate()
  const [line, setLine] = useState(0)

  // Cycle the render copy while anything is rendering.
  useEffect(() => {
    if (activeRenders.length === 0) return
    const id = window.setInterval(() => setLine((n) => (n + 1) % RENDER_LINES.length), 2600)
    return () => window.clearInterval(id)
  }, [activeRenders.length])

  // A ready render announces itself, then steps aside.
  useEffect(() => {
    if (!readyRender) return
    const id = window.setTimeout(clearReadyRender, 8000)
    return () => window.clearTimeout(id)
  }, [readyRender, clearReadyRender])

  const uploadsLeft = upload.active ? upload.total - upload.done - upload.failed : 0
  const hasUpload = upload.active || uploadsLeft > 0
  const rows: { key: string; node: React.ReactNode }[] = []

  if (hasUpload) {
    rows.push({
      key: 'upload',
      node: (
        <button type="button" onClick={() => navigate('/closet')} className="press flex w-full items-center gap-3 text-left">
          <Spinner className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">
              Adding {upload.total} {upload.total === 1 ? 'piece' : 'pieces'}
            </span>
            <span className="block text-xs text-ink/55">
              {upload.done} uploaded{uploadsLeft > 0 ? ` · ${uploadsLeft} to go` : ''}
            </span>
          </span>
        </button>
      ),
    })
  }
  if (processingCount > 0) {
    rows.push({
      key: 'processing',
      node: (
        <button type="button" onClick={() => navigate('/closet')} className="press flex w-full items-center gap-3 text-left">
          <span className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-brass/70" />
          <span className="text-sm text-ink/80">
            {processingCount} {processingCount === 1 ? 'piece' : 'pieces'} developing…
          </span>
        </button>
      ),
    })
  }
  activeRenders.forEach((r) =>
    rows.push({
      key: `render-${r.id}`,
      node: (
        <button type="button" onClick={() => navigate(`/mirror?render=${r.id}`)} className="press flex w-full items-center gap-3 text-left">
          <Spinner className="h-4 w-4 shrink-0" />
          <span className="text-sm text-ink/80">{RENDER_LINES[line]}</span>
        </button>
      ),
    }),
  )
  if (readyRender) {
    rows.push({
      key: 'ready',
      node: (
        <button
          type="button"
          onClick={() => {
            clearReadyRender()
            navigate(`/mirror?render=${readyRender.id}`)
          }}
          className="press flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="text-sm font-semibold text-ink">Your look is ready</span>
          <span className="text-brass">→</span>
        </button>
      ),
    })
  }
  if (uploadError && !hasUpload) {
    rows.push({
      key: 'upload-error',
      node: <span className="text-xs text-[rgb(var(--c-danger))]">{uploadError}</span>,
    })
  }

  if (rows.length === 0) return null

  return (
    <div
      className="fixed bottom-4 left-4 z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-[3px] border border-brass/30 bg-surface shadow-float animate-rise sm:left-auto sm:right-4"
      role="status"
      aria-live="polite"
    >
      {rows.map((r, i) => (
        <div key={r.key} className={`px-4 py-3 ${i > 0 ? 'border-t border-ink/10' : ''}`}>
          {r.node}
        </div>
      ))}
    </div>
  )
}
