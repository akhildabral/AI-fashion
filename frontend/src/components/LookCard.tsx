import type { Look } from '../lib/types'

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
 *  - object wrapping an `items` array
 */
function normalizeOutfit(outfit: unknown): OutfitItem[] {
  if (outfit == null) return []

  if (Array.isArray(outfit)) {
    return outfit.flatMap((entry) => stringifyEntry(entry))
  }

  if (typeof outfit === 'object') {
    const obj = outfit as Record<string, unknown>

    // Common wrapper: { items: [...] }
    if (Array.isArray(obj.items)) {
      return obj.items.flatMap((entry) => stringifyEntry(entry))
    }

    return Object.entries(obj).flatMap(([key, value]) => {
      const parts = stringifyEntry(value)
      return parts.map((p) => ({ label: humanize(key), text: p.text }))
    })
  }

  return stringifyEntry(outfit)
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

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
}

export function LookCard({ look }: { look: Look }) {
  const items = normalizeOutfit(look.outfit)
  const hasImage = typeof look.imageUrl === 'string' && look.imageUrl.length > 0

  return (
    <article className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="grid gap-0 md:grid-cols-2">
        {/* Image */}
        <div className="relative aspect-[3/4] bg-gradient-to-br from-bone to-clay/20">
          {hasImage ? (
            <img
              src={look.imageUrl}
              alt={look.occasion ? `Look for ${look.occasion}` : 'Generated look'}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-ink/40">
              No image available
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-6 p-8">
          <div>
            {(look.occasion || look.gender) && (
              <p className="mb-1 text-xs uppercase tracking-[0.25em] text-clay">
                {[look.occasion, look.gender].filter(Boolean).join(' · ')}
              </p>
            )}
            <h2 className="font-serif text-3xl font-semibold text-ink">Your Look</h2>
          </div>

          {items.length > 0 && (
            <div>
              <h3 className="label">The pieces</h3>
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink/80">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-clay" />
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

          {look.rationale && (
            <div>
              <h3 className="label">Why it works</h3>
              <p className="text-sm leading-relaxed text-ink/70">{look.rationale}</p>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
