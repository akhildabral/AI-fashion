import { money } from '@zauq/shared/money'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { compareCandidates, type CompareEdge, type CompareLean, type CompareResponse, type CompareSide } from '@zauq/shared/store'
import { PageShell, Eyebrow, Arch, Plaque, Badge, SkeletonBlock, LoadError } from '../components/ui'
import { VerdictPlaques, eventLabel, type PlaqueKey } from '../components/VerdictPlaques'
import { resolveImageUrl } from '../lib/api'
import { asOf, candidateLabel, candidatePrice, headlineFor } from '../lib/fitting-room'

// Compare two: two candidates from the wishlist side by side — the arch, the
// headline and the five plaques in the same order on each side, the edge on
// each plaque marked, and one line at the top saying which earns its place.
// Two columns on a desk, stacked on a phone.

type Side = 'a' | 'b'

/** The plaque each edge belongs to: outfits sit on the verdict, the duplicate on the closet. */
const EDGE_OF: Record<PlaqueKey | 'verdict', keyof CompareEdge> = { verdict: 'outfits', closet: 'duplicate', money: 'budget', build: 'build', taste: 'taste' }

function EdgeMark({ lean, side }: { lean: CompareLean; side: Side }) {
  if (lean !== side) return null
  return (
    <Badge tone="quiet" className="ml-2 align-middle">
      The edge
    </Badge>
  )
}

function Column({ side, data, edge, index }: { side: Side; data: CompareSide; edge: CompareEdge; index: number }) {
  const navigate = useNavigate()
  const { item, v2 } = data
  const label = candidateLabel(item)
  const shown = candidatePrice(item)
  const priceLine = v2.money.price != null ? money(v2.money.price, { currency: v2.money.currency ?? undefined }) : shown ? money(shown.amount, { currency: shown.currency ?? undefined }) : null
  const priceDate = asOf(v2.money.asOf ?? item.lastCheckedAt ?? item.seenAt)
  const head = headlineFor(v2.headline)
  const eventTypes = (v2.eventTypes ?? []).filter(Boolean)
  const leads = edge.overall === side
  return (
    <section className={`min-w-0 ${index === 1 ? 'animate-rise-1' : 'animate-rise-2'}`} aria-label={label}>
      <div className="grid grid-cols-[112px_1fr] gap-4 sm:grid-cols-[140px_1fr]">
        <Arch aspect="aspect-[5/6]" bright={leads}>
          <img src={resolveImageUrl(item.imageUrl)} alt={label} className="relative z-[1] h-full w-full object-contain p-[7%]" />
        </Arch>
        <div className="min-w-0 self-center">
          <Eyebrow>{[item.retailer ?? item.store, label].filter(Boolean).join(' · ')}</Eyebrow>
          <h2 className="mt-2 font-display text-2xl font-medium leading-[1.2] text-ink sm:text-[28px]">
            {head.lead} <em className="text-brass-ink">{head.em}</em>
          </h2>
          {v2.line && <p className="mt-2 font-display text-base italic leading-snug text-ink/70">{v2.line}</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <Plaque
          label={
            <>
              The verdict
              <EdgeMark lean={edge[EDGE_OF.verdict]} side={side} />
            </>
          }
          value={v2.closet.outfits}
          note={`outfit${v2.closet.outfits === 1 ? '' : 's'} with what you own`}
        >
          {eventTypes.length > 0 && <p className="mt-2 text-xs text-ink/45">Checked for {eventTypes.map((e) => eventLabel(e).toLowerCase()).join(' and ')}.</p>}
        </Plaque>
        <VerdictPlaques
          v2={v2}
          priceLine={priceLine}
          priceDate={priceDate}
          showEmpty
          labelFor={(key, text) => (
            <>
              {text}
              <EdgeMark lean={edge[EDGE_OF[key]]} side={side} />
            </>
          )}
        />
      </div>

      <div className="action-row mt-4">
        <button type="button" onClick={() => navigate(`/closet/store?item=${item.id}`)} className="btn-quiet">
          Keep this one
        </button>
      </div>
    </section>
  )
}

export function ComparePage() {
  usePageTitle('Compare two')
  const [params] = useSearchParams()
  const a = params.get('a') ?? ''
  const b = params.get('b') ?? ''
  const [data, setData] = useState<CompareResponse | null>(null)
  const [developing, setDeveloping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!a || !b) return
    setError(null)
    try {
      const r = await compareCandidates(a, b)
      if ('status' in r && r.status === 'processing') {
        setDeveloping(true)
        return
      }
      setDeveloping(false)
      setData(r as CompareResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t put those two side by side.')
    }
  }, [a, b])

  useEffect(() => {
    void load()
  }, [load])

  // One of them still developing: read again until both settle.
  useEffect(() => {
    if (!developing) return
    const t = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(t)
  }, [developing, load])

  const missing = !a || !b || a === b

  return (
    <PageShell wide>
      <Eyebrow className="animate-rise">The wishlist · Compare two</Eyebrow>
      <h1 className="page-title mt-2 animate-rise-1">
        Side by <em className="text-brass-ink">side.</em>
      </h1>

      {missing ? (
        <div className="mt-6 max-w-xl animate-rise-1">
          <p className="empty-line">Pick two pieces in the wishlist and I’ll put them side by side.</p>
          <div className="action-row mt-6">
            <Link to="/closet/wishlist" className="btn-primary">
              The wishlist
            </Link>
          </div>
        </div>
      ) : error ? (
        <LoadError className="mt-8" message={error} onRetry={() => void load()} />
      ) : !data ? (
        <div className="mt-6 animate-rise-1">
          <SkeletonBlock className="h-6 w-2/3 max-w-lg" />
          {developing && <p className="mt-3 text-sm text-ink/50">One of them is still developing. Reading again in a moment.</p>}
          <div className="mt-8 grid gap-8 md:grid-cols-2 md:gap-10">
            {[0, 1].map((i) => (
              <div key={i}>
                <div className="grid grid-cols-[112px_1fr] gap-4 sm:grid-cols-[140px_1fr]">
                  <SkeletonBlock className="aspect-[5/6] w-full" />
                  <div className="self-center">
                    <SkeletonBlock className="h-3 w-24" />
                    <SkeletonBlock className="mt-3 h-7 w-3/4" />
                  </div>
                </div>
                <SkeletonBlock className="mt-6 h-24 w-full" />
                <SkeletonBlock className="mt-4 h-24 w-full" />
                <SkeletonBlock className="mt-4 h-24 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 max-w-[40rem] animate-rise-1 font-display text-lg italic leading-snug text-ink/70 sm:text-xl">{data.line}</p>
          <div className="mt-8 grid gap-10 md:grid-cols-2 md:gap-12">
            <Column side="a" data={data.a} edge={data.edge} index={1} />
            <Column side="b" data={data.b} edge={data.edge} index={2} />
          </div>
          <div className="action-row mt-10">
            <Link to="/closet/wishlist" className="btn-quiet">
              Back to the wishlist
            </Link>
          </div>
        </>
      )}
    </PageShell>
  )
}
