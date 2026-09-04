import { Modal, SectionHead, SkeletonBlock, Alert } from './ui'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { deletePhoto, getPhoto, uploadPhoto } from '@zauq/shared/tryon'
import { Spinner } from './Spinner'

const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

/**
 * "Your photo" manager: shows the currently stored try-on photo, lets the user
 * upload a new one (behind an explicit consent checkbox), and remove it.
 * Rendered on the Profile page; also serves as the `#photo` anchor that the
 * try-on flow links to when a user has no photo yet.
 */
export function PhotoManager() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [consent, setConsent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [chooserOpen, setChooserOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPhoto()
      .then(({ photoUrl: url }) => {
        if (!cancelled) setPhotoUrl(url)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your photo.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so selecting the same file again re-triggers change.
    e.target.value = ''
    if (!file) return

    if (!ACCEPTED.includes(file.type)) {
      setError('Use a JPG, PNG or WebP photo.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Use a photo up to 10MB.')
      return
    }

    setError(null)
    setUploading(true)
    try {
      const { photoUrl: url } = await uploadPhoto(file)
      setPhotoUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload your photo.')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (removing) return
    if (!window.confirm('Remove your stored photo?')) return
    setError(null)
    setRemoving(true)
    try {
      await deletePhoto()
      setPhotoUrl(null)
      setConsent(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your photo.')
    } finally {
      setRemoving(false)
    }
  }

  const busy = uploading || removing

  return (
    <section id="photo" className="card scroll-mt-24 p-5">
      <div className="max-w-2xl">
        <SectionHead title="Your photo" className="!mb-0" />
        <p className="mt-2 text-sm text-ink/60">
          One clear, front-facing photo, and every saved look renders on you before you commit to it.
        </p>
      </div>

      {loading ? (
        <div className="mt-6 flex flex-wrap items-start gap-6" aria-busy="true" aria-label="Loading">
          <SkeletonBlock className="aspect-[3/4] w-40" />
          <div className="min-w-[15rem] flex-1">
            <SkeletonBlock className="h-11 w-40" />
            <SkeletonBlock className="mt-4 h-4 w-56 !bg-ink/[0.07]" />
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-start gap-6 sm:gap-8">
          {/* flex-wrap so the controls drop below the photo when this card is
              too narrow: it sits in a column, so a viewport breakpoint lies. */}
          {/* Preview: a photograph is a rectangle with a hairline, never an arch. */}
          <div className="w-40 shrink-0">
            <div className="rect-frame aspect-[3/4] w-40">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Your uploaded photo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-4 text-center font-display text-base italic text-ink/45">
                  No photo yet.
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="min-w-[15rem] flex-1">
            {!photoUrl && (
              <label className="flex items-start gap-3 text-sm text-ink/70">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-iris"
                />
                <span>
                  I consent to my photo being stored to generate try-on images.
                </span>
              </label>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className={`action-row ${photoUrl ? '' : 'mt-4'}`}>
              <button
                type="button"
                onClick={() => setChooserOpen(true)}
                disabled={busy || (!photoUrl && !consent)}
                className="btn-primary"
                title={
                  !photoUrl && !consent
                    ? 'Please acknowledge the consent note first'
                    : undefined
                }
              >
                {uploading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Uploading…
                  </>
                ) : photoUrl ? (
                  'Replace photo'
                ) : (
                  'Upload photo'
                )}
              </button>

              {photoUrl && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={busy}
                  className="btn-quiet !text-[rgb(var(--c-danger))]"
                >
                  {removing ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {removing ? 'Removing…' : 'Remove photo'}
                </button>
              )}
            </div>

            <p className="mt-4 text-xs text-ink/40">
              JPG, PNG or WebP · up to 10MB.
              {photoUrl && ' Replacing overwrites your current photo.'}
            </p>

            {error && <Alert className="mt-4">{error}</Alert>}
          </div>
        </div>
      )}

      <Modal open={chooserOpen} onClose={() => setChooserOpen(false)} title="Add your photo">
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => {
              setChooserOpen(false)
              cameraRef.current?.click()
            }}
            className="card card-hover press block w-full p-4 text-left"
          >
            <span className="block text-sm font-semibold text-ink">Take a photo</span>
            <span className="mt-1 block text-xs text-ink/50">Front camera, full-length works best</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setChooserOpen(false)
              inputRef.current?.click()
            }}
            className="card card-hover press block w-full p-4 text-left"
          >
            <span className="block text-sm font-semibold text-ink">Choose from gallery</span>
            <span className="mt-1 block text-xs text-ink/50">Pick an existing photo</span>
          </button>
        </div>
      </Modal>
    </section>
  )
}
