import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useNavigate } from 'react-router-dom'
import { addWardrobeItem, getWardrobe } from '../lib/wardrobe'
import { apiFetch } from '../lib/api'
import { getClosetGaps, getRitualStats, type GapSuggestion, type RitualStats } from '../lib/brief'
import type { WardrobeItem } from '../lib/types'
import { WardrobeCard } from '../components/WardrobeCard'
import { GarmentTile, PageShell, Modal } from '../components/ui'
import { ClosetRooms } from '../components/ClosetRooms'
import { GoesWith } from '../components/GoesWith'
import { PieceStory } from '../components/PieceStory'
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

type Collection = 'all' | 'most-worn' | 'never-worn' | 'orphans' | 'new'
type Lens = 'gallery' | 'ledger'

const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'most-worn', label: 'Most worn' },
  { id: 'never-worn', label: 'Never worn' },
  { id: 'orphans', label: 'Sitting idle' },
  { id: 'new', label: 'New this month' },
]

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

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
  const [lens, setLens] = useState<Lens>('gallery')
  const [lettingGo, setLettingGo] = useState<WardrobeItem | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [collection, setCollection] = useState<Collection>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<WardrobeItem | null>(null)
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
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev))
  }

  function handleDeleted(id: string) {
    setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev))
    setSelected(null)
  }

  const list = items ?? []
  const categoryCounts = new Map<string, number>()
  for (const it of list) categoryCounts.set(it.category, (categoryCounts.get(it.category) ?? 0) + 1)
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])

  const monthAgo = Date.now() - 30 * 86_400_000
  const visible = list.filter((it) => {
    if (category && it.category !== category) return false
    const ins = insights.get(it.id)
    if (collection === 'most-worn' && (ins?.wearCount ?? 0) < 1) return false
    if (collection === 'never-worn' && (ins?.wearCount ?? 0) > 0) return false
    if (collection === 'orphans' && !ins?.orphan) return false
    if (collection === 'new' && new Date(it.createdAt ?? 0).getTime() < monthAgo) return false
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
  const workhorses = [...list]
    .filter((it) => (insights.get(it.id)?.wearCount ?? 0) > 0)
    .sort((a, b) => (insights.get(b.id)?.wearCount ?? 0) - (insights.get(a.id)?.wearCount ?? 0))
    .slice(0, 6)
  const bestValueId =
    workhorses
      .filter((it) => insights.get(it.id)?.costPerWear != null)
      .sort(
        (a, b) => (insights.get(a.id)?.costPerWear ?? 1e9) - (insights.get(b.id)?.costPerWear ?? 1e9),
      )[0]?.id ?? null

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
                className="w-40 rounded-[3px] border border-ink/15 bg-surface px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-brass/60 focus:ring-2 focus:ring-brass/20 sm:w-52"
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

        {/* ---------------- Gallery / Ledger lens ---------------- */}
        {!loading && !error && list.length > 0 && (
          <div
            role="tablist"
            aria-label="Closet view"
            className="mt-6 inline-flex animate-rise-1 rounded-[3px] border border-ink/15 bg-surface p-1"
          >
            {(['gallery', 'ledger'] as Lens[]).map((l) => (
              <button
                key={l}
                role="tab"
                aria-selected={lens === l}
                type="button"
                onClick={() => setLens(l)}
                className={`rounded-[2px] px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-[background-color,color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/40 ${
                  lens === l ? 'bg-brass text-[rgb(26_21_9)]' : 'text-ink/55 hover:text-ink'
                }`}
              >
                {l === 'gallery' ? 'Gallery' : 'Ledger'}
              </button>
            ))}
          </div>
        )}

        {/* ---------------- Loading / error / empty ---------------- */}
        {loading && (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
              Drag a photo anywhere, or hit Add. Flat-lays and hangers work best — every garment is
              extracted and framed on its own.
            </p>
          </div>
        )}

        {/* ---------------- GALLERY ---------------- */}
        {!loading && !error && list.length > 0 && lens === 'gallery' && (
          <>
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
            <div className="mt-6 flex animate-rise-2 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCategory(null)}
                className={`chip ${category === null ? 'chip-on' : ''}`}
              >
                All · {list.length}
              </button>
              {categories.map(([cat, count]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory((prev) => (prev === cat ? null : cat))}
                  className={`chip capitalize ${category === cat ? 'chip-on' : ''}`}
                >
                  {cat} · {count}
                </button>
              ))}
              <span className="mx-1 hidden h-5 w-px bg-ink/12 sm:block" />
              {COLLECTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCollection(c.id)}
                  className={`chip !text-xs ${collection === c.id ? '!border-brass !text-brass' : ''}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* The gallery wall */}
            {sorted.length === 0 ? (
              <p className="mt-12 text-center text-sm text-ink/45">Nothing matches that filter.</p>
            ) : (
              <div className="mt-6 grid animate-rise-3 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {sorted.map((item) => (
                  <GarmentTile
                    key={item.id}
                    imageUrl={item.imageUrl}
                    label={item.subtype ?? item.category}
                    sublabel={cpwLabel(item)}
                    processing={item.status === 'processing'}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------------- LEDGER (the absorbed wear-journal) ---------------- */}
        {!loading && !error && list.length > 0 && lens === 'ledger' && (
          <div className="animate-rise-2">
            {/* The rotation truth */}
            <div className="plaque mt-6 p-6 pl-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">
                What your closet is doing
              </p>
              <p className="mt-2 max-w-2xl font-display text-2xl font-medium leading-snug text-ink">
                {idleCapital > 0 ? (
                  <>
                    <span className="text-brass">{inr(idleCapital)}</span> of your estate hasn&rsquo;t
                    left the closet this quarter.
                  </>
                ) : (
                  <>Every piece has earned its place this quarter.</>
                )}
              </p>
              <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4 border-t border-ink/10 pt-4">
                {[
                  { v: stats ? inr(stats.monthlyPayback) : '—', l: 'earned this month' },
                  { v: `${rotationPct}%`, l: 'in rotation' },
                  { v: stats ? String(stats.wornThisQuarter) : '—', l: 'wears this quarter' },
                  { v: stats ? String(stats.streak) : '—', l: 'day streak' },
                ].map((s) => (
                  <div key={s.l}>
                    <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">
                      {s.v}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-ink/45">{s.l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Workhorses — the pieces earning their keep */}
            {workhorses.length > 0 && (
              <section className="mt-10">
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="font-display text-2xl font-medium text-ink">Workhorses</h2>
                  <p className="text-sm text-ink/45">the pieces earning their keep</p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {workhorses.map((item) => (
                    <div key={item.id} className="relative">
                      {item.id === bestValueId && (
                        <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-[2px] bg-brass px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[rgb(26_21_9)]">
                          Best value
                        </span>
                      )}
                      <GarmentTile
                        imageUrl={item.imageUrl}
                        label={item.subtype ?? item.category}
                        sublabel={cpwLabel(item)}
                        onClick={() => setSelected(item)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Sitting idle — the dark alcoves */}
            <section className="mt-10">
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="font-display text-2xl font-medium text-ink">Sitting idle</h2>
                <p className="text-sm text-ink/45">
                  {idleItems.length > 0
                    ? `${idleItems.length} piece${idleItems.length === 1 ? '' : 's'} in the dark`
                    : 'nothing gathering dust'}
                </p>
              </div>
              {idleItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {idleItems.slice(0, 12).map((item) => (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="press group block w-full text-left opacity-70 grayscale-[0.25] transition hover:opacity-100 hover:grayscale-0"
                      >
                        <GarmentTile imageUrl={item.imageUrl} label={item.subtype ?? item.category} sublabel="idle" />
                      </button>
                      {/* A shelf is not a decision: style it, or let it go. */}
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <button type="button" onClick={() => navigate(`/closet/compose?pin=${item.id}`)} className="press rounded-[3px] border border-brass/50 py-1.5 text-[11px] font-semibold text-brass transition-colors hover:bg-iris-soft/40">
                          Style it
                        </button>
                        <button type="button" onClick={() => setLettingGo(item)} className="press rounded-[3px] border border-ink/15 py-1.5 text-[11px] font-semibold text-ink/60 transition-colors hover:border-ink/40 hover:text-ink">
                          Let it go
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-[3px] border border-dashed border-ink/15 p-5 text-sm text-ink/45">
                  Log a few wears and the pieces you&rsquo;re neglecting will surface here.
                </p>
              )}
            </section>
          </div>
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

        {/* Item detail */}
        <Modal
          open={selected !== null}
          onClose={() => setSelected(null)}
          title={selected ? (selected.subtype ?? selected.category) : 'Item'}
        >
          {selected && (
            <WardrobeCard
              item={selected}
              onUpdated={(u) => {
                handleUpdated(u)
                loadInsights()
              }}
              onDeleted={handleDeleted}
            />
          )}
          {selected && selected.status === 'ready' && <PieceStory itemId={selected.id} />}
          {selected && selected.status === 'ready' && <GoesWith itemId={selected.id} />}
        </Modal>
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
