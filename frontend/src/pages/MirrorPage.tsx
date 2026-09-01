import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { deleteTryOn, getTryOns } from '../lib/tryon'
import { tryOnWardrobeOutfit } from '../lib/wardrobe'
import type { Look, LooksResponse, TryOn, TryOnResponse } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { MirrorFrame } from '../components/ui'

// Mirror: every render of you, one stage. Follows the app theme — and the
// pull-cord on the frame is a real light switch for the whole app.

type Tab = 'on-you' | 'looks'

export function MirrorPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('on-you')
  const [tryOns, setTryOns] = useState<TryOn[] | null>(null)
  const [looks, setLooks] = useState<Look[] | null>(null)
  const [stage, setStage] = useState<{ imageUrl: string; caption: string } | null>(null)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [compare, setCompare] = useState<string[]>([])
  const [compareMode, setCompareMode] = useState(false)
  const [pollBusy, setPollBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const renderedFor = useRef<string | null>(null)

  const load = useCallback(() => {
    getTryOns()
      .then(({ tryOns: t }) => {
        setTryOns(t ?? [])
        setStage((prev) =>
          prev ?? (t && t[0] ? { imageUrl: t[0].imageUrl, caption: 'Your latest render' } : null),
        )
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the mirror.'))
    apiFetch<LooksResponse>('/looks')
      .then((r) => setLooks((r.looks ?? []).filter((l) => l.imageUrl)))
      .catch(() => setLooks([]))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Arriving with ?items= means "render this outfit on me, now".
  const itemsParam = params.get('items')
  useEffect(() => {
    if (!itemsParam || renderedFor.current === itemsParam) return
    renderedFor.current = itemsParam
    const ids = itemsParam.split(',').filter(Boolean)
    if (ids.length === 0) return
    setRendering(true)
    setError(null)
    tryOnWardrobeOutfit(ids)
      .then(({ tryOn }: TryOnResponse) => {
        setTryOns((prev) => [tryOn, ...(prev ?? [])])
        setStage({ imageUrl: tryOn.imageUrl, caption: 'Fresh from the stylist' })
        setParams({}, { replace: true })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'The render failed — try again.')
      })
      .finally(() => setRendering(false))
  }, [itemsParam, setParams])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4000)
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
      flash('Poll is live — find it in your Circle, share the link anywhere.')
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

  return (
    <div className="relative min-h-[calc(100vh-73px)]">
            <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {toast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-xl bg-ink px-5 py-3 text-sm font-medium text-bone shadow-float">
            {toast}
          </div>
        )}

        <p className="animate-rise font-serif text-sm italic text-spark">Show yourself</p>
        <h1 className="mt-1 animate-rise-1 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          The Mirror
        </h1>

        <div className="mt-8 animate-rise-2">
          {/* The mirror itself */}
          <div className="relative mx-auto max-w-[420px] pt-2">
            <MirrorFrame>
                {rendering ? (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-4 p-6 text-center">
                    <Spinner className="h-8 w-8 text-iris" />
                    <p className="font-serif italic text-ink/55">
                      rendering it on you — ~20 seconds…
                    </p>
                  </div>
                ) : stage ? (
                  <img
                    src={resolveImageUrl(stage.imageUrl)}
                    alt={stage.caption}
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 p-8 text-center">
                    <p className="font-display text-lg font-bold text-ink">Nothing here yet</p>
                    <p className="text-sm text-ink/55">
                      Hit "See it on you" on today's brief — or on any closet item — and the
                      render lands on this stage.
                    </p>
                  </div>
                )}
            </MirrorFrame>
            {stage && !rendering && (
              <p className="mt-3 text-center font-serif text-sm italic text-ink/50">
                {stage.caption}
              </p>
            )}
          </div>

          {/* Gallery */}
          <div className="mx-auto mt-10 max-w-4xl">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex gap-1 rounded-full border border-ink/10 bg-surface p-1">
                <button
                  type="button"
                  onClick={() => setTab('on-you')}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    tab === 'on-you' ? 'bg-ink text-bone' : 'text-ink/55 hover:text-ink'
                  }`}
                >
                  On you {tryOns ? `· ${tryOns.length}` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('looks')}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    tab === 'looks' ? 'bg-ink text-bone' : 'text-ink/55 hover:text-ink'
                  }`}
                >
                  Looks {looks ? `· ${looks.length}` : ''}
                </button>
              </div>
              {tab === 'on-you' && (tryOns?.length ?? 0) >= 2 && (
                <div className="flex items-center gap-2">
                  {compareMode && compare.length === 2 && (
                    <button
                      type="button"
                      onClick={() => void createPollFromCompare()}
                      disabled={pollBusy}
                      className="btn-primary !px-4 !py-2"
                    >
                      {pollBusy ? 'Creating…' : 'Ask the Circle →'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCompareMode((v) => !v)
                      setCompare([])
                    }}
                    className={`chip ${compareMode ? '!border-iris !text-iris' : ''}`}
                  >
                    {compareMode ? 'Cancel face-off' : 'A/B face-off'}
                  </button>
                </div>
              )}
            </div>
            {compareMode && (
              <p className="mt-2 text-xs text-ink/50">
                Pick two renders, then send them to your Circle as a poll.
              </p>
            )}

            {error && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            {tab === 'on-you' && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {(tryOns ?? []).map((t) => {
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
                        className={`block w-full overflow-hidden rounded-2xl border transition-colors ${
                          idx >= 0
                            ? 'border-iris ring-2 ring-iris/30'
                            : 'border-ink/10 hover:border-ink/35'
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
                        <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-iris text-xs font-bold text-bone">
                          {idx === 0 ? 'A' : 'B'}
                        </span>
                      )}
                      {!compareMode && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(t.id)}
                          aria-label="Remove render"
                          className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs text-white transition-colors hover:bg-black group-hover:flex"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
                {tryOns !== null && tryOns.length === 0 && (
                  <p className="col-span-full rounded-2xl border border-dashed border-ink/15 p-8 text-center text-sm text-ink/50">
                    No renders yet — "See it on you" on the Today brief makes your first.
                  </p>
                )}
              </div>
            )}

            {tab === 'looks' && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {(looks ?? []).map((l, i) => (
                  <button
                    key={l.id ?? i}
                    type="button"
                    onClick={() =>
                      l.imageUrl && setStage({ imageUrl: l.imageUrl, caption: l.occasion ?? 'A look' })
                    }
                    className="block overflow-hidden rounded-2xl border border-ink/10 transition-colors hover:border-ink/35"
                  >
                    <img
                      src={resolveImageUrl(l.imageUrl!)}
                      alt={l.occasion ?? 'Generated look'}
                      loading="lazy"
                      className="aspect-[3/4] w-full object-cover"
                    />
                  </button>
                ))}
                {looks !== null && looks.length === 0 && (
                  <p className="col-span-full rounded-2xl border border-dashed border-ink/15 p-8 text-center text-sm text-ink/50">
                    Generated looks with images appear here.
                  </p>
                )}
              </div>
            )}

            <p className="mt-6 text-xs text-ink/45">
              Want a fresh render?{' '}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="font-semibold text-iris hover:underline"
              >
                Style today's brief
              </button>{' '}
              and tap "See it on you".
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
