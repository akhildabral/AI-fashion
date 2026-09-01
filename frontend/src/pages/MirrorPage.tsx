import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { deleteTryOn, getTryOns } from '../lib/tryon'
import { tryOnWardrobeOutfit } from '../lib/wardrobe'
import type { Look, LooksResponse, TryOn, TryOnResponse } from '../lib/types'

// Mirror: every render of you, one dark stage. Looks and try-ons merge
// here; "See it on you" from anywhere in the app lands on this screen.

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

  const gallery = tab === 'on-you' ? tryOns : null

  return (
    <div className="min-h-[calc(100vh-73px)] bg-theater text-[#F3F1EA]">
      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {/* glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{
            background:
              'radial-gradient(560px 320px at 20% 10%, rgba(229,71,109,0.22), transparent 60%), radial-gradient(520px 320px at 85% 90%, rgba(75,59,228,0.28), transparent 62%)',
          }}
        />
        {toast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-xl bg-theater-iris px-5 py-3 text-sm font-semibold text-theater shadow-card">
            {toast}
          </div>
        )}

        <div className="relative">
          <p className="animate-rise font-serif text-sm italic text-theater-spark">
            Show yourself
          </p>
          <h1 className="mt-1 animate-rise-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            The Mirror
          </h1>

          <div className="mt-8 grid animate-rise-2 gap-8 lg:grid-cols-[minmax(280px,380px)_1fr]">
            {/* Stage */}
            <div>
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-theater-surface">
                {rendering ? (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-4 p-6 text-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-theater-iris border-t-transparent" />
                    <p className="font-serif italic text-theater-mist">
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
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 p-8 text-center text-theater-mist">
                    <p className="font-display text-lg font-bold text-[#F3F1EA]">Nothing here yet</p>
                    <p className="text-sm">
                      Hit "See it on you" on today's brief — or on any closet item — and the render
                      lands on this stage.
                    </p>
                  </div>
                )}
              </div>
              {stage && !rendering && (
                <p className="mt-3 text-center font-serif text-sm italic text-theater-mist">
                  {stage.caption}
                </p>
              )}
            </div>

            {/* Gallery */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-full border border-white/12 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => setTab('on-you')}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      tab === 'on-you' ? 'bg-[#F3F1EA] text-theater' : 'text-theater-mist hover:text-white'
                    }`}
                  >
                    On you {tryOns ? `· ${tryOns.length}` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('looks')}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                      tab === 'looks' ? 'bg-[#F3F1EA] text-theater' : 'text-theater-mist hover:text-white'
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
                        className="rounded-xl bg-theater-iris px-4 py-2 text-sm font-semibold text-theater transition hover:-translate-y-px disabled:opacity-50"
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
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                        compareMode
                          ? 'border-theater-iris text-theater-iris'
                          : 'border-white/15 text-theater-mist hover:text-white'
                      }`}
                    >
                      {compareMode ? 'Cancel face-off' : 'A/B face-off'}
                    </button>
                  </div>
                )}
              </div>
              {compareMode && (
                <p className="mt-2 text-xs text-theater-mist">
                  Pick two renders, then send them to your Circle as a poll.
                </p>
              )}

              {error && (
                <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm text-red-300">
                  {error}
                </p>
              )}

              {tab === 'on-you' && (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {(gallery ?? []).map((t) => {
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
                          className={`block w-full overflow-hidden rounded-2xl border transition hover:-translate-y-0.5 ${
                            idx >= 0 ? 'border-theater-iris ring-2 ring-theater-iris/40' : 'border-white/10'
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
                          <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-theater-iris text-xs font-bold text-theater">
                            {idx === 0 ? 'A' : 'B'}
                          </span>
                        )}
                        {!compareMode && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(t.id)}
                            aria-label="Remove render"
                            className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs text-white transition hover:bg-black group-hover:flex"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {tryOns !== null && tryOns.length === 0 && (
                    <p className="col-span-full rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-theater-mist">
                      No renders yet — "See it on you" on the Today brief makes your first.
                    </p>
                  )}
                </div>
              )}

              {tab === 'looks' && (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {(looks ?? []).map((l, i) => (
                    <button
                      key={l.id ?? i}
                      type="button"
                      onClick={() =>
                        l.imageUrl && setStage({ imageUrl: l.imageUrl, caption: l.occasion ?? 'A look' })
                      }
                      className="block overflow-hidden rounded-2xl border border-white/10 transition hover:-translate-y-0.5"
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
                    <p className="col-span-full rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-theater-mist">
                      Generated looks with images appear here.
                    </p>
                  )}
                </div>
              )}

              <p className="mt-6 text-xs text-theater-mist">
                Want a fresh render?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="font-semibold text-theater-iris hover:underline"
                >
                  Style today's brief
                </button>{' '}
                and tap "See it on you".
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
