import { money, currencySymbol } from '@zauq/shared/money'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { addCandidate, deleteWardrobeItem, getVerdict, recatalogWardrobeItem, type VerdictResponse } from '@zauq/shared/wardrobe'
import { candidateTryOn, chooseGarment, importFromLink, previewLink, rereadCandidate, updateCandidate, type CandidateEdit, type CandidateUploadResponse, type DetectedGarment, type NudgeIn } from '@zauq/shared/store'
import { getTryOn } from '@zauq/shared/tryon'
import { PageShell, Toast, useFlash, Eyebrow, Arch, Plaque, Alert, Chip, MirrorFrame, SkeletonBlock, Tabs } from '../components/ui'
import { LookBoard } from '../components/LookBoard'
import { PasteField, StoreDoors, type PasteFieldHandle } from '../components/StoreDoors'
import { resolveImageUrl } from '../lib/api'
import { fidelityLine } from '../lib/fidelity'
import { asOf, candidateLabel, candidatePrice, extractShareUrl, headlineFor, readFailureLine, toneClass } from '../lib/fitting-room'
import type { IngestSource, LinkRead, LinkReadFailure, TryOn, VerdictPlaqueLine, WardrobeItem } from '@zauq/shared/types'

// The Fitting Room's door: a piece from a link, a photo in the shop, or a
// screenshot. The same reading that catalogues your closet reads it; the
// verdict answers whether to buy it, whether you'd wear it and whether it
// suits you; keep it in mind, pass, or buy it.

type Stage = 'viewfinder' | 'reading' | 'choose' | 'verdict' | 'kept' | 'bought' | 'failed' | 'link-failed'

const READING_LINES = ['Cutting it out…', 'Reading the colour and cut…', 'Checking it against your closet…']
const LINK_LINES = ['Opening the page…', 'Reading what the shop says…', 'Checking it against your closet…']
const DRESSING_LINES = ['Taking your measure…', 'Cutting the pieces…', 'Fitting the shoulders…', 'Setting the light…']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    const d = 900
    let raf = 0
    const f = (t: number) => {
      const p = Math.min(1, (t - t0) / d)
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{v}</>
}

/** One plaque's lines, each in its tone: a flag in the danger token, good in brass, a note quiet. */
function Lines({ lines, className = '' }: { lines: VerdictPlaqueLine[] | undefined; className?: string }) {
  const list = (lines ?? []).filter((l) => l && l.line)
  if (list.length === 0) return null
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {list.map((l, i) => (
        <li key={i} className={`text-sm leading-relaxed ${toneClass(l.tone)}`}>
          {l.line}
        </li>
      ))}
    </ul>
  )
}

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

interface TryOnState {
  status: 'idle' | 'rendering' | 'ready' | 'failed' | 'no-reflection'
  url?: string | null
  render?: TryOn | null
}

export function StorePage() {
  usePageTitle('In the store')
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { toast, flash } = useFlash()
  const [stage, setStage] = useState<Stage>('viewfinder')
  const [preview, setPreview] = useState<string | null>(null)
  const [piece, setPiece] = useState<WardrobeItem | null>(null)
  const [verdict, setVerdict] = useState<VerdictResponse | null>(null)
  const [line, setLine] = useState(0)
  const [store, setStore] = useState('')
  const [price, setPrice] = useState('')
  const [nudge, setNudge] = useState<NudgeIn>('fortnight')
  const [busy, setBusy] = useState(false)
  const [eventTab, setEventTab] = useState<string>('all')
  // The link door
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [linkRead, setLinkRead] = useState<LinkRead | null>(null)
  const [failure, setFailure] = useState<LinkReadFailure | null>(null)
  // A photo of several pieces
  const [detected, setDetected] = useState<{ parentId: string; options: DetectedGarment[]; items: WardrobeItem[] } | null>(null)
  // On you
  const [tryOn, setTryOn] = useState<TryOnState>({ status: 'idle' })
  const [dressLine, setDressLine] = useState(0)
  const pasteRef = useRef<PasteFieldHandle>(null)
  const screenshot = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (stage !== 'reading') return
    const t = window.setInterval(() => setLine((n) => (n + 1) % READING_LINES.length), 1500)
    return () => window.clearInterval(t)
  }, [stage])
  useEffect(() => {
    if (tryOn.status !== 'rendering') return
    const t = window.setInterval(() => setDressLine((n) => (n + 1) % DRESSING_LINES.length), 1800)
    return () => window.clearInterval(t)
  }, [tryOn.status])

  /**
   * Poll the verdict until the piece is read. The verdict is cached on the
   * piece, so once it is ready we read it once or twice more — stopping as
   * soon as `computedAt` stops moving — rather than polling forever.
   */
  const read = useCallback(async (id: string) => {
    let last: VerdictResponse | null = null
    let stable = 0
    for (let i = 0; i < 40 && alive.current; i++) {
      try {
        const r = await getVerdict(id)
        if (r.status === 'failed') {
          setStage('failed')
          return
        }
        if (r.status === 'ready') {
          setPiece(r.piece)
          setVerdict(r)
          setTryOn(r.piece.tryOnUrl ? { status: 'ready', url: r.piece.tryOnUrl } : { status: 'idle' })
          setStage('verdict')
          if (r.v2) return
          if (last && last.verdict?.computedAt === r.verdict?.computedAt) stable++
          last = r
          if (stable >= 1) return
        }
      } catch {
        /* keep polling */
      }
      await sleep(2500)
    }
    if (!last) setStage('failed')
  }, [])

  const handleUpload = useCallback(
    async (r: CandidateUploadResponse) => {
      const items = r.items?.length ? r.items : r.item ? [r.item] : []
      const options = r.detected ?? []
      if (items.length === 0) throw new Error('Nothing was read from that photo.')
      if (items.length > 1 || options.length > 1) {
        const parentId = r.item?.id ?? items[0].id
        setDetected({
          parentId,
          options: options.length ? options : items.map((it, i) => ({ index: i, label: candidateLabel(it), category: it.category, imageUrl: it.imageUrl })),
          items,
        })
        setStage('choose')
        return
      }
      setPiece(items[0])
      await read(items[0].id)
    },
    [read],
  )

  async function onFile(file: File, source: IngestSource) {
    setPreview(URL.createObjectURL(file))
    setLinkRead(null)
    setFailure(null)
    setStage('reading')
    try {
      const r = await addCandidate(file, { ingestSource: source })
      await handleUpload(r)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read that piece.')
      setStage('viewfinder')
    }
  }

  const startLink = useCallback(
    async (url: string, source: IngestSource = 'link') => {
      setLinkUrl(url)
      setLinkRead(null)
      setFailure(null)
      setPreview(null)
      setStage('reading')
      try {
        const read1 = await previewLink(url)
        if (!alive.current) return
        if (!read1.ok) {
          setFailure(read1)
          setStage('link-failed')
          return
        }
        setLinkRead(read1)
        const imported = await importFromLink(url, source)
        if (!alive.current) return
        if (!('item' in imported)) {
          setFailure(imported)
          setStage('link-failed')
          return
        }
        setLinkRead(imported.read ?? read1)
        setPiece(imported.item)
        await read(imported.item.id)
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Could not read that link.')
        setStage('viewfinder')
      }
    },
    [flash, read],
  )

  // Doors that arrive by address: ?item= reopens a wishlist verdict; ?url=
  // (the share target, the extension, the wishlist's paste field) starts an
  // import; ?door=paste puts the cursor in the field. A photo picked on the
  // wishlist arrives as router state. The params are consumed once.
  useEffect(() => {
    const item = params.get('item')
    const shared = extractShareUrl({ title: params.get('title'), text: params.get('text'), url: params.get('url') })
    const door = params.get('door')
    const upload = (location.state as { upload?: CandidateUploadResponse } | null)?.upload
    if (!item && !shared && !door && !upload) return
    if (item || shared || door) setParams({}, { replace: true })
    if (upload) navigate(location.pathname, { replace: true, state: null })
    if (item) {
      setStage('reading')
      void read(item)
    } else if (shared) {
      void startLink(shared, params.get('text') || params.get('title') ? 'share' : 'link')
    } else if (upload) {
      setStage('reading')
      void handleUpload(upload).catch((err) => {
        flash(err instanceof Error ? err.message : 'Could not read that piece.')
        setStage('viewfinder')
      })
    } else if (door === 'paste') {
      window.setTimeout(() => pasteRef.current?.focus(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, location.state])

  async function choose(index: number) {
    if (!detected || busy) return
    setBusy(true)
    setStage('reading')
    try {
      let item: WardrobeItem | null = null
      try {
        item = (await chooseGarment(detected.parentId, index)).item
      } catch (err) {
        // The chooser endpoint may not be there yet; the row for that garment is.
        item = detected.items[index] ?? null
        if (!item) throw err
      }
      setDetected(null)
      setPiece(item)
      await read(item.id)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not pick that one.')
      setStage('choose')
    } finally {
      setBusy(false)
    }
  }

  /** Send only what changed; the shop's store and price are never wiped by omission. */
  function changedFacts(): CandidateEdit {
    const edits: CandidateEdit = {}
    if (!piece) return edits
    const s = store.trim()
    if (s && s !== (piece.store ?? '')) edits.store = s
    const p = price ? Number(price) : null
    if (p != null && p !== piece.seenPrice) edits.seenPrice = p
    return edits
  }

  async function keep() {
    if (!piece) return
    setBusy(true)
    try {
      const edits: CandidateEdit = { ...changedFacts(), nudgeIn: nudge }
      if (nudge === 'never') edits.nudgeAt = null
      await updateCandidate(piece.id, edits)
      setStage('kept')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not keep that.')
    } finally {
      setBusy(false)
    }
  }
  async function pass() {
    if (!piece) return
    setBusy(true)
    try {
      await deleteWardrobeItem(piece.id)
      flash('Passed. Nothing kept.')
      reset()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not let that go.')
    } finally {
      setBusy(false)
    }
  }
  async function bought() {
    if (!piece) return
    setBusy(true)
    try {
      await updateCandidate(piece.id, { ...changedFacts(), owned: true })
      setStage('bought')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not move it in.')
    } finally {
      setBusy(false)
    }
  }
  /** "Try again" after a failed read: the same candidate, read again. */
  async function tryAgain() {
    if (!piece) {
      if (linkUrl) return void startLink(linkUrl)
      return reset()
    }
    setBusy(true)
    setStage('reading')
    try {
      // A link is read again from the shop; a photo is read again from the photo.
      const { item } = piece.sourceUrl || piece.canonicalUrl ? await rereadCandidate(piece.id) : await recatalogWardrobeItem(piece.id)
      setPiece(item)
      await read(item.id)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read it again.')
      setStage('failed')
    } finally {
      setBusy(false)
    }
  }

  async function seeItOnYou() {
    if (!piece || tryOn.status === 'rendering') return
    setTryOn({ status: 'rendering' })
    try {
      const r = await candidateTryOn(piece.id)
      if (!r.ok) {
        setTryOn({ status: 'no-reflection' })
        return
      }
      if (r.tryOn.status === 'ready' && r.tryOn.imageUrl) {
        setTryOn({ status: 'ready', url: r.tryOn.imageUrl, render: r.tryOn as TryOn })
        return
      }
      for (let i = 0; i < 60 && alive.current; i++) {
        await sleep(3000)
        try {
          const { tryOn: t } = await getTryOn(r.tryOn.id)
          if (t.status === 'ready' && t.imageUrl) {
            setTryOn({ status: 'ready', url: t.imageUrl, render: t })
            setPiece((p) => (p ? { ...p, tryOnUrl: t.imageUrl } : p))
            return
          }
          if (t.status === 'failed') {
            setTryOn({ status: 'failed' })
            return
          }
        } catch {
          /* keep polling */
        }
      }
      setTryOn({ status: 'failed' })
    } catch (err) {
      flash(err instanceof Error ? err.message : 'The Mirror is out for a moment.')
      setTryOn({ status: 'idle' })
    }
  }

  function reset() {
    setStage('viewfinder')
    setPreview(null)
    setPiece(null)
    setVerdict(null)
    setStore('')
    setPrice('')
    setLinkUrl(null)
    setLinkRead(null)
    setFailure(null)
    setDetected(null)
    setTryOn({ status: 'idle' })
    setEventTab('all')
  }

  const label = candidateLabel(piece)
  const v = verdict?.status === 'ready' ? verdict : null
  const v2 = v?.v2 ?? null
  const fromShop = Boolean(piece?.retailer || piece?.sourceUrl)
  const shownPrice = piece ? candidatePrice(piece) : null
  const priceLine = v2?.money.price != null ? money(v2.money.price, { currency: v2.money.currency ?? undefined }) : shownPrice ? money(shownPrice.amount, { currency: shownPrice.currency ?? undefined }) : null
  const priceDate = asOf(v2?.money.asOf ?? piece?.lastCheckedAt ?? piece?.seenAt)
  const eventTypes = v2?.eventTypes?.filter(Boolean) ?? []
  // Which closet facts the stylist's own lines already state.
  const closetText = (v2?.closet.lines ?? []).map((l) => l.line.toLowerCase()).join(' ')
  const closetSaid = {
    pairs: v2 ? closetText.includes(`pairs with ${v2.closet.pairs}`) || closetText.includes(`goes with ${v2.closet.pairs}`) : false,
    closest: v2?.closet.closest ? closetText.includes(v2.closet.closest.label.toLowerCase()) || closetText.includes('closest') : false,
    unlock: v2?.closet.unlock ? closetText.includes(v2.closet.unlock.slot.toLowerCase().replace(/s$/, '')) || closetText.includes('unlock') || closetText.includes('take it to') : false,
  }
  const boards = (v?.outfits ?? []).filter((o) => eventTab === 'all' || !o.eventType || o.eventType === eventTab).slice(0, 3)

  return (
    <PageShell narrow>
      <Toast msg={toast} />
      <input
        ref={screenshot}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void onFile(f, 'screenshot')
        }}
        className="hidden"
      />

      {/* Viewfinder: the three doors */}
      {stage === 'viewfinder' && (
        <div className="animate-rise">
          <Eyebrow>In the store</Eyebrow>
          <h1 className="page-title mt-2">
            Ask the closet <em className="text-brass-ink">first.</em>
          </h1>
          <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-ink/55">A link from any shop, a photo of the piece, or a screenshot. Your closet answers in a moment: whether to buy it, whether you’d wear it, whether it suits you.</p>
          <PasteField ref={pasteRef} onUrl={(u) => void startLink(u)} className="mt-6 max-w-xl" />
          <StoreDoors className="mt-4 max-w-xl" onFile={(f, s) => void onFile(f, s)} onPasteDoor={() => pasteRef.current?.focus()} />
          <div className="action-row mt-6">
            <button type="button" onClick={() => navigate('/closet/wishlist')} className="btn-quiet">
              The wishlist
            </button>
            <button type="button" onClick={() => navigate('/closet')} className="btn-quiet">
              Back to the closet
            </button>
          </div>
          <ol className="mt-10 max-w-md space-y-4 border-t border-ink/10 pt-6 text-sm text-ink/60">
            <li className="flex gap-3">
              <span className="w-5 shrink-0 font-display text-base text-brass-ink">1</span>
              <span>
                <b className="font-semibold text-ink">One link or one shot.</b> The same reading that catalogues your closet reads the piece: colour, cut, warmth, and what the shop says it costs.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 shrink-0 font-display text-base text-brass-ink">2</span>
              <span>
                <b className="font-semibold text-ink">The closet answers.</b> How many outfits it makes, whether you own one already, how it sits with your taste and your build, and what each wear would cost.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 shrink-0 font-display text-base text-brass-ink">3</span>
              <span>
                <b className="font-semibold text-ink">Keep it in mind, pass, or buy.</b> A kept piece waits on your wishlist with its link and price. If it would fill a gap in your closet, the Closet says so.
              </span>
            </li>
          </ol>
        </div>
      )}

      {/* Reading: a photo developing, or a product card filling in */}
      {stage === 'reading' && (
        <div className="animate-rise">
          <Eyebrow>In the store</Eyebrow>
          <h1 className="page-title mt-2">Reading the piece…</h1>
          <p className="mt-3 font-display text-lg italic text-ink/60" aria-live="polite">
            {(linkUrl ? LINK_LINES : READING_LINES)[line]}
          </p>
          {linkUrl ? (
            <div className="card mt-8 grid grid-cols-[112px_1fr] gap-5 p-4" aria-busy={!linkRead}>
              <Arch aspect="aspect-[3/4]" className={linkRead?.images?.[0] ? 'arch-photo' : ''}>
                {linkRead?.images?.[0] ? (
                  <img src={linkRead.images[0]} alt="" className="relative z-[1] h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="animate-filament absolute left-1/2 top-0 z-[2] h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brass/70 to-transparent" />
                )}
              </Arch>
              <div className="min-w-0">
                {linkRead ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">{[linkRead.retailer, linkRead.brand].filter(Boolean).join(' · ')}</p>
                    <p className="mt-1 font-display text-xl font-medium leading-tight text-ink">{linkRead.productName ?? 'The piece'}</p>
                    {(linkRead.salePrice ?? linkRead.price) != null && (
                      <p className="mt-2 text-sm text-ink [font-variant-numeric:tabular-nums]">
                        <b className="text-brass-ink">{money((linkRead.salePrice ?? linkRead.price)!, { currency: linkRead.currency ?? undefined })}</b>
                        {linkRead.salePrice != null && linkRead.price != null && linkRead.price > linkRead.salePrice && <span className="ml-2 text-ink/45 line-through">{money(linkRead.price, { currency: linkRead.currency ?? undefined })}</span>}
                        <span className="ml-2 text-xs text-ink/50">{asOf(linkRead.asOf) ?? ''}</span>
                      </p>
                    )}
                    {(linkRead.chosenColour || linkRead.chosenSize) && <p className="mt-1 text-xs text-ink/55">{[linkRead.chosenColour, linkRead.chosenSize ? `size ${linkRead.chosenSize}` : null].filter(Boolean).join(' · ')}</p>}
                  </>
                ) : (
                  <>
                    <SkeletonBlock className="h-3 w-24" />
                    <SkeletonBlock className="mt-3 h-6 w-3/4" />
                    <SkeletonBlock className="mt-3 h-4 w-1/3" />
                    <SkeletonBlock className="mt-2 h-3 w-1/2 !bg-ink/[0.07]" />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-8 max-w-[320px]">
              <Arch aspect="aspect-[3/4]">
                {preview ? <img src={preview} alt="" className="relative z-[1] h-full w-full object-cover opacity-60 blur-[1px]" /> : piece ? <img src={resolveImageUrl(piece.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[7%] opacity-60" /> : null}
                <span className="animate-filament absolute left-1/2 top-0 z-[2] h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brass/70 to-transparent" />
                <span className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--text-in-niche)]">developing</span>
              </Arch>
            </div>
          )}
        </div>
      )}

      {/* The link would not read: the honest line, and the screenshot door right there */}
      {stage === 'link-failed' && (
        <div className="animate-rise">
          <Eyebrow>In the store</Eyebrow>
          <h1 className="page-title mt-2">That one didn’t open.</h1>
          <p className="mt-3 max-w-[30rem] font-display text-lg italic leading-snug text-ink/70">{readFailureLine(failure?.reason)}</p>
          {failure?.retailer && <p className="mt-2 text-xs text-ink/45">{failure.retailer}</p>}
          <div className="action-row mt-6">
            <button type="button" onClick={() => screenshot.current?.click()} className="btn-primary">
              Send a screenshot
            </button>
            {failure?.reason === 'not-product' ? (
              <button type="button" onClick={reset} className="btn-ghost">
                Try another link
              </button>
            ) : (
              <button type="button" onClick={() => linkUrl && void startLink(linkUrl)} className="btn-ghost">
                Try the link again
              </button>
            )}
            <button type="button" onClick={reset} className="btn-quiet">
              Start over
            </button>
          </div>
        </div>
      )}

      {/* Several pieces in one photo: which one did you mean? */}
      {stage === 'choose' && detected && (
        <div className="animate-rise">
          <Eyebrow>In the store</Eyebrow>
          <h1 className="page-title mt-2">
            Which one did <em className="text-brass-ink">you mean?</em>
          </h1>
          <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-ink/55">I found {detected.options.length} pieces in that photo. Only the one you pick is kept.</p>
          {detected.options.some((o) => o.imageUrl) ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {detected.options.map((o, i) => (
                <button key={o.index ?? i} type="button" disabled={busy} onClick={() => void choose(o.index ?? i)} className="press block text-left">
                  <Arch aspect="aspect-[5/6]">
                    {o.imageUrl ? <img src={resolveImageUrl(o.imageUrl)} alt={o.label ?? ''} className="relative z-[1] h-full w-full object-contain p-[7%]" /> : <span className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 font-display text-3xl text-[var(--text-in-niche)]">{i + 1}</span>}
                  </Arch>
                  <p className="mt-2 truncate px-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/75">{o.label ?? o.category ?? `Piece ${i + 1}`}</p>
                </button>
              ))}
            </div>
          ) : (
            <ol className="mt-6 max-w-md divide-y divide-ink/10 border-y border-ink/10">
              {detected.options.map((o, i) => (
                <li key={o.index ?? i}>
                  <button type="button" disabled={busy} onClick={() => void choose(o.index ?? i)} className="press flex h-11 w-full items-center gap-4 text-left text-sm text-ink hover:text-brass-ink">
                    <span className="w-5 font-display text-base text-brass-ink">{i + 1}</span>
                    <span>{o.label ?? o.category ?? `Piece ${i + 1}`}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="action-row mt-6">
            <button type="button" onClick={reset} className="btn-quiet">
              None of these
            </button>
          </div>
        </div>
      )}

      {/* Failed */}
      {stage === 'failed' && (
        <div className="animate-rise">
          <Eyebrow>In the store</Eyebrow>
          <h1 className="page-title mt-2">That one didn’t read.</h1>
          <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-ink/55">{linkUrl ? 'The page opened but the piece would not read. Try again, or send a screenshot of it.' : 'Try a shot with the whole piece in frame, on a plain background if you can.'}</p>
          <div className="action-row mt-6">
            <button type="button" disabled={busy} onClick={() => void tryAgain()} className="btn-primary">
              Try again
            </button>
            <button type="button" onClick={() => screenshot.current?.click()} className="btn-ghost">
              Send a screenshot
            </button>
            <button type="button" disabled={busy} onClick={() => (piece ? void pass() : reset())} className="btn-quiet">
              Start over
            </button>
          </div>
        </div>
      )}

      {/* Verdict */}
      {stage === 'verdict' && v && piece && (
        <div>
          <Eyebrow className="animate-rise">{[piece.retailer, label].filter(Boolean).join(' · ')}</Eyebrow>
          {v2 ? (
            <>
              <h1 className="page-title mt-2 animate-rise-1">
                {headlineFor(v2.headline).lead} <em className="text-brass-ink">{headlineFor(v2.headline).em}</em>
              </h1>
              {v2.line && <p className="mt-3 max-w-[32rem] animate-rise-1 font-display text-lg italic leading-snug text-ink/70">{v2.line}</p>}
            </>
          ) : (
            <h1 className="page-title mt-2 animate-rise-1">
              {v.verdict.outfits >= 3 ? (
                <>
                  It <em className="text-brass-ink">earns its place.</em>
                </>
              ) : v.verdict.outfits > 0 ? (
                <>
                  It <em className="text-brass-ink">could work.</em>
                </>
              ) : (
                <>
                  Not <em className="text-brass-ink">yet.</em>
                </>
              )}
            </h1>
          )}

          {/* Climate: a flag is a warning above everything it concerns; a note stays a quiet line */}
          {v2?.climate?.lines?.length ? (
            <div className="mt-5 flex animate-rise-2 flex-col gap-2">
              {v2.climate.lines.map((l, i) =>
                l.tone === 'flag' ? (
                  <Alert key={i} tone="warning">
                    {l.line}
                  </Alert>
                ) : (
                  <p key={i} className={`text-sm ${toneClass(l.tone)}`}>
                    {l.line}
                  </p>
                ),
              )}
            </div>
          ) : null}

          {/* The verdict: outfits, with boards */}
          <div className="mt-6 animate-rise-2">
            <Plaque label="The verdict" value={<CountUp to={v.verdict.outfits} />} note={`outfit${v.verdict.outfits === 1 ? '' : 's'} with what you own`}>
              {eventTypes.length > 1 && (
                <Tabs
                  className="mt-3"
                  label="Outfits by occasion"
                  value={eventTab}
                  onChange={setEventTab}
                  items={[{ key: 'all', label: 'All' }, ...eventTypes.map((e) => ({ key: e, label: eventLabel(e) }))]}
                />
              )}
              {eventTypes.length === 1 && <p className="mt-2 text-xs text-ink/45">Checked for {eventLabel(eventTypes[0]).toLowerCase()}.</p>}
              <div className="mt-4 grid grid-cols-[88px_1fr] gap-4">
                <Arch aspect="aspect-[5/6]">
                  <img src={resolveImageUrl(piece.imageUrl)} alt={label} className="relative z-[1] h-full w-full object-contain p-[7%]" />
                </Arch>
                <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {boards.map((o, i) => (
                    <div key={i} className="w-[200px] flex-none">
                      <LookBoard items={[...o.items, piece]} />
                      {o.eventType && eventTab === 'all' && <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">{eventLabel(o.eventType)}</p>}
                    </div>
                  ))}
                  {boards.length === 0 && <p className="self-center font-display text-base italic text-ink/50">No complete outfit yet.</p>}
                </div>
              </div>
              {!v2 && (
                <p className="mt-3 text-sm text-ink/60">
                  Pairs with <b className="text-ink">{v.verdict.pairs} of your {v.verdict.closetSize}</b> pieces.
                  {v.verdict.outfits === 0 && v.verdict.closetSize > 0 && ' The closet needs a bottom or shoes that meet it halfway.'}
                </p>
              )}
            </Plaque>
          </div>

          {v2 ? (
            <div className="mt-4 grid animate-rise-3 gap-4">
              {/* Your closet: pairs, the closest thing you own, what it unlocks */}
              <Plaque label="Your closet">
                {/* The stylist's lines carry the facts; the composed sentences only
                    stand in when a line is missing, so nothing is said twice. */}
                {closetSaid.pairs ? null : (
                  <p className="mt-1 text-sm text-ink">
                    Pairs with <b>{v2.closet.pairs} of your {v2.closet.closetSize}</b> pieces.
                  </p>
                )}
                {v2.closet.closest && !closetSaid.closest && (
                  <p className="mt-1 text-sm text-ink">
                    Closest thing you own: the {v2.closet.closest.label}
                    {v2.closet.closest.wears > 0 ? `, worn ${v2.closet.closest.wears}×` : ', never worn'}.{' '}
                    <span className={v2.closet.duplicate ? toneClass('flag') : 'text-ink/55'}>{v2.closet.duplicate ? 'Close to a duplicate.' : 'Not a duplicate.'}</span>
                  </p>
                )}
                {v2.closet.unlock && !closetSaid.unlock && (
                  <p className="mt-1 text-sm text-ink/60">
                    A {[v2.closet.unlock.colour, v2.closet.unlock.formality, v2.closet.unlock.slot].filter(Boolean).join(' ')} alongside it would unlock {v2.closet.unlock.gain} more.
                  </p>
                )}
                <Lines lines={v2.closet.lines} className="mt-1" />
              </Plaque>

              {/* The money */}
              <Plaque label="The money" value={priceLine ?? undefined} note={priceLine ? priceDate ?? undefined : undefined}>
                {!priceLine && <p className="mt-1 font-display text-lg italic text-ink/55">The shop didn’t say what it costs.</p>}
                <p className="mt-2 text-sm text-ink/60">
                  {v2.money.budget === 'within' ? 'Inside how you shop.' : v2.money.budget === 'above' ? 'A step above how you usually shop.' : v2.money.budget === 'far' ? 'Well above how you usually shop.' : ''}
                  {v2.money.costPerWear != null && (
                    <>
                      {' '}
                      About <b className="text-ink [font-variant-numeric:tabular-nums]">{money(v2.money.costPerWear, { currency: v2.money.currency ?? undefined, digits: v2.money.costPerWear < 10 ? 1 : 0 })} a wear</b>
                      {v2.money.projectedWearsPerYear != null ? `, on ${v2.money.projectedWearsPerYear} wears a year.` : '.'}
                    </>
                  )}
                </p>
                <Lines lines={v2.money.lines} className="mt-2" />
              </Plaque>

              {/* Your build */}
              {v2.build && (v2.build.lines?.length || v2.build.flags?.length) ? (
                <Plaque label="Your build">
                  <Lines lines={v2.build.lines} className="mt-1" />
                  {v2.build.flags?.length ? <p className="mt-2 text-xs text-ink/45">{v2.build.flags.join(' · ')}</p> : null}
                </Plaque>
              ) : null}

              {/* Your taste */}
              {v2.taste && v2.taste.lines?.length ? (
                <Plaque label="Your taste">
                  <Lines lines={v2.taste.lines} className="mt-1" />
                </Plaque>
              ) : null}
            </div>
          ) : (
            (v.closest || v.unlockLine) && (
              <Plaque className="mt-4 animate-rise-3" label="Your closet">
                {v.closest && (
                  <p className="mt-1 text-sm text-ink">
                    Closest thing you own: the {[v.closest.item.primaryColor, v.closest.item.subtype ?? v.closest.item.category].filter(Boolean).join(' ')}
                    {v.closest.wears > 0 ? `, worn ${v.closest.wears}×` : ', never worn'}.{' '}
                    <span className="text-ink/55">{v.closest.likeness >= 6 ? 'Close to a duplicate.' : 'Not a duplicate.'}</span>
                  </p>
                )}
                {v.unlockLine && <p className={`${v.closest ? 'mt-1.5' : 'mt-1'} text-sm text-ink/60`}>{v.unlockLine}</p>}
              </Plaque>
            )
          )}

          {/* On you */}
          <section className="mt-8 animate-rise-3 border-t border-ink/10 pt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">On you</p>
            {tryOn.status === 'idle' && (
              <div className="action-row mt-3">
                <button type="button" onClick={() => void seeItOnYou()} className="btn-primary">
                  See it on you
                </button>
                <span className="text-xs text-ink/45">One render from your meter.</span>
              </div>
            )}
            {tryOn.status === 'no-reflection' && (
              <p className="mt-3 text-sm text-ink/60">
                Add your reflection first.{' '}
                <Link to="/mirror" className="btn-quiet btn-quiet-sm">
                  Open the Mirror
                </Link>
              </p>
            )}
            {tryOn.status === 'failed' && (
              <div className="action-row mt-3">
                <p className="text-sm text-ink/60">That one didn’t take. Nothing was charged.</p>
                <button type="button" onClick={() => void seeItOnYou()} className="btn-quiet btn-quiet-sm">
                  Try again
                </button>
              </div>
            )}
            {(tryOn.status === 'rendering' || tryOn.status === 'ready') && (
              <div className="mt-4 max-w-[300px]">
                <MirrorFrame>
                  {tryOn.status === 'rendering' ? (
                    <div className="relative flex aspect-[2/3] flex-col items-center justify-center gap-4 p-6 text-center">
                      <span className="animate-filament absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brass/60 to-transparent" />
                      <p key={dressLine} className="relative animate-rise font-display text-base italic text-[#ECE5D8]/80">
                        {DRESSING_LINES[dressLine]}
                      </p>
                    </div>
                  ) : (
                    <img src={resolveImageUrl(tryOn.url!)} alt="You, in the piece" className="aspect-[2/3] w-full object-cover animate-mirror-reveal" />
                  )}
                </MirrorFrame>
                {tryOn.status === 'ready' && (
                  <>
                    {tryOn.render && fidelityLine(tryOn.render) && <p className="mt-2 text-xs text-ink/50">{fidelityLine(tryOn.render)}</p>}
                    <div className="action-row mt-2">
                      <button type="button" onClick={() => void seeItOnYou()} className="btn-quiet btn-quiet-sm">
                        Try again
                      </button>
                      <Link to="/mirror" className="btn-quiet btn-quiet-sm">
                        The Mirror
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Where and how much: only for a piece the shop didn't tell us about */}
          {!fromShop && (
            <div className="mt-8 grid animate-rise-3 grid-cols-[1fr_120px] gap-2">
              <input value={store} onChange={(e) => setStore(e.target.value)} className="field" placeholder={piece.store ? `Seen at ${piece.store}` : 'Where you saw it (optional)'} />
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className="field" placeholder={piece.seenPrice != null ? money(piece.seenPrice) : `${currencySymbol()} price`} />
            </div>
          )}

          <div className={`action-row ${fromShop ? 'mt-8' : 'mt-4'} animate-rise-3`}>
            <button type="button" disabled={busy} onClick={() => void keep()} className="btn-primary">
              Keep in mind
            </button>
            <button type="button" disabled={busy} onClick={() => void pass()} className="btn-ghost">
              Pass
            </button>
            <button type="button" disabled={busy} onClick={() => void bought()} className="btn-quiet ml-auto">
              I’m buying it
            </button>
          </div>
          <div className="mt-3 flex animate-rise-3 flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-ink/50">If I keep it, nudge me in</span>
            {(
              [
                ['fortnight', 'a fortnight'],
                ['month', 'a month'],
                ['never', 'never'],
              ] as [NudgeIn, string][]
            ).map(([k, l]) => (
              <Chip key={k} on={nudge === k} onClick={() => setNudge(k)}>
                {l}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Kept */}
      {stage === 'kept' && piece && (
        <div className="animate-rise">
          <Eyebrow>Wishlist</Eyebrow>
          <h1 className="page-title mt-2">
            Kept <em className="text-brass-ink">in mind.</em>
          </h1>
          <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-ink/55">
            The {label} is in your wishlist with its verdict
            {priceLine ? `, ${priceLine}` : ''}
            {piece.retailer ? `, at ${piece.retailer}` : store.trim() ? `, seen at ${store.trim()}` : ''}. If it would fill a gap in your closet, the Closet says so.
            {nudge !== 'never' && ` I’ll nudge you in ${nudge === 'fortnight' ? 'a fortnight' : 'a month'}.`}
          </p>
          <div className="action-row mt-6">
            <button type="button" onClick={reset} className="btn-primary">
              Ask about another
            </button>
            <button type="button" onClick={() => navigate('/closet/wishlist')} className="btn-ghost">
              See the wishlist
            </button>
          </div>
        </div>
      )}

      {/* Bought */}
      {stage === 'bought' && piece && (
        <div className="animate-rise">
          <Eyebrow>Closet · Pieces</Eyebrow>
          <h1 className="page-title mt-2">
            In the <em className="text-brass-ink">closet.</em>
          </h1>
          <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-ink/55">The {label} is a piece now, with its price and where it came from. Its outfits are in the Outfits room, and tomorrow’s brief already knows it’s there.</p>
          <div className="action-row mt-6">
            <button type="button" onClick={() => navigate(`/closet/compose?pin=${piece.id}`)} className="btn-primary">
              Wear it first with…
            </button>
            <button type="button" onClick={() => navigate('/closet')} className="btn-ghost">
              Back to the closet
            </button>
            <button type="button" onClick={reset} className="btn-quiet">
              Ask about another
            </button>
          </div>
        </div>
      )}
    </PageShell>
  )
}
