import { useState, type FormEvent } from 'react'
import { deleteWardrobeItem, updateWardrobeItem } from '../lib/wardrobe'
import type { WardrobeItem, WardrobeItemEdit } from '../lib/types'
import { Spinner } from './Spinner'
import { ZoomableImage } from './ImageLightbox'

const CATEGORIES = [
  'top',
  'bottom',
  'outerwear',
  'footwear',
  'accessory',
  'dress',
  'other',
] as const

const FORMALITIES = [
  'casual',
  'smart-casual',
  'business',
  'formal',
  'athletic',
] as const

const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const

interface WardrobeCardProps {
  item: WardrobeItem
  /** Called after a successful edit with the updated item. */
  onUpdated?: (item: WardrobeItem) => void
  /** Called after a successful delete with the removed item's id. */
  onDeleted?: (id: string) => void
}

/** A small pill for a single tag value. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ink/10 bg-bone/60 px-2.5 py-1 text-xs text-ink/70">
      {children}
    </span>
  )
}

export function WardrobeCard({ item, onUpdated, onDeleted }: WardrobeCardProps) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (deleting) return
    if (!window.confirm('Remove this item from your wardrobe?')) return
    setError(null)
    setDeleting(true)
    try {
      await deleteWardrobeItem(item.id)
      onDeleted?.(item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this item.')
      setDeleting(false)
    }
  }

  const title = item.subtype?.trim() || item.category
  const hasCleanedVersion = !!item.originalUrl && item.originalUrl !== item.imageUrl

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="relative aspect-square bg-gradient-to-br from-bone to-clay/20">
        <ZoomableImage
          src={showOriginal && item.originalUrl ? item.originalUrl : item.imageUrl}
          alt={title}
        />
        {hasCleanedVersion && (
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink/70 shadow-sm transition hover:bg-white"
          >
            {showOriginal ? 'Show clean' : 'Show original'}
          </button>
        )}
        {item.suppressed && (
          <button
            type="button"
            onClick={() => {
              void updateWardrobeItem(item.id, { suppressed: false })
                .then(({ item: updated }) => onUpdated?.(updated))
                .catch(() => {})
            }}
            className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs text-white shadow-sm transition hover:bg-ink"
          >
            Excluded — tap to include
          </button>
        )}
        {item.status === 'processing' && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs text-ink/70 shadow-sm">
            <Spinner className="h-3 w-3" />
            Analyzing…
          </span>
        )}
        {item.status === 'failed' && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs text-red-700 shadow-sm">
            Tagging failed — edit manually
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-clay">{item.category}</p>
          <h3 className="font-serif text-xl font-semibold capitalize text-ink">{title}</h3>
        </div>

        {editing ? (
          <WardrobeEditForm
            item={item}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              onUpdated?.(updated)
              setEditing(false)
            }}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {item.primaryColor && <Chip>{item.primaryColor}</Chip>}
              {item.pattern && <Chip>{item.pattern}</Chip>}
              {item.formality && <Chip>{item.formality}</Chip>}
              {item.material && <Chip>{item.material}</Chip>}
              {item.season.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
            </div>

            {item.description && (
              <p className="text-sm leading-relaxed text-ink/60">{item.description}</p>
            )}

            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="mt-auto flex items-center justify-between gap-4 pt-1">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setEditing(true)
                }}
                className="text-sm font-medium text-clay underline-offset-4 transition hover:underline"
              >
                Edit tags
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 text-sm font-medium text-ink/50 transition hover:text-red-700 disabled:opacity-60"
              >
                {deleting ? <Spinner className="h-3.5 w-3.5" /> : null}
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}

interface WardrobeEditFormProps {
  item: WardrobeItem
  onCancel: () => void
  onSaved: (item: WardrobeItem) => void
}

function WardrobeEditForm({ item, onCancel, onSaved }: WardrobeEditFormProps) {
  const [category, setCategory] = useState(item.category)
  const [subtype, setSubtype] = useState(item.subtype ?? '')
  const [primaryColor, setPrimaryColor] = useState(item.primaryColor ?? '')
  const [pattern, setPattern] = useState(item.pattern ?? '')
  const [formality, setFormality] = useState(item.formality ?? '')
  const [material, setMaterial] = useState(item.material ?? '')
  const [description, setDescription] = useState(item.description ?? '')
  const [season, setSeason] = useState<string[]>(item.season)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSeason(value: string) {
    setSeason((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const edits: WardrobeItemEdit = {
      category,
      subtype: subtype.trim(),
      primaryColor: primaryColor.trim(),
      pattern: pattern.trim(),
      formality,
      material: material.trim(),
      description: description.trim(),
      season,
    }
    try {
      const { item: updated } = await updateWardrobeItem(item.id, edits)
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`category-${item.id}`}>
            Category
          </label>
          <select
            id={`category-${item.id}`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="field"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`formality-${item.id}`}>
            Formality
          </label>
          <select
            id={`formality-${item.id}`}
            value={formality}
            onChange={(e) => setFormality(e.target.value)}
            className="field"
          >
            <option value="">—</option>
            {FORMALITIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`subtype-${item.id}`}>
            Subtype
          </label>
          <input
            id={`subtype-${item.id}`}
            type="text"
            value={subtype}
            onChange={(e) => setSubtype(e.target.value)}
            className="field"
            placeholder="e.g. oxford shirt"
          />
        </div>
        <div>
          <label className="label" htmlFor={`color-${item.id}`}>
            Color
          </label>
          <input
            id={`color-${item.id}`}
            type="text"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="field"
            placeholder="e.g. navy"
          />
        </div>
        <div>
          <label className="label" htmlFor={`pattern-${item.id}`}>
            Pattern
          </label>
          <input
            id={`pattern-${item.id}`}
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="field"
            placeholder="e.g. striped"
          />
        </div>
        <div>
          <label className="label" htmlFor={`material-${item.id}`}>
            Material
          </label>
          <input
            id={`material-${item.id}`}
            type="text"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="field"
            placeholder="e.g. cotton"
          />
        </div>
      </div>

      <div>
        <span className="label">Season</span>
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((s) => {
            const active = season.includes(s)
            return (
              <button
                type="button"
                key={s}
                onClick={() => toggleSeason(s)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                  active
                    ? 'border-ink bg-ink text-bone'
                    : 'border-ink/20 text-ink/60 hover:border-ink/50'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`description-${item.id}`}>
          Description
        </label>
        <textarea
          id={`description-${item.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="field resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Saving…
            </>
          ) : (
            'Save'
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-ghost"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
