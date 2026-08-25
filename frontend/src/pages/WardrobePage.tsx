import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { addWardrobeItem, getWardrobe } from '../lib/wardrobe'
import type { WardrobeItem } from '../lib/types'
import { WardrobeCard } from '../components/WardrobeCard'
import { OutfitSuggestions } from '../components/OutfitSuggestions'
import { Spinner } from '../components/Spinner'

const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

export function WardrobePage() {
  const [items, setItems] = useState<WardrobeItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    getWardrobe()
      .then(({ items: list }) => {
        if (!cancelled) setItems(list ?? [])
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load your wardrobe.')
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
    // Reset so selecting the same file again re-triggers change.
    e.target.value = ''
    if (!file) return

    if (!ACCEPTED.includes(file.type)) {
      setUploadError('Please choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setUploadError('That image is larger than 10MB. Please choose a smaller file.')
      return
    }

    setUploadError(null)
    setAnalyzing(true)
    try {
      const { item } = await addWardrobeItem(file)
      setItems((prev) => (prev ? [item, ...prev] : [item]))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not add that item.')
    } finally {
      setAnalyzing(false)
    }
  }

  function handleUpdated(updated: WardrobeItem) {
    setItems((prev) =>
      prev ? prev.map((it) => (it.id === updated.id ? updated : it)) : prev,
    )
  }

  function handleDeleted(id: string) {
    setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev))
  }

  const hasItems = items != null && items.length > 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Your wardrobe
        </h1>
        <p className="mt-3 text-ink/60">
          Add the clothes you own and we'll tag each one, then build outfits from
          your real closet.
        </p>
      </div>

      {/* Add item */}
      <section className="mb-12 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="font-serif text-2xl font-semibold text-ink">Add an item</h2>
            <p className="mt-1.5 text-sm text-ink/60">
              Upload a clear photo of a single garment. We'll auto-tag its category,
              color, pattern, and more — you can correct anything after.
            </p>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={analyzing}
              className="btn-primary whitespace-nowrap"
            >
              {analyzing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Analyzing garment…
                </>
              ) : (
                'Add item'
              )}
            </button>
          </div>
        </div>
        <p className="mt-4 text-xs text-ink/40">JPG, PNG, or WebP · up to 10MB.</p>
        {uploadError && (
          <p
            className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700"
            role="alert"
          >
            {uploadError}
          </p>
        )}
      </section>

      {/* Item grid */}
      {loading && (
        <div className="flex min-h-[30vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {!loading && loadError && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      )}

      {!loading && !loadError && !hasItems && (
        <div className="rounded-2xl border border-dashed border-ink/15 py-16 text-center text-ink/50">
          <p>Your wardrobe is empty.</p>
          <p className="mt-1 text-sm text-ink/40">
            Add your first item above to get started.
          </p>
        </div>
      )}

      {!loading && !loadError && hasItems && (
        <>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
            {items.map((item) => (
              <WardrobeCard
                key={item.id}
                item={item}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            ))}
          </div>

          <div className="mt-14">
            <div className="mb-6 max-w-2xl">
              <h2 className="font-serif text-3xl font-semibold text-ink">
                Outfit ideas
              </h2>
              <p className="mt-2 text-ink/60">
                Let your stylist pull outfits together from the pieces you own.
              </p>
            </div>
            <OutfitSuggestions />
          </div>
        </>
      )}
    </div>
  )
}
