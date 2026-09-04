import { money } from '@zauq/shared/money'
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type CSSProperties } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useNavigate } from 'react-router-dom'
import { getWardrobe } from '@zauq/shared/wardrobe'
import { apiFetch } from '../lib/api'
import { getClosetGaps, getRitualStats, type GapSuggestion, type RitualStats } from '@zauq/shared/brief'
import type { WardrobeItem } from '@zauq/shared/types'
import { GarmentTile, PageShell, Modal, Filter, LoadError } from '../components/ui'
import { ClosetRooms } from '../components/ClosetRooms'
import { useJobs } from '../context/useJobs'
import { LetGoModal } from '../components/LetGo'
import { PriceDrawer } from '../components/PriceDrawer'
import { Spinner } from '../components/Spinner'


interface InsightItem {
  itemId: string
  wearCount: number
  orphan: boolean
  costPerWear: number | null
}

type Collection = 'all' | 'most-worn' | 'never-worn' | 'orphans' | 'new' | 'twins'

const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'most-worn', label: 'Most worn' },
  { id: 'never-worn', label: 'Never worn' },
  { id: 'orphans', label: 'Sitting idle' },
  { id: 'new', label: 'New this month' },
  { id: 'twins', label: 'Possible twins' },
]

const inr = (n: number) => money(n)

export function ClosetPage() {
  usePageTitle('Closet')
  const navigate = useNavigate()
  const jobs = useJobs()
  const [items, setItems] = useState<WardrobeItem[] | null>(null)
  const [insights, setInsights] = useState<Map<string, InsightItem>>(new Map())
  const [stats, setStats] = useState<RitualStats | null>(null)
  const [gaps, setGaps] = useState<GapSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [lettingGo, setLettingGo] = useState<WardrobeItem | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [collection, setCollection] = useState<Collection>('all')
  const [search, setSearch] = useState('')
  const [pricing, setPricing] = useState(false)
  const [addChooserOpen, setAddChooserOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const loadInsights = useCallback(() => {
    apiFetch<{ items: InsightItem[] }>('/wearlog/insights')
      .then((r) => setInsights(new Map(r.items.map((i) => [i.itemId, i]))))
      .catch(() => undefined)
  }, [])

  const loadWardrobe = useCallback(() => {
    setError(null)
    setLoading(true)
    getWardrobe()
      .then(({ items: list }) => setItems(list ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your closet.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadWardrobe()
    loadInsights()
    getRitualStats().then(setStats).catch(() => undefined)
    getClosetGaps().then((g) => setGaps(g.suggestions)).catch(() => undefined)
  }, [loadInsights, loadWardrobe])

  // Tiles created by the app-level upload queue land here the moment they
  // return — whether the upload was started on this page or before we arrived.
  useEffect(() => {
    if (jobs.addedItems.length === 0) return
    setItems((prev) => {
      const have = new Set((prev ?? []).map((i) => i.id))
      const fresh = jobs.addedItems.filter((i) => !have.has(i.id))
      return fresh.length ? [...fresh, ...(prev ?? [])] : prev
    })
    jobs.consumeAddedItems()
  }, [jobs])

  const hasProcessing = items?.some((it) => it.status === 'processing') ?? false
  useEffect(() => {
    if (!hasProcessing) return
    const timer = setInterval(() => {
      getWardrobe()
        .then(({ items: list }) => setItems(list ?? []))
        .catch(() => undefined)
    }, 3000)
    return () => clearInterval(timer)
  }, [hasProcessing])

  // Uploads run in the app-level jobs layer so the queue and its progress
  // survive navigation and tab switches. The tiles they create arrive back
  // through jobs.addedItems (merged below).
  function uploadFiles(files: File[]) {
    jobs.enqueueUploads(files)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    void uploadFiles(files)
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault()
    dragDepth.current++
    if (e.dataTransfer.types.includes('Files')) setDragActive(true)
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault()
    dragDepth.current--
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragActive(false)
    }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    void uploadFiles([...e.dataTransfer.files])
  }

  function handleUpdated(updated: WardrobeItem) {
    setItems((prev) => (prev ? prev.map((it) => (it.id === updated.id ? updated : it)) : prev))
  }

  const list = items ?? []
  const categoryCounts = new Map<string, number>()
  for (const it of list) categoryCounts.set(it.category, (categoryCounts.get(it.category) ?? 0) + 1)
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])

  const monthAgo = Date.now() - 30 * 86_400_000
  const twins = list.filter((it) => it.twinOfId).length
  const isNew = (it: WardrobeItem) => new Date(it.createdAt ?? 0).getTime() >= monthAgo
  // Counts for the collection tabs — each cut of the wardrobe, at a glance.
  const collectionCounts: Record<Collection, number> = {
    all: list.length,
    'most-worn': list.filter((it) => (insights.get(it.id)?.wearCount ?? 0) >= 1).length,
    'never-worn': list.filter((it) => (insights.get(it.id)?.wearCount ?? 0) === 0).length,
    orphans: list.filter((it) => insights.get(it.id)?.orphan).length,
    new: list.filter(isNew).length,
    twins,
  }
  const visible = list.filter((it) => {
    if (category && it.category !== category) return false
    const ins = insights.get(it.id)
    if (collection === 'most-worn' && (ins?.wearCount ?? 0) < 1) return false
    if (collection === 'never-worn' && (ins?.wearCount ?? 0) > 0) return false
    if (collection === 'orphans' && !ins?.orphan) return false
    if (collection === 'new' && new Date(it.createdAt ?? 0).getTime() < monthAgo) return false
    if (collection === 'twins' && !it.twinOfId) return false
    if (search) {
      const hay = `${it.subtype ?? ''} ${it.category} ${it.primaryColor ?? ''} ${it.description ?? ''}`.toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  })
  const sorted =
    collection === 'most-worn'
      ? [...visible].sort(
          (a, b) => (insights.get(b.id)?.wearCount ?? 0) - (insights.get(a.id)?.wearCount ?? 0),
        )
      : visible

  // ---- Valuation + ledger figures ----
  const totalValue = list.reduce((sum, it) => sum + (it.price ?? 0), 0)
  const unpriced = list.filter((it) => it.price == null).length
  const rotationPct = stats?.rotationPct ?? 0
  const idleItems = list.filter((it) => insights.get(it.id)?.orphan)
  const idleCapital = idleItems.reduce((sum, it) => sum + (it.price ?? 0), 0)

  function cpwLabel(it: WardrobeItem): string | undefined {
    if (it.state === 'in-wash') return 'in the wash'
    if (it.state === 'packed') return 'packed'
    if (it.state === 'lent-out') return 'lent out'
    const ins = insights.get(it.id)
    const worn = ins?.wearCount ?? 0
    if (worn > 0 && ins?.costPerWear != null) return `${inr(ins.costPerWear)} / wear`
    if (worn > 0) return `${worn} ${worn === 1 ? 'wear' : 'wears'}`
    if (isNew(it)) return 'New this month'
    if (ins?.orphan) return 'Sitting idle'
    return 'Not worn yet'
  }

  return (
    <PageShell wide>
      <div
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="relative min-h-[70vh]"
      >
        {dragActive && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px]">
            <div className="arch-bezel aspect-[4/5] w-56">
              <div className="arch-niche flex h-full w-full flex-col items-center justify-center px-6 text-center">
                <p className="font-display text-2xl font-medium text-[var(--text-in-niche)]">Release</p>
                <p className="mt-1 text-xs text-[var(--text-in-niche-muted)]">every garment gets its own niche</p>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- The mantel: name · valuation · actions ---------------- */}
        <div className="flex animate-rise flex-col gap-6 border-b border-ink/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">The collection</p>
            <h1 className="mt-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">Closet</h1>
            <p className="mt-2 text-sm text-ink/50">
              {list.length} pieces
              {stats && <> · {rotationPct}% in rotation this quarter</>}
            </p>
          </div>

          {/* Valuation plate — the owned brass moment */}
          {totalValue > 0 && (
            <div className="flex items-end gap-8">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">Estate value</p>
                <p className="font-display text-3xl font-semibold text-brass [font-variant-numeric:tabular-nums]">
                  {inr(totalValue)}
                </p>
                <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-[2px] bg-ink/10">
                  <div
                    className="h-full rounded-[2px]"
                    style={{
                      width: `${rotationPct}%`,
                      background: 'linear-gradient(90deg, var(--c-brass-hi), var(--c-brass))',
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-ink/45">
                  <span className="font-semibold text-ink/70">{rotationPct}%</span> worn this quarter
                  {idleCapital > 0 && <> · {inr(idleCapital)} idle</>}
                  {unpriced > 0 && (
                    <>
                      {' · '}
                      <button type="button" onClick={() => setPricing(true)} className="press font-semibold text-brass hover:underline">
                        {unpriced} unpriced
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
          {totalValue === 0 && list.length > 0 && (
            <button type="button" onClick={() => setPricing(true)} className="press text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">Estate value</p>
              <p className="font-display text-2xl font-medium text-ink/50">Add prices to see it</p>
              <p className="mt-1 text-[11px] font-semibold text-brass">Price {list.length} piece{list.length === 1 ? '' : 's'} →</p>
            </button>
          )}

          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search your closet</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="field w-40 sm:w-52"
              />
            </label>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handleFileChange} className="hidden" />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
            <button
              type="button"
              onClick={() => setAddChooserOpen(true)}
              className="btn-primary whitespace-nowrap !px-5"
            >
              {jobs.upload.active ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> {Math.max(0, jobs.upload.total - jobs.upload.done - jobs.upload.failed)} left…
                </>
              ) : (
                'Add item'
              )}
            </button>
          </div>
        </div>

        <ClosetRooms current="pieces" />

        {uploadError && (
          <p className="mt-4 alert-error" role="alert">
            {uploadError}
          </p>
        )}

        {/* ---------------- Loading / error / empty ---------------- */}
        {loading && (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6 xl:grid-cols-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="arch-bezel aspect-[5/6] animate-pulse opacity-60">
                <div className="arch-niche h-full w-full" />
              </div>
            ))}
          </div>
        )}
        {!loading && error && <LoadError message={error} onRetry={loadWardrobe} />}
        {!loading && !error && list.length === 0 && (
          <div className="mx-auto mt-12 max-w-md text-center">
            <div className="arch-bezel mx-auto w-56" style={{ aspectRatio: '5 / 6' }}>
              <div className="arch-niche flex h-full w-full items-center justify-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/30">
                  Your first piece
                </span>
              </div>
            </div>
            <h2 className="mt-6 font-display text-2xl font-medium text-ink">Your collection begins here.</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">
              Drag a photo anywhere, or add a few. Flat-lays and hangers work best. Each garment is
              extracted and framed on its own.
            </p>
            <button type="button" onClick={() => setAddChooserOpen(true)} className="btn-primary mt-6 !px-6">
              Add your first piece
            </button>
          </div>
        )}

        {/* ---------------- GALLERY ---------------- */}
        {!loading && !error && list.length > 0 && (
          <>
            {/* What the closet is doing — the ledger's truth, kept as a slim strip.
                Only once there's real wear behind it; all-zeros is just noise. */}
            {stats && (stats.wornThisQuarter > 0 || stats.streak > 0 || idleCapital > 0) && (
              <div className="plaque mt-6 flex animate-rise-1 flex-wrap items-center gap-x-8 gap-y-2 p-4 pl-5">
                {[
                  { v: `${rotationPct}%`, l: 'in rotation' },
                  { v: String(stats.wornThisQuarter), l: 'wears this quarter' },
                  { v: stats.monthlyPayback > 0 ? inr(stats.monthlyPayback) : '—', l: 'earned this month' },
                  { v: String(stats.streak), l: 'day streak' },
                ].map((s) => (
                  <div key={s.l}>
                    <span className="font-display text-xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{s.v}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-ink/45">{s.l}</span>
                  </div>
                ))}
                {idleCapital > 0 && (
                  <button type="button" onClick={() => setCollection('orphans')} className="press ml-auto text-[11px] font-semibold text-brass hover:underline">
                    {inr(idleCapital)} sitting idle →
                  </button>
                )}
              </div>
            )}

            {/* Collections — the wardrobe cut different ways, scannable as tabs */}
            <div className="tabs mt-8 animate-rise" role="tablist" aria-label="Collections">
              {COLLECTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={collection === c.id}
                  onClick={() => setCollection(c.id)}
                  className="tab"
                >
                  {c.label}
                  {collectionCounts[c.id] > 0 && <span className="count">{collectionCounts[c.id]}</span>}
                </button>
              ))}
            </div>

            {/* Category filters — narrow the collection by kind */}
            <div className="mt-4 flex animate-rise-2 flex-wrap items-center gap-x-1 gap-y-1.5">
              <Filter on={category === null} onClick={() => setCategory(null)} count={list.length}>
                All
              </Filter>
              {categories.map(([cat, count]) => (
                <Filter key={cat} on={category === cat} onClick={() => setCategory((prev) => (prev === cat ? null : cat))} count={count}>
                  <span className="capitalize">{cat}</span>
                </Filter>
              ))}
            </div>

            {/* The gallery wall */}
            {sorted.length === 0 ? (
              <p className="mt-12 text-center text-sm text-ink/45">Nothing matches that filter.</p>
            ) : (
              <>
              {twins > 0 && collection !== 'twins' && (
                <button type="button" onClick={() => setCollection('twins')} className="plaque press mt-6 flex w-full items-center justify-between gap-3 p-3 pl-4 text-left text-sm">
                  <span className="text-ink/70">
                    <b className="font-semibold text-ink">{twins} {twins === 1 ? 'piece looks' : 'pieces look'} like {twins === 1 ? 'one' : 'ones'} you already have.</b> Decide on each: the same piece, or different.
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">Review →</span>
                </button>
              )}
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6 xl:grid-cols-6">
                {sorted.map((item, i) => (
                  <GarmentTile
                    key={item.id}
                    className="rise-stagger"
                    style={{ '--i': i } as CSSProperties}
                    imageUrl={item.imageUrl}
                    label={item.subtype ?? item.category}
                    sublabel={item.twinOfId ? 'A twin? · decide' : cpwLabel(item)}
                    badge={isNew(item) ? 'New' : undefined}
                    processing={item.status === 'processing'}
                    onClick={() => navigate(`/closet/piece/${item.id}`)}
                  />
                ))}
              </div>
              </>
            )}

            {/* What the closet is missing — the gaps, as the reason to add. */}
            {gaps.length > 0 && (
              <div className="mt-14 animate-rise">
                <h2 className="font-display text-2xl font-medium text-ink">What the closet is missing</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {gaps.map((g) => (
                    <div key={g.category} className="card p-5">
                      <p className="font-display text-xl font-medium text-ink">
                        {g.wanted.charAt(0).toUpperCase() + g.wanted.slice(1)}
                      </p>
                      <p className="mt-1.5 text-sm text-ink/55">
                        Unlocks {g.unlocks} {g.unlocks === 1 ? 'outfit' : 'outfits'} you can’t build today.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Add chooser */}
        <Modal open={addChooserOpen} onClose={() => setAddChooserOpen(false)} title="Add to your collection">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setAddChooserOpen(false)
                cameraRef.current?.click()
              }}
              className="press flex w-full items-center justify-between rounded-[3px] border border-ink/12 px-5 py-4 text-left transition-colors hover:border-brass"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">Take a photo</span>
                <span className="block text-xs text-ink/50">Use your camera now</span>
              </span>
              <span className="text-ink/30">→</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAddChooserOpen(false)
                inputRef.current?.click()
              }}
              className="press flex w-full items-center justify-between rounded-[3px] border border-ink/12 px-5 py-4 text-left transition-colors hover:border-brass"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">Choose from gallery</span>
                <span className="block text-xs text-ink/50">Flat-lays and hangers keep true proportions</span>
              </span>
              <span className="text-ink/30">→</span>
            </button>
          </div>
        </Modal>

        <LetGoModal
          item={lettingGo}
          onClose={() => setLettingGo(null)}
          onChanged={(u) => {
            handleUpdated(u)
            loadInsights()
          }}
          onNote={(l) => setUploadError(l)}
        />

      </div>
      <PriceDrawer
        open={pricing}
        items={list}
        onClose={() => setPricing(false)}
        onPriced={(id, price) => setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, price } : it)) : prev))}
      />
    </PageShell>
  )
}
