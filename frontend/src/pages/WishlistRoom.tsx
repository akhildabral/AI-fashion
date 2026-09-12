import { money } from '@zauq/shared/money'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { addCandidate, deleteWardrobeItem, getWishlist, recatalogWardrobeItem, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { outboundLink, rereadCandidate, setGapOptOut, setNudge, type NudgeIn, type OutboundLink } from '@zauq/shared/store'
import { getClosetGaps } from '@zauq/shared/brief'
import { ClosetRooms, RoomMantel } from '../components/ClosetRooms'
import { PageShell, Toast, useFlash, LoadError, UndoBar, GarmentTile, MirrorFrame, Badge, Filter, MoreMenu, MenuItem, ArchSkeleton, Chip } from '../components/ui'
import { PasteField, StoreDoors } from '../components/StoreDoors'
import { resolveImageUrl } from '../lib/api'
import { asOf, availabilityLabel, candidateLabel, candidatePrice, needsAffiliateDisclosure, showsAffiliateBadge } from '../lib/fitting-room'
import type { IngestSource, VerdictV2, WardrobeItem } from '@zauq/shared/types'

// The wishlist, as a place: kept pieces on arches, each carrying its link,
// its price with the date, its verdict and its try-on. Ranked by what each
// one unlocks. It helps the Closet spot gaps; it never enters the brief.

interface Verdict {
  outfits: number
  pairs: number
  closetSize: number
  computedAt: string
  v2?: VerdictV2 | null
}

type Kept = WardrobeItem & { v: Verdict | null; v2: VerdictV2 | null }

function eventLabel(e: string): string {
  switch (e) {
    case 'work':
      return 'Work'
    case 'casual':
      return 'Weekends'
    case 'evening':
      return 'Evenings'
    case 'occasion':
      return 'Occasions'
    case 'athletic':
      return 'Training'
    default:
      return e.charAt(0).toUpperCase() + e.slice(1)
  }
}

function withVerdict(i: WardrobeItem): Kept {
  const raw = i as WardrobeItem & { verdict?: Verdict | null; v2?: VerdictV2 | null }
  return { ...i, v: raw.verdict ?? null, v2: raw.v2 ?? raw.verdict?.v2 ?? null }
}

export function WishlistRoom() {
  usePageTitle('Wishlist')
  const navigate = useNavigate()
  const { toast, flash } = useFlash()
  const [items, setItems] = useState<Kept[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<{ item: Kept; timer: number } | null>(null)
  const [links, setLinks] = useState<Record<string, OutboundLink | null>>({})
  const [gapIds, setGapIds] = useState<Set<string>>(new Set())
  const [occasion, setOccasion] = useState<string | null>(null)
  const [gapsOnly, setGapsOnly] = useState(false)
  const [showRender, setShowRender] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  // Compare mode: pick two cards, then put them side by side.
  const [comparing, setComparing] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const r = await getWishlist()
      const list = r.items.map(withVerdict)
      list.sort((a, b) => (b.v?.outfits ?? -1) - (a.v?.outfits ?? -1))
      setItems(list)
      setFailed(false)
      // The way back to each shop, and whether the link is wrapped: fetched
      // once so the Affiliate label is on the card before anyone taps.
      for (const it of list) {
        if (!(it.sourceUrl || it.canonicalUrl) || it.id in links) continue
        outboundLink(it.id)
          .then((l) => setLinks((p) => ({ ...p, [it.id]: l })))
          .catch(() => setLinks((p) => ({ ...p, [it.id]: null })))
      }
    } catch {
      setFailed(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    void load()
    getClosetGaps()
      .then((g) => setGapIds(new Set(g.suggestions.map((s) => (s as { wishlistItemId?: string | null }).wishlistItemId).filter((x): x is string => !!x))))
      .catch(() => undefined)
  }, [load])

  // Pieces still developing: read the list again until they settle.
  const developing = items?.some((it) => it.status === 'processing') ?? false
  useEffect(() => {
    if (!developing) return
    const t = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(t)
  }, [developing, load])

  function patch(id: string, next: Partial<WardrobeItem>) {
    setItems((p) => (p ?? []).map((x) => (x.id === id ? { ...x, ...next } : x)))
  }

  async function bought(it: Kept) {
    setBusy(it.id)
    try {
      // Only the one fact changes; store, price, size and source stay as they are.
      await updateWardrobeItem(it.id, { owned: true })
      flash(`In the closet. The ${it.subtype ?? it.category} is a piece now.`)
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not move it in.')
    } finally {
      setBusy(null)
    }
  }
  // Deferred delete: the piece leaves the list now, but the server call waits
  // ~5s so an Undo can pull it back.
  function letGo(it: Kept) {
    if (pending) {
      window.clearTimeout(pending.timer)
      void deleteWardrobeItem(pending.item.id).catch(() => undefined)
    }
    setItems((p) => (p ?? []).filter((x) => x.id !== it.id))
    const timer = window.setTimeout(() => {
      void deleteWardrobeItem(it.id).catch(() => {
        flash('Couldn’t let it go. Try again.')
        setItems((p) => [it, ...(p ?? [])])
      })
      setPending(null)
    }, 5000)
    setPending({ item: it, timer })
  }
  function undoLetGo() {
    if (!pending) return
    window.clearTimeout(pending.timer)
    setItems((p) => [pending.item, ...(p ?? [])])
    setPending(null)
  }
  async function nudge(it: Kept, when: NudgeIn | null) {
    setBusy(it.id)
    try {
      const { item } = await setNudge(it.id, when)
      patch(it.id, item ?? { nudgeAt: when === null || when === 'never' ? null : it.nudgeAt })
      flash(when === null || when === 'never' ? 'No nudge. It waits quietly.' : `I’ll nudge you in ${when === 'fortnight' ? 'a fortnight' : 'a month'}.`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not change the nudge.')
    } finally {
      setBusy(null)
    }
  }
  async function optOut(it: Kept) {
    setBusy(it.id)
    try {
      await setGapOptOut(it.id, true)
      patch(it.id, { gapOptOut: true })
      setGapIds((p) => {
        const n = new Set(p)
        n.delete(it.id)
        return n
      })
      flash('Off the gaps rail. I won’t suggest it for the closet.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not change that.')
    } finally {
      setBusy(null)
    }
  }
  /** A failed read, read again for the same candidate. */
  async function tryAgain(it: Kept) {
    setBusy(it.id)
    try {
      const { item } = it.sourceUrl || it.canonicalUrl ? await rereadCandidate(it.id) : await recatalogWardrobeItem(it.id)
      patch(it.id, item ?? { status: 'processing' })
      flash('Reading it again.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read it again.')
    } finally {
      setBusy(null)
    }
  }
  async function openShop(it: Kept) {
    const known = links[it.id]
    const url = known?.url ?? it.canonicalUrl ?? it.sourceUrl
    if (url) {
      window.open(url, '_blank', 'noopener')
      return
    }
    try {
      const l = await outboundLink(it.id)
      setLinks((p) => ({ ...p, [it.id]: l }))
      window.open(l.url, '_blank', 'noopener')
    } catch {
      flash('The shop’s address isn’t on this piece.')
    }
  }
  /** A photo picked here goes through the store page's reading. */
  async function onFile(file: File, source: IngestSource) {
    setUploading(true)
    try {
      const r = await addCandidate(file, { ingestSource: source })
      navigate('/closet/store', { state: { upload: r } })
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read that piece.')
    } finally {
      setUploading(false)
    }
  }

  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? p : [...p, id]))
  }
  function stopComparing() {
    setComparing(false)
    setPicked([])
  }

  const list = items ?? []
  const occasions = [...new Set(list.flatMap((it) => it.v2?.eventTypes ?? []))]
  const readyCount = list.filter((it) => it.status === 'ready').length
  const visible = list.filter((it) => {
    if (occasion && !(it.v2?.eventTypes ?? []).includes(occasion)) return false
    if (gapsOnly && !gapIds.has(it.id)) return false
    return true
  })
  const total = list.reduce((s, i) => s + (candidatePrice(i)?.amount ?? 0), 0)
  const affiliate = needsAffiliateDisclosure(Object.values(links))

  return (
    <PageShell wide>
      <Toast msg={toast} />
      <RoomMantel
        eyebrow="The collection"
        title="Wishlist"
        line={items ? `${items.length} piece${items.length === 1 ? '' : 's'} in mind${total > 0 ? ` · ${money(total)} if you bought them all` : ''}` : undefined}
        aside={<PasteField small className="w-full max-w-md sm:w-[26rem]" onUrl={(u) => navigate(`/closet/store?url=${encodeURIComponent(u)}`)} />}
      />
      <ClosetRooms current="wishlist" />

      {failed && !items && (
        <LoadError
          message="Couldn’t load your wishlist. Check your connection and try again."
          onRetry={() => {
            setFailed(false)
            void load()
          }}
        />
      )}

      {items === null && !failed && <ArchSkeleton count={6} className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6 lg:gap-6" />}

      {!failed && items && items.length === 0 && (
        <div className="mt-10 max-w-xl animate-rise-1">
          <p className="empty-line">Nothing in mind yet. A link, a photo or a screenshot, and the closet answers before you pay.</p>
          <StoreDoors className="mt-6" disabled={uploading} onFile={(f, s) => void onFile(f, s)} onPasteDoor={() => navigate('/closet/store?door=paste')} />
        </div>
      )}

      {items && items.length > 0 && (
        <>
          {(occasions.length > 0 || gapIds.size > 0 || readyCount >= 2) && (
            <div className="mt-6 flex animate-rise-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
                {(occasions.length > 0 || gapIds.size > 0) && (
                  <Filter on={occasion === null && !gapsOnly} onClick={() => { setOccasion(null); setGapsOnly(false) }} count={list.length}>
                    All
                  </Filter>
                )}
                {occasions.map((o) => (
                  <Filter key={o} on={occasion === o} onClick={() => setOccasion((p) => (p === o ? null : o))} count={list.filter((it) => (it.v2?.eventTypes ?? []).includes(o)).length}>
                    {eventLabel(o)}
                  </Filter>
                ))}
                {gapIds.size > 0 && (
                  <Filter on={gapsOnly} onClick={() => setGapsOnly((p) => !p)} count={list.filter((it) => gapIds.has(it.id)).length}>
                    Fills a gap
                  </Filter>
                )}
              </div>
              {/* Compare two: a quiet toggle; once two are picked, the one primary. */}
              {readyCount >= 2 && (
                <div className="action-row shrink-0">
                  {comparing && picked.length === 2 && (
                    <Link to={`/closet/compare?a=${picked[0]}&b=${picked[1]}`} className="btn-primary btn-sm">
                      Compare these two
                    </Link>
                  )}
                  {comparing ? (
                    <button type="button" onClick={stopComparing} className="btn-quiet btn-quiet-sm">
                      {picked.length === 2 ? 'Done' : picked.length === 1 ? 'Pick one more' : 'Pick two to compare'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => setComparing(true)} className="btn-quiet btn-quiet-sm">
                      Compare
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {visible.length === 0 ? (
            <p className="empty-line py-12 text-center">Nothing in mind for that.</p>
          ) : (
            <div className="mt-8 grid animate-rise-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {visible.map((it) => {
                const label = candidateLabel(it)
                const price = candidatePrice(it)
                const date = asOf(it.lastCheckedAt ?? it.seenAt)
                const avail = availabilityLabel(it.availability)
                const link = links[it.id]
                const hasLink = Boolean(link?.url ?? it.canonicalUrl ?? it.sourceUrl)
                const rendered = it.tryOnUrl && showRender.has(it.id)
                const where = it.retailer ?? it.store
                return (
                  <article key={it.id} className="card grid grid-cols-[104px_1fr] gap-4 p-4">
                    <div className="self-start">
                      {rendered ? (
                        <MirrorFrame>
                          <img src={resolveImageUrl(it.tryOnUrl!)} alt={`You, in the ${label}`} className="aspect-[2/3] w-full object-cover" />
                        </MirrorFrame>
                      ) : (
                        <GarmentTile imageUrl={it.imageUrl} label={undefined} processing={it.status === 'processing'} badge={gapIds.has(it.id) ? 'Fills a gap' : undefined} onClick={() => navigate(`/closet/store?item=${it.id}`)} />
                      )}
                      {it.tryOnUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setShowRender((p) => {
                              const n = new Set(p)
                              if (n.has(it.id)) n.delete(it.id)
                              else n.add(it.id)
                              return n
                            })
                          }
                          className="press mt-2 block w-full text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-brass-ink"
                        >
                          {rendered ? 'The piece' : 'On you'}
                        </button>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-display text-xl font-medium leading-tight text-ink">{label}</p>
                        {comparing && it.status === 'ready' && (
                          <Chip on={picked.includes(it.id)} disabled={!picked.includes(it.id) && picked.length >= 2} onClick={() => togglePick(it.id)} className="-mt-1 shrink-0" title={picked.includes(it.id) ? `Drop the ${label} from the comparison` : `Pick the ${label} to compare`}>
                            {picked.includes(it.id) ? 'Picked' : 'Pick'}
                          </Chip>
                        )}
                        <MoreMenu align="right" label={`More for the ${label}`} className="-mr-1 -mt-1 shrink-0">
                          <MenuItem onClick={() => void nudge(it, 'fortnight')}>Nudge me in a fortnight</MenuItem>
                          <MenuItem onClick={() => void nudge(it, 'month')}>Nudge me in a month</MenuItem>
                          {it.nudgeAt && <MenuItem onClick={() => void nudge(it, null)}>Cancel the nudge</MenuItem>}
                          {it.status === 'failed' && <MenuItem onClick={() => void tryAgain(it)}>Try the read again</MenuItem>}
                          {!it.gapOptOut && <MenuItem onClick={() => void optOut(it)}>Don’t suggest this for gaps</MenuItem>}
                        </MoreMenu>
                      </div>
                      {it.v ? (
                        <p className="mt-1 text-sm text-ink/70">
                          <b className="text-brass-ink [font-variant-numeric:tabular-nums]">
                            {it.v.outfits} outfit{it.v.outfits === 1 ? '' : 's'}
                          </b>{' '}
                          · pairs with {it.v.pairs}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-ink/50">{it.status === 'processing' ? 'still developing' : it.status === 'failed' ? 'that one didn’t read' : 'verdict pending'}</p>
                      )}
                      <p className="mt-1 text-xs text-ink/55 [font-variant-numeric:tabular-nums]">
                        {price ? (
                          <>
                            <b className="text-ink">{money(price.amount, { currency: price.currency ?? undefined })}</b>
                            {date ? ` ${date}` : ''}
                          </>
                        ) : (
                          'No price yet'
                        )}
                        {where ? ` · ${where}` : ''}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {avail && <Badge tone="quiet">{avail}</Badge>}
                        {it.nudgeAt && <Badge tone="quiet">Nudge {new Date(it.nudgeAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Badge>}
                        {it.status === 'failed' && (
                          <button type="button" disabled={busy === it.id} onClick={() => void tryAgain(it)} className="btn-quiet btn-quiet-sm">
                            Try again
                          </button>
                        )}
                      </div>
                      <div className="action-row mt-4">
                        <button type="button" disabled={busy === it.id} onClick={() => void bought(it)} className="btn-primary btn-sm">
                          Bought it
                        </button>
                        <Link to={`/closet/store?item=${it.id}`} className="btn-quiet btn-quiet-sm">
                          The verdict
                        </Link>
                        {it.status === 'ready' && (
                          <Link to={`/closet/store?item=${it.id}`} className="btn-quiet btn-quiet-sm">
                            See it on you
                          </Link>
                        )}
                        {hasLink && (
                          <button type="button" onClick={() => void openShop(it)} className="btn-quiet btn-quiet-sm">
                            Open at the shop
                            {showsAffiliateBadge(link) && (
                              <Badge tone="quiet" className="ml-1.5">
                                Affiliate
                              </Badge>
                            )}
                          </button>
                        )}
                        <button type="button" disabled={busy === it.id} onClick={() => letGo(it)} className="btn-quiet btn-quiet-sm">
                          Let it go
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          {affiliate && <p className="mt-8 text-xs text-ink/45">Links marked Affiliate may earn ZAUQ a small commission from the shop. The price you pay is the same, and the verdict never knows which links pay.</p>}
        </>
      )}
      {pending && <UndoBar message={`${pending.item.subtype ?? pending.item.category} let go.`} onUndo={undoLetGo} />}
    </PageShell>
  )
}
