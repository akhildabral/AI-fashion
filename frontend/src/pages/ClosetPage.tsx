import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { addWardrobeItem, getWardrobe } from '../lib/wardrobe'
import { apiFetch } from '../lib/api'
import { getClosetGaps, getRitualStats, type GapSuggestion, type RitualStats } from '../lib/brief'
import type { WardrobeItem } from '../lib/types'
import { WardrobeCard } from '../components/WardrobeCard'
import { GarmentTile, PageShell, Modal } from '../components/ui'
import { Spinner } from '../components/Spinner'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

interface InsightItem {
  itemId: string
  wearCount: number
  orphan: boolean
  costPerWear: number | null
}

type Collection = 'all' | 'most-worn' | 'never-worn' | 'orphans' | 'new'

const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'most-worn', label: 'Most worn' },
  { id: 'never-worn', label: 'Never worn' },
  { id: 'orphans', label: 'Sitting idle' },
  { id: 'new', label: 'New this month' },
]

export function ClosetPage() {
  const [items, setItems] = useState<WardrobeItem[] | null>(null)
  const [insights, setInsights] = useState<Map<string, InsightItem>>(new Map())
  const [stats, setStats] = useState<RitualStats | null>(null)
  const [gaps, setGaps] = useState<GapSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [collection, setCollection] = useState<Collection>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<WardrobeItem | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const loadInsights = useCallback(() => {
    apiFetch<{ items: InsightItem[] }>('/wear/insights')
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
    const valid = files.filter((f) => ACCEPTED.includes(f.type) && f.size <= MAX_BYTES)
    if (valid.length === 0) {
      setUploadError('Use JPG, PNG, or WebP photos up to 10MB.')
      return
    }
    setUploadError(null)
    setUploading(valid.length)
    for (const file of valid) {
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

  const totalValue = list.reduce((sum, it) => sum + (it.price ?? 0), 0)

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
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-iris/10 backdrop-blur-sm">
            <div className="rounded-3xl border-2 border-dashed border-iris bg-surface px-10 py-8 text-center">
              <p className="font-display text-2xl font-extrabold text-ink">Drop your photos</p>
              <p className="mt-1 text-sm text-ink/60">
                Flat-lays, racks, selfies — every garment gets extracted and tagged.
              </p>
            </div>
          </div>
        )}

        {/* Head */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="animate-rise font-display text-4xl font-extrabold tracking-tight text-ink">
              Closet
            </h1>
            <p className="mt-1 animate-rise-1 text-sm text-ink/55">
              {list.length} pieces
              {totalValue > 0 && <> · ₹{Math.round(totalValue).toLocaleString('en-IN')} in value</>}
              {stats && <> · {stats.rotationPct}% in rotation this quarter</>}
            </p>
          </div>
          <div className="flex animate-rise-1 items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="⌕ Search"
              className="w-40 rounded-full border border-ink/10 bg-surface px-4 py-2 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-iris/60 sm:w-52"
            />
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading > 0}
              className="btn-primary whitespace-nowrap !px-5"
            >
              {uploading > 0 ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" /> {uploading} left…
                </>
              ) : (
                '+ Add'
              )}
            </button>
          </div>
        </div>

        {uploadError && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
            {uploadError}
          </p>
        )}

        {gaps.length > 0 && list.length > 0 && (
          <div className="mt-5 flex animate-rise-2 flex-wrap gap-2">
            {gaps.map((g) => (
              <p
                key={g.category}
                className="rounded-2xl border border-spark/25 bg-spark-soft/60 px-4 py-2.5 text-sm text-ink/75"
              >
                ✦ <span className="font-medium text-ink">{g.wanted}</span> would unlock{' '}
                <span className="font-semibold text-spark-deep">{g.unlocks} new outfits</span> from
                what you own
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
          <span className="mx-1 hidden h-5 w-px bg-ink/10 sm:block" />
          {COLLECTIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCollection(c.id)}
              className={`chip !text-xs ${collection === c.id ? '!border-iris !text-iris' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading && (
          <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {!loading && error && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
        )}
        {!loading && !error && list.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-ink/15 py-20 text-center">
            <p className="font-display text-xl font-bold text-ink">Your closet is empty</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink/50">
              Drag photos anywhere on this page, or hit + Add. Flat-lays and selfies work — every
              garment is extracted and tagged on its own.
            </p>
          </div>
        )}
        {!loading && !error && list.length > 0 && (
          <>
            {sorted.length === 0 ? (
              <p className="mt-10 text-center text-sm text-ink/45">Nothing matches that filter.</p>
            ) : (
              <div className="mt-6 grid animate-rise-3 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {sorted.map((item) => {
                  const ins = insights.get(item.id)
                  return (
                    <GarmentTile
                      key={item.id}
                      imageUrl={item.imageUrl}
                      label={item.subtype ?? item.category}
                      sublabel={
                        ins?.costPerWear != null
                          ? `₹${Math.round(ins.costPerWear)} / wear · ${ins.wearCount}×`
                          : ins && ins.wearCount > 0
                            ? `worn ${ins.wearCount}×`
                            : undefined
                      }
                      processing={item.status === 'processing'}
                      onClick={() => setSelected(item)}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Item slide-over: the full existing card with every action */}
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
        </Modal>
      </div>
    </PageShell>
  )
}
