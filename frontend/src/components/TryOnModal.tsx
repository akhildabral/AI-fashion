import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createTryOn, getPhoto, getTryOn } from '@zauq/shared/tryon'
import { tryOnWardrobeOutfit } from '@zauq/shared/wardrobe'
import type { TryOn } from '@zauq/shared/types'
import { useJobs } from '../context/useJobs'
import { resolveImageUrl } from '../lib/api'
import { Modal, MirrorFrame, Alert } from './ui'

type Phase = 'checking' | 'no-photo' | 'rendering' | 'done' | 'error'

const DRESSING_LINES = ['Taking your measure…', 'Cutting the pieces…', 'Fitting the shoulders…', 'Setting the light…']

/**
 * The modal renders the user in either a saved look (`lookId`) or a set of
 * wardrobe items (`itemIds`) — exactly one of the two is provided.
 */
type TryOnModalProps = { onClose: () => void } & (
  | { lookId: string; itemIds?: never }
  | { itemIds: string[]; lookId?: never }
)

/**
 * Full try-on flow, run inside a modal:
 *  1. Check whether the user has a stored photo (GET /api/photo).
 *  2. If not, prompt them to upload one (link to the profile photo section).
 *  3. Otherwise render the look/items onto their photo — either
 *     POST /api/looks/:id/tryon or POST /api/wardrobe/tryon. This is slow
 *     (~30s), so the glass shows the figure being dressed — then the result.
 */
export function TryOnModal({ onClose, ...target }: TryOnModalProps) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [tryOn, setTryOn] = useState<TryOn | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [dressLine, setDressLine] = useState(0)
  const { trackRender } = useJobs()

  const lookId = 'lookId' in target ? target.lookId : undefined
  const itemIds = 'itemIds' in target ? target.itemIds : undefined
  // Stable primitive dep for the render effect (itemIds is a fresh array each render).
  const itemsKey = itemIds?.join(',')

  // The atelier lines while the figure is being dressed.
  useEffect(() => {
    if (phase !== 'rendering') return
    setDressLine(0)
    const id = window.setInterval(() => setDressLine((n) => (n + 1) % DRESSING_LINES.length), 3200)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const { photoUrl } = await getPhoto()
        if (cancelled) return
        if (!photoUrl) {
          setPhase('no-photo')
          return
        }
        setPhase('rendering')
        const { tryOn: first } =
          lookId !== undefined
            ? await createTryOn(lookId)
            : await tryOnWardrobeOutfit(itemIds ?? [])
        if (cancelled) return
        // The render is a job, not a synchronous result: the row comes back
        // queued/rendering. Hand it to the app-level tray (so closing this
        // modal doesn't drop it) and poll until it actually lands.
        if (first.status === 'ready' || !first.status) {
          setTryOn(first)
          setPhase('done')
          return
        }
        trackRender(first)
        for (;;) {
          await new Promise((r) => setTimeout(r, 2500))
          if (cancelled) return
          const { tryOn: t } = await getTryOn(first.id)
          if (t.status === 'ready') {
            setTryOn(t)
            setPhase('done')
            return
          }
          if (t.status === 'failed') {
            setError(t.error ?? 'The render failed. Nothing was charged.')
            setPhase('error')
            return
          }
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Something went wrong.')
        setPhase('error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookId, itemsKey, retryNonce])

  function retry() {
    setError(null)
    setPhase('checking')
    setRetryNonce((n) => n + 1)
  }

  const title = phase === 'done' ? 'You, in this look' : phase === 'no-photo' ? 'Add a photo first' : phase === 'error' ? 'That one didn’t take' : 'See it on you'

  return (
    <Modal open onClose={onClose} title={title}>
      {phase === 'no-photo' ? (
        <div>
          <p className="text-sm text-ink/60">
            To see yourself in this look, add one clear, front-facing, full-length photo. It only takes a moment.
          </p>
          <div className="action-row mt-6">
            <Link to="/profile#photo" onClick={onClose} className="btn-primary">
              Add your photo
            </Link>
            <button type="button" onClick={onClose} className="btn-quiet">
              Not now
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* The glass keeps its shape through every phase: a standing figure, 2/3. */}
          <MirrorFrame className="mx-auto max-w-[320px]">
            {(phase === 'checking' || phase === 'rendering') && (
              <div className="relative flex aspect-[2/3] flex-col items-center justify-center gap-5 p-8 text-center" aria-busy="true" aria-label="Loading">
                {phase === 'rendering' && (
                  <>
                    <span aria-hidden className="animate-filament absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brass/60 to-transparent" />
                    <p key={dressLine} className="relative animate-rise font-display text-base italic text-[#ECE5D8]/80">
                      {DRESSING_LINES[dressLine]}
                    </p>
                    <p className="relative text-[11px] uppercase tracking-[0.18em] text-[#ECE5D8]/50">Leave if you like; you’ll hear when it’s ready</p>
                  </>
                )}
              </div>
            )}
            {phase === 'done' && tryOn && (
              <img src={resolveImageUrl(tryOn.imageUrl)} alt="You wearing this look" className="animate-mirror-reveal aspect-[2/3] w-full object-cover" />
            )}
            {phase === 'error' && (
              <div className="flex aspect-[2/3] flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="font-display text-xl font-medium text-[#ECE5D8]">That one didn’t take.</p>
                <p className="max-w-[28ch] text-sm text-[#ECE5D8]/60">Nothing was charged. Try again, or change a piece.</p>
              </div>
            )}
          </MirrorFrame>

          {phase === 'error' && error && <Alert className="mt-4">{error}</Alert>}

          <div className="action-row mt-6">
            {phase === 'done' && (
              <Link to="/mirror" onClick={onClose} className="btn-ghost">
                Open the Mirror
              </Link>
            )}
            {phase === 'error' && (
              <button type="button" onClick={retry} className="btn-primary">
                Try again
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-quiet">
              {phase === 'done' ? 'Done' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
