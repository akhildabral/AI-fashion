export interface OutfitItem {
  /** e.g. "Top", "Shoes" — derived from the object key when available. */
  label?: string
  text: string
}

/**
 * The outfit object shape may vary. Flatten whatever we get into a simple list
 * of displayable items so the UI never assumes a fixed structure:
 *  - array of strings/objects
 *  - object keyed by slot ({ top: "...", shoes: {...} })
 *  - object wrapping an `items` array or `items` object (current contract)
 * The `palette` key is handled separately (see `getPalette`) and skipped here.
 */
export function normalizeOutfit(outfit: unknown): OutfitItem[] {
  if (outfit == null) return []

  if (Array.isArray(outfit)) {
    return outfit.flatMap((entry) => stringifyEntry(entry))
  }

  if (typeof outfit === 'object') {
    const obj = outfit as Record<string, unknown>
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
    const name = obj.name ?? obj.item ?? obj.title ?? obj.description
    if (typeof name === 'string' && name.trim()) {
      return [{ text: name.trim() }]
    }
    const compact = Object.entries(obj)
      .filter(([, v]) => v != null && typeof v !== 'object')
      .map(([k, v]) => `${humanize(k)}: ${String(v)}`)
      .join(', ')
    return compact ? [{ text: compact }] : []
  }
  return []
}

/** Pull a color palette (array of strings) out of the outfit if present. */
export function getPalette(outfit: unknown): string[] {
  if (outfit == null || typeof outfit !== 'object' || Array.isArray(outfit)) return []
  const palette = (outfit as Record<string, unknown>).palette
  if (!Array.isArray(palette)) return []
  return palette.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
}

export function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
}

/** Map a palette color name/value to a CSS color; falls back to transparent. */
export function toCssColor(value: string): string {
  const v = value.trim().toLowerCase()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v
  if (/^[a-z]+$/.test(v)) return v
  return 'transparent'
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
