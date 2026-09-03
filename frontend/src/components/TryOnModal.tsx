import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createTryOn, getPhoto } from '../lib/tryon'
import { tryOnWardrobeOutfit } from '../lib/wardrobe'
import type { TryOn } from '../lib/types'
import { Spinner } from './Spinner'

type Phase = 'checking' | 'no-photo' | 'rendering' | 'done' | 'error'

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
 *     (~30s), so we show a clear spinner + message — then display the result.
 */
export function TryOnModal({ onClose, ...target }: TryOnModalProps) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [tryOn, setTryOn] = useState<TryOn | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const lookId = 'lookId' in target ? target.lookId : undefined
  const itemIds = 'itemIds' in target ? target.itemIds : undefined
  // Stable primitive dep for the render effect (itemIds is a fresh array each render).
  const itemsKey = itemIds?.join(',')

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        const { tryOn: result } =
          lookId !== undefined
            ? await createTryOn(lookId)
            : await tryOnWardrobeOutfit(itemIds ?? [])
        if (cancelled) return
        setTryOn(result)
        setPhase('done')
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Try this look on"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-[3px] border border-ink/10 bg-surface shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-[3px] bg-surface/85 text-ink  backdrop-blur transition hover:bg-surface"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>

        <div className="p-8">
          {phase === 'checking' && (
            <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 text-ink/60">
              <Spinner className="h-6 w-6" />
              <p className="text-sm">Getting ready…</p>
            </div>
          )}

          {phase === 'rendering' && (
            <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 text-center">
              <Spinner className="h-8 w-8 text-brass" />
              <div>
                <p className="font-display text-xl font-semibold text-ink">
                  Rendering you in this look…
                </p>
                <p className="mt-2 text-sm text-ink/50">
                  This can take up to a minute. Hang tight.
                </p>
              </div>
            </div>
          )}

          {phase === 'no-photo' && (
            <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 text-center">
              <h3 className="font-display text-2xl font-semibold text-ink">
                Add a photo first
              </h3>
              <p className="max-w-xs text-sm text-ink/60">
                To see yourself in this look, upload a clear, front-facing photo of
                yourself. It only takes a moment.
              </p>
              <Link to="/profile#photo" onClick={onClose} className="btn-primary mt-2">
                Upload a photo
              </Link>
            </div>
          )}

          {phase === 'done' && tryOn && (
            <div className="space-y-4 text-center">
              <h3 className="font-display text-2xl font-semibold text-ink">You in this look</h3>
              <div className="overflow-hidden rounded-[3px] border border-ink/10 bg-gradient-to-br from-bone to-iris-soft">
                <img
                  src={tryOn.imageUrl}
                  alt="You wearing this look"
                  className="mx-auto max-h-[60vh] w-full object-contain"
                />
              </div>
              <Link
                to="/mirror"
                onClick={onClose}
                className="inline-flex text-sm font-medium text-brass underline-offset-4 hover:underline"
              >
                See all your try-ons
              </Link>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 text-center">
              <h3 className="font-display text-2xl font-semibold text-ink">
                Couldn't render this look
              </h3>
              <p className="max-w-xs alert-error">{error}</p>
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={retry} className="btn-primary">
                  Try again
                </button>
                <button type="button" onClick={onClose} className="btn-ghost">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
