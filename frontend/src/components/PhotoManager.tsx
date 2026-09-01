import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { deletePhoto, getPhoto, uploadPhoto } from '../lib/tryon'
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
      setError('Please choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That image is larger than 10MB. Please choose a smaller file.')
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
    <section
      id="photo"
      className="scroll-mt-24 rounded-2xl border border-ink/10 bg-surface p-6  sm:p-8"
    >
      <div className="mb-6 max-w-2xl">
        <h2 className="font-serif text-2xl font-semibold text-ink">Your photo</h2>
        <p className="mt-2 text-sm text-ink/60">
          Upload a clear, front-facing photo and we'll render your saved looks onto it —
          so you can see yourself in every outfit before you commit.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[12rem] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-start">
          {/* Preview */}
          <div className="mx-auto w-40 sm:mx-0">
            <div className="relative aspect-[3/4] w-40 overflow-hidden rounded-xl border border-ink/10 bg-gradient-to-br from-bone to-clay/20">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Your uploaded photo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-ink/40">
                  No photo yet
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            {!photoUrl && (
              <label className="flex items-start gap-2.5 text-sm text-ink/70">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 rounded border-ink/30 text-clay focus:ring-clay/30"
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

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
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
                  'Choose from gallery'
                )}
              </button>

              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={busy || (!photoUrl && !consent)}
                className="btn-ghost"
                title={
                  !photoUrl && !consent
                    ? 'Please acknowledge the consent note first'
                    : 'Take a photo with your camera'
                }
              >
                📷 Take a photo
              </button>

              {photoUrl && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={busy}
                  className="inline-flex items-center gap-2 text-sm font-medium text-ink/50 transition hover:text-red-700 disabled:opacity-60"
                >
                  {removing ? <Spinner className="h-3.5 w-3.5" /> : null}
                  {removing ? 'Removing…' : 'Remove photo'}
                </button>
              )}
            </div>

            <p className="text-xs text-ink/40">
              JPG, PNG, or WebP · up to 10MB.
              {photoUrl && ' Replacing overwrites your current photo.'}
            </p>

            {error && (
              <p
                className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
