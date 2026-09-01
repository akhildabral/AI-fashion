import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { deleteTryOn, getTryOns, getPhoto, uploadPhoto } from '../lib/tryon'
import { tryOnWardrobeOutfit } from '../lib/wardrobe'
import type { TryOn, TryOnResponse } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { MirrorFrame, Modal, Toast, useFlash } from '../components/ui'
import {
  createLookbook,
  getLookbooks,
  toggleLookbookItem,
  deleteLookbook,
  type Lookbook,
} from '../lib/brief'

// The Mirror — the app's signature moment. One arched glass; the render is
// staged, never popped; and the empty state is a door, never a dead end.

const DRESSING_LINES = [
  'Taking your measure…',
  'Cutting the pieces…',
  'Dressing the figure…',
  'Setting the light…',
]

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

export function MirrorPage() {
  usePageTitle('Mirror')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast, flash } = useFlash()

  const [tryOns, setTryOns] = useState<TryOn[] | null>(null)
  const [stage, setStage] = useState<{ imageUrl: string; caption: string; fresh?: boolean } | null>(null)
  const [rendering, setRendering] = useState(false)
  const [dressLine, setDressLine] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [compare, setCompare] = useState<string[]>([])
  const [compareMode, setCompareMode] = useState(false)
  const [pollBusy, setPollBusy] = useState(false)
  const renderedFor = useRef<string | null>(null)

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoChecked, setPhotoChecked] = useState(false)
  const [heldItems, setHeldItems] = useState<string[] | null>(null)
  const [photoModal, setPhotoModal] = useState(false)
  const [consent, setConsent] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [lookbooks, setLookbooks] = useState<Lookbook[]>([])
  const [activeBook, setActiveBook] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [newBookName, setNewBookName] = useState('')

  const load = useCallback(() => {
    getTryOns()
      .then(({ tryOns: t }) => {
        setTryOns(t ?? [])
        setStage((prev) =>
          prev ?? (t && t[0] ? { imageUrl: t[0].imageUrl, caption: 'Your latest render' } : null),
        )
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the mirror.'))
  }, [])

  useEffect(() => {
    load()
    getLookbooks().then((r) => setLookbooks(r.lookbooks)).catch(() => undefined)
    getPhoto()
      .then((r) => setPhotoUrl(r.photoUrl))
      .catch(() => undefined)
      .finally(() => setPhotoChecked(true))
  }, [load])

  // Cycle the atelier "dressing" lines while a render is in flight.
  useEffect(() => {
    if (!rendering) return
    setDressLine(0)
    const id = window.setInterval(() => setDressLine((n) => (n + 1) % DRESSING_LINES.length), 3800)
    return () => window.clearInterval(id)
  }, [rendering])

  const fireRender = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      setRendering(true)
      setError(null)
      tryOnWardrobeOutfit(ids)
        .then(({ tryOn }: TryOnResponse) => {
          setTryOns((prev) => [tryOn, ...(prev ?? [])])
          setStage({ imageUrl: tryOn.imageUrl, caption: 'Fresh from the stylist', fresh: true })
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'The render failed — try again.'
          if (/photo/i.test(msg)) {
            // No stored photo — hold the look and open the door.
            setHeldItems(ids)
            setPhotoModal(true)
          } else {
            setError(msg)
          }
        })
        .finally(() => setRendering(false))
    },
    [],
  )

  // Arriving with ?items= means "render this outfit on me, now".
  const itemsParam = params.get('items')
  useEffect(() => {
    if (!itemsParam || renderedFor.current === itemsParam || !photoChecked) return
    renderedFor.current = itemsParam
    const ids = itemsParam.split(',').filter(Boolean)
    setParams({}, { replace: true })
    if (ids.length === 0) return
    if (!photoUrl) {
      // Skipped the photo — don't dead-end. Hold the look; the door opens.
      setHeldItems(ids)
      setPhotoModal(true)
      return
    }
    fireRender(ids)
  }, [itemsParam, photoChecked, photoUrl, setParams, fireRender])

  async function handlePhotoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED.includes(file.type) || file.size > MAX_BYTES) {
      setError('Use a JPG, PNG, or WebP photo up to 10MB.')
      return
    }
    setPhotoBusy(true)
    try {
      const { photoUrl: url } = await uploadPhoto(file)
      setPhotoUrl(url)
      setPhotoModal(false)
      setConsent(false)
      // Fire the held render, if the user arrived here to see a look.
      if (heldItems) {
        const ids = heldItems
        setHeldItems(null)
        fireRender(ids)
      } else {
        flash('You’re in the mirror. Style today’s brief to see your first look.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleToggleBook(bookId: string, tryOnId: string) {
    try {
      const { lookbook } = await toggleLookbookItem(bookId, tryOnId)
      setLookbooks((prev) => prev.map((b) => (b.id === lookbook.id ? lookbook : b)))
    } catch {
      flash('Could not update that lookbook.')
    }
  }

  async function handleCreateBook() {
    const name = newBookName.trim()
    if (!name) return
    try {
      const { lookbook } = await createLookbook(name)
      setLookbooks((prev) => [lookbook, ...prev])
      setNewBookName('')
      if (pickerFor) await handleToggleBook(lookbook.id, pickerFor)
    } catch {
      flash('Could not create the lookbook.')
    }
  }

  async function handleDeleteBook(id: string) {
    try {
      await deleteLookbook(id)
      setLookbooks((prev) => prev.filter((b) => b.id !== id))
      if (activeBook === id) setActiveBook(null)
    } catch {
      flash('Could not delete that lookbook.')
    }
  }

  function toggleCompare(id: string, imageUrl: string) {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
    setStage({ imageUrl, caption: 'Selected for the face-off' })
  }

  async function createPollFromCompare() {
    if (compare.length !== 2 || !tryOns) return
    const chosen = compare
      .map((id) => tryOns.find((t) => t.id === id))
      .filter((t): t is TryOn => Boolean(t))
    if (chosen.length !== 2) return
    setPollBusy(true)
    try {
      await apiFetch('/polls', {
        method: 'POST',
        body: {
          question: 'Which one should I wear?',
          imageUrls: chosen.map((t) => t.imageUrl),
          expiresInMinutes: 24 * 60,
        },
      })
      setCompare([])
      setCompareMode(false)
      flash('It’s with your circle. Share the link anywhere.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the poll.')
    } finally {
      setPollBusy(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTryOn(id)
      setTryOns((prev) => (prev ? prev.filter((t) => t.id !== id) : prev))
    } catch {
      flash('Could not remove that render.')
    }
  }

  const galleryRenders = (tryOns ?? []).filter((t) => {
    if (!activeBook) return true
    const book = lookbooks.find((b) => b.id === activeBook)
    return book ? book.tryOnIds.includes(t.id) : true
  })

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Toast msg={toast} />

      <div className="text-center">
        <p className="animate-rise font-display text-sm italic text-brass">Show yourself</p>
        <h1 className="mt-1 animate-rise-1 font-display text-5xl font-medium text-ink sm:text-6xl">
          The Mirror
        </h1>
      </div>

      {/* The stage — grand, centered, in a pool of light */}
      <div className="relative mt-10 flex animate-rise-2 justify-center">
        <div className="relative w-full max-w-[540px]">
          <MirrorFrame>
            {/* --- rendering: the figure is being dressed --- */}
            {rendering && (
              <div className="relative flex aspect-[3/4] flex-col items-center justify-center gap-5 p-8 text-center">
                <span className="animate-filament absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brass/60 to-transparent" />
                <p key={dressLine} className="animate-rise font-display text-base italic text-[#ECE5D8]/75">
                  {DRESSING_LINES[dressLine]}
                </p>
              </div>
            )}

            {/* --- no photo: the door, never a dead end --- */}
            {!rendering && photoChecked && !photoUrl && (
              <div className="flex aspect-[3/4] flex-col items-center justify-center gap-4 p-8 text-center">
                <svg width="52" height="72" viewBox="0 0 52 72" className="text-brass/55" aria-hidden="true">
                  <path
                    d="M4 68V26C4 13.85 13.85 4 26 4s22 9.85 22 22v42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path d="M14 68V30a12 12 0 0 1 24 0v38" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                </svg>
                <p className="font-display text-xl font-medium text-[#ECE5D8]">The mirror is waiting for you.</p>
                <p className="max-w-[26ch] text-sm text-[#ECE5D8]/60">
                  Add one clear, front-facing photo and you’ll see yourself in every outfit.
                </p>
                <button type="button" onClick={() => setPhotoModal(true)} className="btn-primary mt-1">
                  Add your photo
                </button>
              </div>
            )}

            {/* --- a render on the glass --- */}
            {!rendering && photoUrl && stage && (
              <img
                key={stage.imageUrl}
                src={resolveImageUrl(stage.imageUrl)}
                alt={stage.caption}
                className={`aspect-[3/4] w-full object-cover ${stage.fresh ? 'animate-mirror-reveal' : ''}`}
              />
            )}

            {/* --- have a photo, no render yet --- */}
            {!rendering && photoUrl && !stage && (
              <div className="flex aspect-[3/4] flex-col items-center justify-center gap-4 p-8 text-center">
                <img
                  src={resolveImageUrl(photoUrl)}
                  alt="You"
                  className="h-24 w-24 rounded-[3px] object-cover opacity-80"
                />
                <p className="font-display text-lg font-medium text-[#ECE5D8]">You’re in the mirror.</p>
                <button type="button" onClick={() => navigate('/')} className="btn-primary mt-1">
                  Style today’s look
                </button>
              </div>
            )}

            {/* fresh-render light-catch sweep */}
            {stage?.fresh && !rendering && (
              <span
                key={`sweep-${stage.imageUrl}`}
                aria-hidden
                className="animate-arch-sweep pointer-events-none absolute inset-0"
                style={{
                  background:
                    'linear-gradient(122deg, transparent 45%, rgba(240,226,196,.14) 50%, transparent 55%)',
                }}
              />
            )}
          </MirrorFrame>

          {stage && !rendering && photoUrl && (
            <p className="mt-3 text-center font-display text-sm italic text-ink/55">{stage.caption}</p>
          )}
        </div>
      </div>

      {error && <p className="mx-auto mt-5 max-w-md alert-error">{error}</p>}

      {/* Renders gallery + lookbooks + A/B */}
      {photoUrl && (tryOns?.length ?? 0) > 0 && (
        <div className="mx-auto mt-12 max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/40">On you</span>
              <button
                type="button"
                onClick={() => setActiveBook(null)}
                className={`chip !px-3 !py-1.5 !text-xs ${activeBook === null ? 'chip-on' : ''}`}
              >
                All · {tryOns?.length ?? 0}
              </button>
              {lookbooks.map((b) => (
                <span key={b.id} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveBook((prev) => (prev === b.id ? null : b.id))}
                    className={`chip !px-3 !py-1.5 !text-xs ${activeBook === b.id ? 'chip-on' : ''}`}
                  >
                    {b.name} · {b.tryOnIds.length}
                  </button>
                  {activeBook === b.id && (
                    <button
                      type="button"
                      aria-label="Delete lookbook"
                      onClick={() => void handleDeleteBook(b.id)}
                      className="ml-1 text-ink/35 hover:text-red-500"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      </svg>
                    </button>
                  )}
                </span>
              ))}
            </div>

            {(tryOns?.length ?? 0) >= 2 && (
              <div className="flex items-center gap-2">
                {compareMode && compare.length === 2 && (
                  <button
                    type="button"
                    onClick={() => void createPollFromCompare()}
                    disabled={pollBusy}
                    className="btn-primary !px-4 !py-2"
                  >
                    {pollBusy ? 'Sending…' : 'Ask the Circle'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCompareMode((v) => !v)
                    setCompare([])
                  }}
                  className={`chip ${compareMode ? '!border-brass !text-brass' : ''}`}
                >
                  {compareMode ? 'Cancel face-off' : 'Which one?'}
                </button>
              </div>
            )}
          </div>

          {compareMode && (
            <p className="mt-2 text-xs text-ink/50">Pick two, then send them to your circle to decide.</p>
          )}

          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
            {galleryRenders.map((t) => {
              const idx = compare.indexOf(t.id)
              return (
                <div key={t.id} className="group relative">
                  <button
                    type="button"
                    onClick={() =>
                      compareMode
                        ? toggleCompare(t.id, t.imageUrl)
                        : setStage({
                            imageUrl: t.imageUrl,
                            caption: new Date(t.createdAt).toLocaleDateString(undefined, {
                              day: 'numeric',
                              month: 'short',
                            }),
                          })
                    }
                    className={`press block w-full overflow-hidden rounded-[3px] border transition-colors ${
                      idx >= 0 ? 'border-brass ring-2 ring-brass/30' : 'border-ink/12 hover:border-brass/50'
                    }`}
                  >
                    <img
                      src={resolveImageUrl(t.imageUrl)}
                      alt="Try-on render"
                      loading="lazy"
                      className="aspect-[3/4] w-full object-cover"
                    />
                  </button>
                  {idx >= 0 && (
                    <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-[3px] bg-brass text-xs font-bold text-[rgb(26_21_9)]">
                      {idx === 0 ? 'A' : 'B'}
                    </span>
                  )}
                  {!compareMode && (
                    <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-90 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setPickerFor(t.id)}
                        aria-label="Save to lookbook"
                        className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-ink/70 text-bone hover:bg-ink"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(t.id)}
                        aria-label="Remove render"
                        className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-ink/70 text-bone hover:bg-ink"
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <p className="mt-8 text-center text-xs text-ink/45">
            Want a fresh render?{' '}
            <button type="button" onClick={() => navigate('/')} className="press font-semibold text-brass">
              Style today’s brief
            </button>{' '}
            and tap “See it on you”.
          </p>
        </div>
      )}

      {/* ---- Photo door (add / capture in place) ---- */}
      <input ref={cameraRef} type="file" accept="image/*" capture="user" onChange={handlePhotoFile} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoFile} className="hidden" />
      <Modal open={photoModal} onClose={() => setPhotoModal(false)} title="Add your photo">
        {heldItems && (
          <p className="mb-4 rounded-[3px] border border-brass/30 bg-iris-soft px-4 py-3 font-display text-sm italic text-ink/80">
            We’ll dress you in this look the moment your photo’s in.
          </p>
        )}
        <label className="mb-4 flex cursor-pointer items-start gap-3 text-sm text-ink/70">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[rgb(200,164,94)]"
          />
          <span>
            I agree my photo is stored to generate try-on images. It’s used only for this, never
            shared, and I can delete it anytime.
          </span>
        </label>
        <div className={`space-y-3 ${consent ? '' : 'pointer-events-none opacity-40'}`}>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={!consent || photoBusy}
            className="press flex w-full items-center justify-between rounded-[3px] border border-ink/12 px-5 py-4 text-left transition-colors hover:border-brass"
          >
            <span>
              <span className="block text-sm font-semibold text-ink">Take a photo</span>
              <span className="block text-xs text-ink/50">Front camera, full-length works best</span>
            </span>
            <span className="text-ink/30">→</span>
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={!consent || photoBusy}
            className="press flex w-full items-center justify-between rounded-[3px] border border-ink/12 px-5 py-4 text-left transition-colors hover:border-brass"
          >
            <span>
              <span className="block text-sm font-semibold text-ink">Choose from gallery</span>
              <span className="block text-xs text-ink/50">A clear, front-facing shot</span>
            </span>
            <span className="text-ink/30">→</span>
          </button>
        </div>
        {photoBusy && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-ink/50">
            <Spinner className="h-4 w-4" /> saving your photo…
          </div>
        )}
      </Modal>

      {/* ---- Lookbook picker ---- */}
      <Modal open={pickerFor !== null} onClose={() => setPickerFor(null)} title="Save to a lookbook">
        {pickerFor && (
          <>
            {lookbooks.length > 0 && (
              <div className="space-y-2">
                {lookbooks.map((b) => {
                  const inBook = b.tryOnIds.includes(pickerFor)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => void handleToggleBook(b.id, pickerFor)}
                      className={`press flex w-full items-center justify-between rounded-[3px] border px-4 py-3 text-sm transition-colors ${
                        inBook
                          ? 'border-brass bg-iris-soft text-brass'
                          : 'border-ink/12 text-ink/75 hover:border-brass/50'
                      }`}
                    >
                      <span>{b.name}</span>
                      <span className="text-xs">{inBook ? 'added' : `${b.tryOnIds.length} renders`}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 rounded-[3px] border border-ink/12 bg-surface p-1.5 pl-4 focus-within:border-brass/60 focus-within:ring-2 focus-within:ring-brass/20">
              <input
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                placeholder="New lookbook — e.g. Wedding options"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-ink/35"
              />
              <button type="button" onClick={() => void handleCreateBook()} className="btn-primary !px-4 !py-2 !text-xs">
                Create
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
