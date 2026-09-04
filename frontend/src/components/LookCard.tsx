import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { FavoriteResponse, Look } from '@zauq/shared/types'
import { Spinner } from './Spinner'
import { TryOnModal } from './TryOnModal'
import { ZoomableImage } from './ImageLightbox'

interface OutfitItem {
  /** e.g. "Top", "Shoes" — derived from the object key when available. */
  label?: string
  text: string
}

/**
 * The outfit object shape may vary. We flatten whatever we get into a simple
 * list of displayable items so the UI never assumes a fixed structure:
 *  - array of strings/objects
 *  - object keyed by slot ({ top: "...", shoes: {...} })
 *  - object wrapping an `items` array or `items` object (current contract)
 * The `palette` key is handled separately (see `getPalette`) and skipped here.
 */
function normalizeOutfit(outfit: unknown): OutfitItem[] {
  if (outfit == null) return []

  if (Array.isArray(outfit)) {
    return outfit.flatMap((entry) => stringifyEntry(entry))
  }

  if (typeof outfit === 'object') {
    const obj = outfit as Record<string, unknown>

    // Current contract: { items: { top, bottom, ... }, palette: [...] }
    if (obj.items != null && typeof obj.items === 'object') {
      return slotsToItems(obj.items as Record<string, unknown>)
    }

    return slotsToItems(obj)
  }

  return stringifyEntry(outfit)
}

function slotsToItems(obj: Record<string, unknown>): OutfitItem[] {
  if (Array.isArray(obj)) {
    return obj.flatMap((entry) => stringifyEntry(entry))
  }
  return Object.entries(obj)
    .filter(([key]) => key !== 'palette')
    .flatMap(([key, value]) => {
      const parts = stringifyEntry(value)
      return parts.map((p) => ({ label: humanize(key), text: p.text }))
    })
}

function stringifyEntry(entry: unknown): OutfitItem[] {
  if (entry == null) return []
  if (typeof entry === 'string') {
    return entry.trim() ? [{ text: entry.trim() }] : []
  }
  if (typeof entry === 'number' || typeof entry === 'boolean') {
    return [{ text: String(entry) }]
  }
  if (Array.isArray(entry)) {
    return entry.flatMap((e) => stringifyEntry(e))
  }
  if (typeof entry === 'object') {
    const obj = entry as Record<string, unknown>
    // Prefer a human-friendly field if present.
    const name = obj.name ?? obj.item ?? obj.title ?? obj.description
    if (typeof name === 'string' && name.trim()) {
      return [{ text: name.trim() }]
    }
    // Fall back to a compact key: value rendering.
    const compact = Object.entries(obj)
      .filter(([, v]) => v != null && typeof v !== 'object')
      .map(([k, v]) => `${humanize(k)}: ${String(v)}`)
      .join(', ')
    return compact ? [{ text: compact }] : []
  }
  return []
}

/** Pull a color palette (array of strings) out of the outfit if present. */
function getPalette(outfit: unknown): string[] {
  if (outfit == null || typeof outfit !== 'object' || Array.isArray(outfit)) return []
  const palette = (outfit as Record<string, unknown>).palette
  if (!Array.isArray(palette)) return []
  return palette.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
}

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
}

/** Map a palette color name/value to a CSS color; falls back to a neutral swatch. */
function toCssColor(value: string): string {
  const v = value.trim().toLowerCase()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v
  // A single CSS keyword (no spaces) is usually a valid color.
  if (/^[a-z]+$/.test(v)) return v
  return 'transparent'
}

interface LookCardProps {
  look: Look
  /** Called after a successful favorite toggle with the updated look. */
  onFavoriteChange?: (look: Look) => void
  /** Called after a successful delete with the deleted look's id. */
  onDeleted?: (id: string) => void
}

export function LookCard({ look, onFavoriteChange, onDeleted }: LookCardProps) {
  const items = normalizeOutfit(look.outfit)
  const palette = getPalette(look.outfit)
  const hasImage = typeof look.imageUrl === 'string' && look.imageUrl.length > 0
  const canPersist = typeof look.id === 'string' && look.id.length > 0

  const [favorite, setFavorite] = useState<boolean>(Boolean(look.favorite))
  const [favBusy, setFavBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tryOnOpen, setTryOnOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep local favorite state in sync when the look prop changes.
  useEffect(() => {
    setFavorite(Boolean(look.favorite))
  }, [look.favorite])

  async function toggleFavorite() {
    if (!canPersist || favBusy) return
    const next = !favorite
    setFavorite(next) // optimistic
    setFavBusy(true)
    setError(null)
    try {
      const res = await apiFetch<FavoriteResponse>(`/looks/${look.id}/favorite`, {
        method: 'POST',
        body: { favorite: next },
      })
      setFavorite(Boolean(res.look.favorite))
      onFavoriteChange?.(res.look)
    } catch (err) {
      setFavorite(!next) // revert
      setError(err instanceof Error ? err.message : 'Could not update favorite.')
    } finally {
      setFavBusy(false)
    }
  }

  async function handleDelete() {
    if (!canPersist || deleting) return
    if (!window.confirm('Remove this look from your history?')) return
    setDeleting(true)
    setError(null)
    try {
      await apiFetch<void>(`/looks/${look.id}`, { method: 'DELETE' })
      onDeleted?.(look.id as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this look.')
      setDeleting(false)
    }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-[3px] border border-ink/10 bg-surface ">
      {/* Image */}
      <div className="relative aspect-[3/4] bg-gradient-to-br from-bone to-iris-soft">
        {hasImage ? (
          <ZoomableImage
            src={look.imageUrl as string}
            alt={look.occasion ? `Look for ${look.occasion}` : 'Generated look'}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-ink/40">
            No image available
          </div>
        )}

        {canPersist && (
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={favBusy}
            aria-pressed={favorite}
            aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
            title={favorite ? 'Remove from favorites' : 'Add to favorites'}
            className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-[3px] bg-surface/85 transition hover:bg-surface disabled:opacity-60 ${favorite ? "text-iris" : "text-ink"}`}
          >
            <HeartIcon filled={favorite} />
          </button>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          {(look.occasion || look.gender) && (
            <p className="mb-1 text-xs uppercase tracking-[0.28em] text-brass">
              {[look.occasion, look.gender].filter(Boolean).join(' · ')}
            </p>
          )}
          <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Your Look</h2>
        </div>

        {items.length > 0 && (
          <div>
            <h3 className="label">The pieces</h3>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink/80">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[3px] bg-iris" />
                  <span>
                    {item.label && (
                      <span className="font-medium text-ink">{item.label}: </span>
                    )}
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {palette.length > 0 && (
          <div>
            <h3 className="label">Palette</h3>
            <div className="flex flex-wrap gap-2">
              {palette.map((color, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-[3px] border border-ink/10 bg-bone/60 py-1 pl-1.5 pr-3 text-xs text-ink/70"
                >
                  <span
                    className="h-4 w-4 rounded-[3px] border border-ink/10"
                    style={{ backgroundColor: toCssColor(color) }}
                  />
                  {color}
                </span>
              ))}
            </div>
          </div>
        )}

        {look.rationale && (
          <div>
            <h3 className="label">Why it works</h3>
            <p className="text-sm leading-relaxed text-ink/70">{look.rationale}</p>
          </div>
        )}

        {error && (
          <p className="alert-error" role="alert">
            {error}
          </p>
        )}

        {canPersist && (
          <div className="mt-auto flex items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={() => setTryOnOpen(true)}
              className="btn-ghost"
            >
              <TryOnIcon />
              <span className="ml-2">See it on me</span>
            </button>

            {onDeleted && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 text-sm font-medium text-ink/50 transition hover:text-red-700 disabled:opacity-60"
              >
                {deleting ? <Spinner className="h-3.5 w-3.5" /> : null}
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            )}
          </div>
        )}
      </div>

      {tryOnOpen && canPersist && (
        <TryOnModal lookId={look.id as string} onClose={() => setTryOnOpen(false)} />
      )}
    </article>
  )
}

function TryOnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
    </svg>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
