import { money } from '../lib/money'
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type CSSProperties } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useNavigate } from 'react-router-dom'
import { addWardrobeItem, getWardrobe } from '../lib/wardrobe'
import { apiFetch, pinFile } from '../lib/api'
import { getClosetGaps, getRitualStats, type GapSuggestion, type RitualStats } from '../lib/brief'
import type { WardrobeItem } from '../lib/types'
import { GarmentTile, PageShell, Modal, Filter } from '../components/ui'
import { ClosetRooms } from '../components/ClosetRooms'
import { LetGoModal } from '../components/LetGo'
import { PriceDrawer } from '../components/PriceDrawer'
import { Spinner } from '../components/Spinner'

const MAX_BYTES = 12 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

interface InsightItem {
  itemId: string
  wearCount: number
  orphan: boolean
  costPerWear: number | null
}

type Collection = 'all' | 'most-worn' | 'never-worn' | 'orphans' | 'new' | 'twins' | 'basket'

const BASKET_STATES = ['in-wash', 'packed', 'lent-out']

const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'most-worn', label: 'Most worn' },
  { id: 'never-worn', label: 'Never worn' },
  { id: 'orphans', label: 'Sitting idle' },
  { id: 'new', label: 'New this month' },
  { id: 'basket', label: 'In the basket' },
  { id: 'twins', label: 'Possible twins' },
]

const inr = (n: number) => money(n)

export function ClosetPage() {
  usePageTitle('Closet')
  const navigate = useNavigate()
  const [items, setItems] = useState<WardrobeItem[] | null>(null)
  const [insights, setInsights] = useState<Map<string, InsightItem>>(new Map())
  const [stats, setStats] = useState<RitualStats | null>(null)
  const [gaps, setGaps] = useState<GapSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(0)
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

  useEffect(() => {
    getWardrobe()
      .then(({ items: list }) => setItems(list ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your closet.'))
      .finally(() => setLoading(false))
    loadInsights()
    getRitualStats().then(setStats).catch(() => undefined)
    getClosetGaps().then((g) => setGaps(g.suggestions)).catch(() => undefined)
  }, [loadInsights])

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

  async function uploadFiles(files: File[]) {
    // Pin every photo into memory now: a phone can drop the picker's file
    // handle before a queued upload reaches it.
    files = (await Promise.all(files.map((f) => pinFile(f).catch(() => null)))).filter((f): f is File => f !== null)
    const valid = files.filter((f) => (ACCEPTED.includes(f.type) || /\.hei[cf]$/i.test(f.name)) && f.size <= MAX_BYTES)
    if (valid.length === 0) {
      setUploadError('Use JPG, PNG, WebP or HEIC photos up to 12MB.')
      return
    }
    setUploadError(null)
    setUploading(valid.length)
    // Three at a time: a first closet of forty photos develops as a board,
    // not a queue, and each tile appears the moment its upload lands.
    const queue = [...valid]
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        try {
          const res = await addWardrobeItem(file)
          const added = res.items ?? [res.item]
          setItems((prev) => (prev ? [...added, ...prev] : added))
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'An upload failed.')
        } finally {
          setUploading((n) => n - 1)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, valid.length) }, worker))
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
  const visible = list.filter((it) => {
    if (category && it.category !== category) return false
    const ins = insights.get(it.id)
    if (collection === 'most-worn' && (ins?.wearCount ?? 0) < 1) return false
    if (collection === 'never-worn' && (ins?.wearCount ?? 0) > 0) return false
    if (collection === 'orphans' && !ins?.orphan) return false
    if (collection === 'new' && new Date(it.createdAt ?? 0).getTime() < monthAgo) return false
    if (collection === 'twins' && !it.twinOfId) return false
    if (collection === 'basket' && !BASKET_STATES.includes(it.state ?? '')) return false
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
    if (ins?.costPerWear != null) return `${inr(ins.costPerWear)} / wear · ${ins.wearCount}×`
    if (ins && ins.wearCount > 0) return `worn ${ins.wearCount}×`
    return undefined
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
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm">
            <div className="arch-bezel w-64" style={{ aspectRatio: '5 / 4' }}>
              <div className="arch-niche flex h-full w-full flex-col items-center justify-center px-6 text-center">
                <p className="font-display text-2xl font-medium text-ink">Release</p>
                <p className="mt-1 text-xs text-ink/60">every garment gets its own niche</p>
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink/45">Estate value</p>
                <p className="font-display text-4xl font-semibold text-brass [font-variant-numeric:tabular-nums] sm:text-5xl">
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink/45">Estate value</p>
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
                className="field field-sm w-40 sm:w-52"
              />
            </label>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handleFileChange} className="hidden" />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
            <button
              type="button"
              onClick={() => setAddChooserOpen(true)}
              disabled={uploading > 0}
              className="btn-primary whitespace-nowrap !px-5"
            >
              {uploading > 0 ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> {uploading} left…
                </>
              ) : (
                'Add'
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
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="arch-bezel aspect-[5/6] animate-pulse opacity-60">
                <div className="arch-niche h-full w-full" />
              </div>
            ))}
          </div>
        )}
        {!loading && error && <p className="mt-6 alert-error">{error}</p>}
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
                    <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-ink/45">{s.l}</span>
                  </div>
                ))}
                {idleCapital > 0 && (
                  <button type="button" onClick={() => setCollection('orphans')} className="press ml-auto text-[11px] font-semibold text-brass hover:underline">
                    {inr(idleCapital)} sitting idle →
                  </button>
                )}
              </div>
            )}

            {gaps.length > 0 && (
              <div className="mt-5 flex animate-rise-2 flex-wrap gap-2">
                {gaps.map((g) => (
                  <p
                    key={g.category}
                    className="rounded-[3px] border border-brass/25 bg-iris-soft px-4 py-2.5 text-sm text-ink/75"
                  >
                    <span className="font-medium text-ink">{g.wanted}</span> would unlock{' '}
                    <span className="font-semibold text-brass">{g.unlocks} new outfits</span> from what
                    you own
                  </p>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="mt-5 flex animate-rise-2 flex-wrap items-center gap-x-1 gap-y-1.5">
              <Filter on={category === null} onClick={() => setCategory(null)} count={list.length}>
                All
              </Filter>
              {categories.map(([cat, count]) => (
                <Filter key={cat} on={category === cat} onClick={() => setCategory((prev) => (prev === cat ? null : cat))} count={count}>
                  <span className="capitalize">{cat}</span>
                </Filter>
              ))}
              <span className="filter-sep hidden sm:block" />
              <label className="relative inline-flex items-center">
                <span className="sr-only">Show a collection</span>
                <select
                  value={collection}
                  onChange={(e) => setCollection(e.target.value as Collection)}
                  className={`field field-sm !w-auto !pr-8 ${collection !== 'all' ? '!border-brass !text-brass' : ''}`}
                >
                  {COLLECTIONS.map((c) => (
                    <option key={c.id} value={c.id}>{c.id === 'all' ? 'Show: everything' : c.label}</option>
                  ))}
                </select>
              </label>
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
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {sorted.map((item, i) => (
                  <GarmentTile
                    key={item.id}
                    className="rise-stagger"
                    style={{ '--i': i } as CSSProperties}
                    imageUrl={item.imageUrl}
                    label={item.subtype ?? item.category}
                    sublabel={item.twinOfId ? 'A twin? · decide' : cpwLabel(item)}
                    processing={item.status === 'processing'}
                    onClick={() => navigate(`/closet/piece/${item.id}`)}
                  />
                ))}
              </div>
              </>
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
