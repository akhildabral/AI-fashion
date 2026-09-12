import { useEffect, useMemo, useRef, useState } from 'react'
import { getFitBrands, inferredLine, updateFitReferences } from '@zauq/shared/profile'
import type { FitBrandOption, FitBrandsResponse, FitReference, Measurements, StyleProfile } from '@zauq/shared/types'
import { Chip, RowLabel, SkeletonBlock } from './ui'

// "What fits you": the size you trust in a brand you know, one tap per field,
// instead of a tape measure. Three rows (top, bottom, shoes); each saves as
// soon as it has a brand and a size, and the stylist says what she inferred
// underneath. Used in the Profile's Fit section and as a fitting step.

type Category = FitReference['category']
type Feel = NonNullable<FitReference['feel']>
type Scale = NonNullable<FitReference['scale']>

const ROWS: [Category, string, string][] = [
  ['top', 'A top', 'A shirt, a tee, a jacket you wear often.'],
  ['bottom', 'A bottom', 'Jeans or trousers you reach for.'],
  ['shoes', 'Shoes', 'Optional; it helps with sneakers and boots.'],
]
const FEELS: [Feel, string][] = [
  ['snug', 'Snug'],
  ['right', 'Just right'],
  ['roomy', 'Roomy'],
]
const SCALES: Scale[] = ['EU', 'UK', 'US']

type Draft = Partial<Record<Category, Partial<FitReference>>>

function fromCurrent(m: Measurements | null | undefined): Draft {
  const d: Draft = {}
  for (const r of m?.references ?? []) d[r.category] = { ...r }
  return d
}

/** A reference the server can read: brand and size, and a scale for shoes. */
function complete(d: Partial<FitReference> | undefined, c: Category): FitReference | null {
  if (!d?.brand || !d.size) return null
  return c === 'shoes' ? { category: c, brand: d.brand, size: d.size, scale: d.scale ?? 'EU' } : { category: c, brand: d.brand, size: d.size, feel: d.feel ?? null }
}

/** The region's usual shoe scale, so the first tap is the likely one. */
function defaultScale(region: string): Scale {
  return region === 'IN' || region === 'UK' ? 'UK' : region === 'US' ? 'US' : 'EU'
}

export function FitReferencesCard({
  current,
  gender,
  unit = 'cm',
  onSaved,
  onNote,
  onManual,
  onBrands,
  manualOpen = false,
  embedded = false,
}: {
  current: Measurements | null
  /** Who we dress: the chart gender; null asks the server for the profile's. */
  gender: FitBrandsResponse['gender'] | null
  unit?: 'cm' | 'in'
  onSaved: (p: StyleProfile) => void
  onNote: (msg: string) => void
  /** Reveals the manual measurements card; absent hides the link. */
  onManual?: () => void
  manualOpen?: boolean
  /** Brand names by id once loaded, for a caller that writes its own notes. */
  onBrands?: (names: Record<string, string>) => void
  /** In the fitting: no card chrome, the page owns the head. */
  embedded?: boolean
}) {
  const [brands, setBrands] = useState<FitBrandsResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => fromCurrent(current))
  const [saving, setSaving] = useState(false)
  const latest = useRef(JSON.stringify(current?.references ?? []))

  useEffect(() => {
    let live = true
    setFailed(false)
    getFitBrands(gender ?? undefined)
      .then((b) => live && setBrands(b))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [gender])

  const names = useMemo(() => Object.fromEntries((brands?.brands ?? []).map((b) => [b.id, b.name])), [brands])
  useEffect(() => {
    if (brands) onBrands?.(names)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's setter is stable
  }, [names])
  const line = inferredLine(current, names, unit)

  async function persist(next: Draft) {
    const refs = ROWS.map(([c]) => complete(next[c], c)).filter((r): r is FitReference => !!r)
    const key = JSON.stringify(refs)
    if (key === latest.current) return
    latest.current = key
    setSaving(true)
    try {
      const { profile } = await updateFitReferences(refs)
      onSaved(profile)
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not save that; try again.')
    } finally {
      setSaving(false)
    }
  }

  function set(c: Category, patch: Partial<FitReference> | null) {
    const next: Draft = { ...draft, [c]: patch ? { ...draft[c], ...patch } : undefined }
    setDraft(next)
    void persist(next)
  }

  function pickBrand(c: Category, id: string) {
    const cur = draft[c]
    if (cur?.brand === id) return set(c, null)
    // A new brand means a new size; the feel and the scale carry over.
    set(c, { category: c, brand: id, size: undefined, feel: cur?.feel ?? null, scale: cur?.scale ?? (brands ? defaultScale(brands.region) : 'EU') })
  }

  const body = (
    <>
      {failed && <p className="mt-3 font-display text-sm italic text-ink/45">The brand charts didn’t load; try again in a moment.</p>}
      {!brands && !failed && (
        <div className="mt-4 grid gap-3">
          <SkeletonBlock className="h-9 w-3/4" />
          <SkeletonBlock className="h-9 w-1/2" />
        </div>
      )}
      {brands &&
        ROWS.map(([c, label, hint], i) => {
          const offering = brands.brands.filter((b) => !!b[c])
          if (!offering.length) return null
          const cur = draft[c]
          const chosen = offering.find((b) => b.id === cur?.brand) ?? null
          const scale = (cur?.scale ?? defaultScale(brands.region)) as Scale
          const sizes = chosen ? sizesFor(chosen, c, scale) : []
          return (
            <div key={c} className={i === 0 && embedded ? '' : 'mt-8'}>
              <RowLabel first>{label}</RowLabel>
              <p className="mt-1 text-sm text-ink/55">{hint}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`${label}: brand`}>
                {offering.map((b) => (
                  <Chip key={b.id} on={cur?.brand === b.id} onClick={() => pickBrand(c, b.id)} disabled={saving}>
                    {b.name}
                  </Chip>
                ))}
              </div>
              {chosen && c === 'shoes' && (
                <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Shoe size scale">
                  <span className="mr-1 text-xs text-ink/45">Scale</span>
                  {SCALES.map((s) => (
                    <Chip key={s} on={scale === s} onClick={() => set(c, { scale: s, size: undefined })} disabled={saving}>
                      {s}
                    </Chip>
                  ))}
                </div>
              )}
              {chosen && (
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Your size in ${chosen.name}`}>
                  {sizes.map((s) => (
                    <Chip key={s} on={cur?.size === s} onClick={() => set(c, { size: cur?.size === s ? undefined : s })} disabled={saving} className="[font-variant-numeric:tabular-nums]">
                      {s}
                    </Chip>
                  ))}
                </div>
              )}
              {chosen && cur?.size && c !== 'shoes' && (
                <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="How it fits">
                  <span className="mr-1 text-xs text-ink/45">It fits</span>
                  {FEELS.map(([k, l]) => (
                    <Chip key={k} on={cur.feel === k} onClick={() => set(c, { feel: cur.feel === k ? null : k })} disabled={saving}>
                      {l}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      {line && (
        <p className="mt-8 max-w-[52ch] font-display text-lg italic leading-snug text-ink" aria-live="polite">
          {line}
        </p>
      )}
      {onManual && !manualOpen && (
        <button type="button" onClick={onManual} className="btn-quiet btn-quiet-sm mt-4">
          {line ? 'Correct it with measurements' : 'Add measurements instead'}
        </button>
      )}
    </>
  )

  if (embedded) return <div className="animate-rise-2">{body}</div>
  return (
    <section className="card p-5">
      <RowLabel first>What fits you</RowLabel>
      <p className="mt-1 text-sm text-ink/55">A size you trust in a brand you know. I read the rest off their charts; no tape needed.</p>
      {body}
    </section>
  )
}

function sizesFor(b: FitBrandOption, c: Category, scale: Scale): string[] {
  if (c === 'shoes') return b.shoes?.scales[scale] ?? []
  return b[c]?.sizes ?? []
}
