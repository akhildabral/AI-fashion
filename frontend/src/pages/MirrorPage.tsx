import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, resolveImageUrl } from '../lib/api'
import { deleteReflection, deleteTryOn, getTryOn, getTryOns, getPhoto, getUsage, reportTryOn, retryTryOn, uploadPhoto, usePhoto, type UsageSummary } from '../lib/tryon'
import { setLookPhotoFromRender } from '../lib/circle'
import { ShareButton } from '../components/ShareButton'
import { getWardrobe, tryOnWardrobeOutfit } from '../lib/wardrobe'
import { getBriefAlternatives, planDay, shiftKey, todayKey, createLookbook, getLookbooks, toggleLookbookItem, deleteLookbook, type Lookbook, type BriefItem } from '../lib/brief'
import { logWear } from '../lib/wearlog'
import { saveOutfit } from '../lib/outfits'
import type { Reflection, TryOn, WardrobeItem } from '../lib/types'
import { Spinner } from '../components/Spinner'
import { MirrorFrame, Modal, Toast, useFlash } from '../components/ui'

// The Mirror, as a fitting room. The glass in the centre; under it the rail —
// the pieces on you, each a switch — and the meter; after a render, the
// decision. Nothing renders until you tap. A render is a job the glass
// polls; the same pieces on the same photo come back instantly and free.

const DRESSING_LINES = ['Taking your measure…', 'Cutting the pieces…', 'Fitting the shoulders…', 'Setting the light…', 'Checking the proportions…']
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

type Piece = Pick<WardrobeItem, 'id' | 'imageUrl' | 'category' | 'subtype'>

function label(p: { category: string; subtype: string | null }) {
  return p.subtype ?? p.category
}

export function MirrorPage() {
  usePageTitle('Mirror')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast, flash } = useFlash()

  // ---- the closet, the rail ----
  const [closet, setCloset] = useState<Piece[] | null>(null)
  const [rail, setRail] = useState<{ id: string; on: boolean }[]>([])
  const [swapFor, setSwapFor] = useState<Piece | null>(null)
  const [alternatives, setAlternatives] = useState<BriefItem[] | null>(null)

  // ---- the glass ----
  const [tryOns, setTryOns] = useState<TryOn[] | null>(null)
  const [current, setCurrent] = useState<TryOn | null>(null)
  const [fresh, setFresh] = useState(false)
  const [dressLine, setDressLine] = useState(0)
  const [split, setSplit] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const pollRef = useRef<number | null>(null)

  // ---- after ----
  const [shareFor, setShareFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [decided, setDecided] = useState<Record<string, string>>({})

  // ---- compare ----
  const [compareMode, setCompareMode] = useState(false)
  const [compare, setCompare] = useState<string[]>([])
  const [pollBusy, setPollBusy] = useState(false)

  // ---- the photo door ----
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Reflection[]>([])
  const [photoMax, setPhotoMax] = useState(3)
  const [photoChecked, setPhotoChecked] = useState(false)
  const [photoModal, setPhotoModal] = useState(false)
  const [consent, setConsent] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  // ---- lookbooks ----
  const [lookbooks, setLookbooks] = useState<Lookbook[]>([])
  const [activeBook, setActiveBook] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [newBookName, setNewBookName] = useState('')

  const rendering = current?.status === 'queued' || current?.status === 'rendering'
  const ready = current?.status === 'ready' || (current && !current.status)

  const loadAll = useCallback(() => {
    getTryOns()
      .then(({ tryOns: t }) => setTryOns(t ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the mirror.'))
    getUsage().then(setUsage).catch(() => undefined)
  }, [])

  useEffect(() => {
    loadAll()
    getLookbooks().then((r) => setLookbooks(r.lookbooks)).catch(() => undefined)
    getWardrobe().then((r) => setCloset(r.items.filter((i) => i.status === 'ready'))).catch(() => setCloset([]))
    getPhoto()
      .then((r) => {
        setPhotoUrl(r.photoUrl)
        setPhotos(r.photos ?? [])
        if (r.max) setPhotoMax(r.max)
      })
      .catch(() => undefined)
      .finally(() => setPhotoChecked(true))
  }, [loadAll])

  // Arriving with pieces stages them on the rail. Nothing renders until you tap.
  const itemsParam = params.get('items')
  const renderParam = params.get('render')
  useEffect(() => {
    if (itemsParam) {
      const ids = itemsParam.split(',').filter(Boolean)
      setRail(ids.map((id) => ({ id, on: true })))
      const share = params.get('share')
      if (share) setShareFor(share)
      setParams({}, { replace: true })
    } else if (renderParam) {
      getTryOn(renderParam)
        .then(({ tryOn }) => {
          setCurrent(tryOn)
          if (tryOn.itemIds?.length) setRail(tryOn.itemIds.map((id) => ({ id, on: true })))
        })
        .catch(() => undefined)
      setParams({}, { replace: true })
    }
  }, [itemsParam, renderParam, params, setParams])

  // The latest render is staged when you come back with nothing in hand.
  useEffect(() => {
    if (current || itemsParam || renderParam || !tryOns || tryOns.length === 0) return
    const last = tryOns.find((t) => !t.status || t.status === 'ready')
    if (last) {
      setCurrent(last)
      if (rail.length === 0 && last.itemIds?.length) setRail(last.itemIds.map((id) => ({ id, on: true })))
    }
  }, [tryOns, current, itemsParam, renderParam, rail.length])

  // The atelier lines while a render is a job.
  useEffect(() => {
    if (!rendering) return
    setDressLine(0)
    const id = window.setInterval(() => setDressLine((n) => (n + 1) % DRESSING_LINES.length), 3200)
    return () => window.clearInterval(id)
  }, [rendering])

  // Poll a job until it lands.
  useEffect(() => {
    if (pollRef.current) window.clearInterval(pollRef.current)
    if (!rendering || !current) return
    const id = current.id
    pollRef.current = window.setInterval(() => {
      getTryOn(id)
        .then(({ tryOn }) => {
          if (tryOn.status === 'ready') {
            setCurrent(tryOn)
            setFresh(true)
            setSplit(0)
            setTryOns((prev) => [tryOn, ...(prev ?? []).filter((t) => t.id !== tryOn.id)])
            getUsage().then(setUsage).catch(() => undefined)
          } else if (tryOn.status === 'failed') {
            setCurrent(tryOn)
            setError(tryOn.error ?? 'The render failed. Nothing was charged.')
            getUsage().then(setUsage).catch(() => undefined)
          }
        })
        .catch(() => undefined)
    }, 2500)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [rendering, current])

  const byId = useMemo(() => new Map((closet ?? []).map((i) => [i.id, i])), [closet])
  const railPieces = rail.map((r) => ({ ...r, piece: byId.get(r.id) })).filter((r) => r.piece) as { id: string; on: boolean; piece: Piece }[]
  const chosen = railPieces.filter((r) => r.on).map((r) => r.id)
  const meter = usage?.usage.tryons
  const left = meter ? Math.max(0, meter.limit - meter.used) : null
  const out = left === 0

  async function fire(freshRender = false) {
    if (chosen.length === 0) return
    if (!photoUrl) {
      setPhotoModal(true)
      return
    }
    setError(null)
    setBusy('render')
    try {
      const r = await tryOnWardrobeOutfit(chosen, freshRender)
      setCurrent(r.tryOn)
      setFresh(Boolean(r.cached))
      setSplit(0)
      setDecided({})
      if (r.cached) {
        flash('Same pieces, same photo: from the cache, free.')
        setTryOns((prev) => [r.tryOn, ...(prev ?? []).filter((t) => t.id !== r.tryOn.id)])
      }
      getUsage().then(setUsage).catch(() => undefined)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'The render failed.'
      if (/photo/i.test(msg)) setPhotoModal(true)
      else setError(msg)
    } finally {
      setBusy(null)
    }
  }

  async function tryAgain() {
    if (!current) return
    setBusy('retry')
    setError(null)
    try {
      const { tryOn } = await retryTryOn(current.id)
      setCurrent(tryOn)
      setDecided({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not try again.')
    } finally {
      setBusy(null)
    }
  }

  async function notMine() {
    if (!current) return
    setBusy('report')
    try {
      await reportTryOn(current.id)
      flash('Noted, and the render is given back to you.')
      getUsage().then(setUsage).catch(() => undefined)
    } finally {
      setBusy(null)
    }
  }

  // ---- decisions ----
  async function wearIt() {
    if (!current) return
    const ids = current.itemIds?.length ? current.itemIds : chosen
    setBusy('wear')
    try {
      const { log } = await logWear({ itemIds: ids })
      await setLookPhotoFromRender(log.id, current.id).catch(() => undefined)
      if (shareFor) setShareFor(null)
      setDecided((d) => ({ ...d, wear: 'Logged for today, with this as the photo.' }))
      flash('Logged for today. Today knows.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not log that.')
    } finally {
      setBusy(null)
    }
  }
  async function keepOutfit() {
    if (!current) return
    const ids = current.itemIds?.length ? current.itemIds : chosen
    setBusy('keep')
    try {
      await saveOutfit({ itemIds: ids, provenance: 'ai', rationale: 'Kept from the Mirror.' })
      setDecided((d) => ({ ...d, keep: 'Kept · in Outfits' }))
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not keep that.')
    } finally {
      setBusy(null)
    }
  }
  async function tomorrow() {
    if (!current) return
    const ids = current.itemIds?.length ? current.itemIds : chosen
    setBusy('tomorrow')
    try {
      await planDay({ date: shiftKey(todayKey(), 1), itemIds: ids, title: 'Laid out from the Mirror' })
      setDecided((d) => ({ ...d, tomorrow: 'Laid out for tomorrow' }))
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not lay that out.')
    } finally {
      setBusy(null)
    }
  }

  // ---- the rail ----
  function toggle(id: string) {
    setRail((r) => r.map((x) => (x.id === id ? { ...x, on: !x.on } : x)))
  }
  async function openSwap(piece: Piece) {
    setSwapFor(piece)
    setAlternatives(null)
    try {
      const r = await getBriefAlternatives(piece.category, rail.map((x) => x.id))
      setAlternatives(r.alternatives)
    } catch {
      setAlternatives([])
    }
  }
  function swap(inId: string) {
    if (!swapFor) return
    setRail((r) => r.map((x) => (x.id === swapFor.id ? { id: inId, on: true } : x)))
    setSwapFor(null)
  }

  // ---- photo ----
  async function handlePhotoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED.includes(file.type) || file.size > MAX_BYTES) {
      setError('Use a JPG, PNG, or WebP photo up to 10MB.')
      return
    }
    setPhotoBusy(true)
    try {
      const r = await uploadPhoto(file)
      setPhotoUrl(r.photoUrl)
      setPhotos(r.photos ?? [])
      setPhotoModal(false)
      setConsent(false)
      flash(chosen.length ? 'You’re in the mirror. Tap See it on me when you’re ready.' : 'You’re in the mirror.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  // ---- reflections ----
  async function pickPhoto(id: string) {
    try {
      const r = await usePhoto(id)
      setPhotoUrl(r.photoUrl)
      setPhotos(r.photos ?? [])
      setSplit(0)
      flash('That’s the one the Mirror dresses now.')
    } catch {
      flash('Could not switch photos.')
    }
  }
  async function removePhoto(id: string) {
    const p = photos.find((x) => x.id === id)
    if (!p) return
    if (!window.confirm('Delete this photo? Every render made from it goes with it.')) return
    try {
      const r = await deleteReflection(id)
      setPhotoUrl(r.photoUrl)
      setPhotos(r.photos ?? [])
      if (current?.imageUrl && r.removedRenders > 0) setCurrent(null)
      loadAll()
      flash(r.removedRenders ? `Gone, with ${r.removedRenders} render${r.removedRenders === 1 ? '' : 's'}.` : 'Gone.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not delete that photo.')
    }
  }

  // ---- lookbooks ----
  async function handleToggleBook(bookId: string, tryOnId: string) {
    try {
      const { lookbook } = await toggleLookbookItem(bookId, tryOnId)
      setLookbooks((prev) => prev.map((b) => (b.id === lookbook.id ? lookbook : b)))
    } catch {
      flash('Could not update that lookbook.')
    }
  }
  async function handleCreateBook() {
    const name = newBookName.trim()
    if (!name) return
    try {
      const { lookbook } = await createLookbook(name)
      setLookbooks((prev) => [lookbook, ...prev])
      setNewBookName('')
      if (pickerFor) await handleToggleBook(lookbook.id, pickerFor)
    } catch {
      flash('Could not create the lookbook.')
    }
  }
  async function handleDeleteBook(id: string) {
    try {
      await deleteLookbook(id)
      setLookbooks((prev) => prev.filter((b) => b.id !== id))
      if (activeBook === id) setActiveBook(null)
    } catch {
      flash('Could not delete that lookbook.')
    }
  }
  async function handleDelete(id: string) {
    try {
      await deleteTryOn(id)
      setTryOns((prev) => (prev ? prev.filter((t) => t.id !== id) : prev))
      setLookbooks((prev) => prev.map((b) => ({ ...b, tryOnIds: b.tryOnIds.filter((x) => x !== id) })))
      if (current?.id === id) setCurrent(null)
    } catch {
      flash('Could not remove that render.')
    }
  }

  // ---- compare ----
  function toggleCompare(id: string) {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id]))
  }
  const compared = compare.map((id) => (tryOns ?? []).find((t) => t.id === id)).filter((t): t is TryOn => Boolean(t))
  async function askCircle() {
    if (compared.length !== 2) return
    setPollBusy(true)
    try {
      await apiFetch('/polls', { method: 'POST', body: { question: 'Which one should I wear?', imageUrls: compared.map((t) => t.imageUrl), expiresInMinutes: 24 * 60 } })
      flash('It’s with your circle. Share the link anywhere.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the poll.')
    } finally {
      setPollBusy(false)
    }
  }

  const galleryRenders = (tryOns ?? []).filter((t) => {
    if (!activeBook) return true
    const book = lookbooks.find((b) => b.id === activeBook)
    return book ? book.tryOnIds.includes(t.id) : true
  })

  return (
    <div className="relative mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10">
      <Toast msg={toast} />

      <div className="lg:grid lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
        {/* ---------------- The glass ---------------- */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="animate-rise font-display text-sm italic text-brass">{compareMode && compared.length === 2 ? 'Which one?' : rendering ? 'Dressing you' : ready && fresh ? 'Fresh from the stylist' : 'Show yourself'}</p>
          <h1 className="mt-1 animate-rise-1 font-display text-4xl font-medium leading-[1.0] text-ink sm:text-5xl">
            {compareMode && compared.length === 2 ? (
              <>
                A, <em className="text-brass">or B.</em>
              </>
            ) : ready ? (
              <>
                There <em className="text-brass">you are.</em>
              </>
            ) : (
              <>
                The <em className="text-brass">Mirror.</em>
              </>
            )}
          </h1>

          {/* compare: two glasses */}
          {compareMode && compared.length === 2 ? (
            <div className="mt-6 grid grid-cols-2 gap-3 animate-rise-2">
              {compared.map((t, i) => (
                <div key={t.id}>
                  <MirrorFrame>
                    <img src={resolveImageUrl(t.imageUrl)} alt={i === 0 ? 'A' : 'B'} className="aspect-[3/4] w-full object-cover" />
                    <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-[3px] bg-brass text-xs font-bold text-[rgb(26_21_9)]">{i === 0 ? 'A' : 'B'}</span>
                  </MirrorFrame>
                  <p className="mt-2 text-center text-xs text-ink/50">{(t.items ?? []).map(label).join(' · ') || new Date(t.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 animate-rise-2">
              <MirrorFrame>
                {/* still finding out whether there's a photo: the glass keeps its shape */}
                {!rendering && !photoChecked && (
                  <div className="flex aspect-[3/4] items-center justify-center text-[#ECE5D8]/40">
                    <Spinner className="h-5 w-5" />
                  </div>
                )}

                {/* rendering: the figure is being dressed */}
                {rendering && (
                  <div className="relative flex aspect-[3/4] flex-col items-center justify-center gap-5 p-8 text-center">
                    {photoUrl && <img src={resolveImageUrl(photoUrl)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-[2px]" />}
                    <span className="animate-filament absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brass/60 to-transparent" />
                    <p key={dressLine} className="relative animate-rise font-display text-base italic text-[#ECE5D8]/80">
                      {DRESSING_LINES[dressLine]}
                    </p>
                    <p className="relative text-[11px] uppercase tracking-[0.18em] text-[#ECE5D8]/50">Leave if you like; you’ll hear when it’s ready</p>
                  </div>
                )}

                {/* no photo: the door */}
                {!rendering && photoChecked && !photoUrl && (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-4 p-8 text-center">
                    <svg width="52" height="72" viewBox="0 0 52 72" className="text-brass/55" aria-hidden="true">
                      <path d="M4 68V26C4 13.85 13.85 4 26 4s22 9.85 22 22v42" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M14 68V30a12 12 0 0 1 24 0v38" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                    </svg>
                    <p className="font-display text-xl font-medium text-[#ECE5D8]">The mirror is waiting for you.</p>
                    <p className="max-w-[26ch] text-sm text-[#ECE5D8]/60">One clear, full-length photo, and every outfit renders on you.</p>
                    <button type="button" onClick={() => setPhotoModal(true)} className="btn-primary mt-1">
                      Add your photo
                    </button>
                  </div>
                )}

                {/* a render on the glass, with the photo underneath */}
                {!rendering && photoUrl && current && ready && current.imageUrl && (
                  <div className="relative aspect-[3/4] w-full">
                    <img key={current.imageUrl} src={resolveImageUrl(current.imageUrl)} alt="You, in the render" className={`absolute inset-0 h-full w-full object-cover ${fresh ? 'animate-mirror-reveal' : ''}`} />
                    {split > 0 && (
                      <>
                        <img src={resolveImageUrl(photoUrl)} alt="You, before" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
                        <span aria-hidden className="absolute bottom-0 top-0 w-[2px] bg-brass" style={{ left: `${split}%` }} />
                        <span className="absolute left-3 top-3 text-[9px] font-bold uppercase tracking-[0.2em] text-[#ECE5D8]/80">Before</span>
                        <span className="absolute right-3 top-3 text-[9px] font-bold uppercase tracking-[0.2em] text-[#ECE5D8]/80">After</span>
                      </>
                    )}
                  </div>
                )}

                {/* failed */}
                {!rendering && current?.status === 'failed' && (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 p-8 text-center">
                    <p className="font-display text-xl font-medium text-[#ECE5D8]">That one didn’t take.</p>
                    <p className="max-w-[28ch] text-sm text-[#ECE5D8]/60">Nothing was charged. Try again, or change a piece on the rail.</p>
                  </div>
                )}

                {/* a photo, no render yet */}
                {!rendering && photoUrl && (!current || (!ready && current.status !== 'failed')) && (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-4 p-8 text-center">
                    <img src={resolveImageUrl(photoUrl)} alt="You" className="h-28 w-28 rounded-[3px] object-cover opacity-80" />
                    <p className="font-display text-lg font-medium text-[#ECE5D8]">You’re in the mirror.</p>
                    <p className="max-w-[26ch] text-sm text-[#ECE5D8]/60">{chosen.length ? 'The pieces are on the rail. Tap See it on me.' : 'Bring pieces from Today or the Closet, or pick them here.'}</p>
                  </div>
                )}

                {fresh && ready && !rendering && split === 0 && (
                  <span key={`sweep-${current?.imageUrl}`} aria-hidden className="animate-arch-sweep pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(122deg, transparent 45%, rgba(240,226,196,.14) 50%, transparent 55%)' }} />
                )}
              </MirrorFrame>

              {/* before / after */}
              {ready && photoUrl && current?.imageUrl && !rendering && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/40">Before</span>
                  <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Before and after" className="tape flex-1" style={{ ['--p' as string]: `${split}%` }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/40">After</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="alert-error mt-4" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* ---------------- The rail, the meter, the decision ---------------- */}
        <div className="mt-10 lg:mt-0">
          {/* the rail: pieces on you, each a switch */}
          <section>
            <div className="flex h-8 items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">On you</p>
              {rail.length > 0 && (
                <button type="button" onClick={() => setRail([])} className="btn-quiet !h-8 !text-xs">
                  Clear the rail
                </button>
              )}
            </div>
            {rail.length === 0 ? (
              <div className="mt-3 card p-5">
                <p className="font-display text-lg italic text-ink/70">Nothing on the rail yet.</p>
                <p className="mt-1 text-sm text-ink/55">Bring a look from Today or the Closet, or pick pieces from your closet here.</p>
                <div className="action-row mt-4">
                  <button type="button" onClick={() => navigate('/')} className="btn-ghost btn-sm">
                    Today’s look
                  </button>
                  <button type="button" onClick={() => navigate('/closet/outfits')} className="btn-quiet !h-9 !text-xs">
                    Outfits
                  </button>
                </div>
                {closet && closet.length > 0 && (
                  <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {closet.slice(0, 12).map((p) => (
                      <button key={p.id} type="button" onClick={() => setRail((r) => (r.some((x) => x.id === p.id) ? r : [...r, { id: p.id, on: true }]))} className="press text-left" title={label(p)}>
                        <div className="arch-bezel aspect-[5/6] opacity-80 transition hover:opacity-100">
                          <div className="arch-niche h-full w-full">
                            <img src={resolveImageUrl(p.imageUrl)} alt={label(p)} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {railPieces.map(({ id, on, piece }) => (
                  <div key={id}>
                    <button type="button" aria-pressed={on} onClick={() => toggle(id)} className="press block w-full text-left" title={on ? 'Take it off' : 'Put it back'}>
                      <div className={`arch-bezel aspect-[5/6] transition-opacity ${on ? '' : 'opacity-35'}`}>
                        <div className="arch-niche h-full w-full">
                          <img src={resolveImageUrl(piece.imageUrl)} alt={label(piece)} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                        </div>
                      </div>
                      <span className={`mt-1.5 block truncate text-[10px] font-semibold uppercase tracking-[0.12em] ${on ? 'text-ink/60' : 'text-ink/35 line-through'}`}>{label(piece)}</span>
                    </button>
                    <button type="button" onClick={() => void openSwap(piece)} className="btn-quiet !h-7 !px-0 !text-[10px] !uppercase !tracking-[0.12em] !text-brass">
                      Swap
                    </button>
                  </div>
                ))}
                {closet && (
                  <div>
                    <button type="button" onClick={() => setSwapFor({ id: '', imageUrl: '', category: '', subtype: null })} className="press block w-full text-left" title="Add a piece">
                      <div className="arch-bezel aspect-[5/6] opacity-40 transition-opacity hover:opacity-80">
                        <div className="arch-niche flex h-full w-full items-center justify-center">
                          <span className="relative z-[1] font-display text-3xl text-ink/45">+</span>
                        </div>
                      </div>
                      <span className="mt-1.5 block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/40">Add a piece</span>
                    </button>
                    {/* the same row the others give to Swap, so the tiles sit level */}
                    <span aria-hidden className="block h-7" />
                  </div>
                )}
              </div>
            )}

            {/* the button, then the meter as a hint line beneath it (never beside, never wrapping) */}
            <div className="action-row mt-6">
              <button type="button" disabled={chosen.length === 0 || rendering || busy === 'render' || out} onClick={() => void fire(false)} className="btn-primary">
                {busy === 'render' ? 'Starting…' : rendering ? 'Rendering…' : `See it on me${left != null && !out ? ' · 1 render' : ''}`}
              </button>
            </div>
            <div>
              {meter && (
                <p className="mt-2 text-xs text-ink/50">
                  {out ? (
                    <>
                      <b className="text-ink">No renders left</b> on the {usage?.label ?? 'free'} plan.{' '}
                      <button type="button" onClick={() => navigate('/billing')} className="font-semibold text-brass underline-offset-4 hover:underline">
                        See plans
                      </button>
                    </>
                  ) : (
                    <>
                      <b className="text-brass">{left} of {meter.limit}</b> left{usage?.lifetime ? '' : ' this month'} · same pieces again is free
                    </>
                  )}
                </p>
              )}
            </div>
          </section>

          {/* your reflections: up to three, one dressed */}
          {photoChecked && (photos.length > 0 || photoUrl) && (
            <section className="mt-8 border-t border-ink/10 pt-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Your reflections</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
              {photos.map((p) => (
                <div key={p.id} className="group relative">
                  <button type="button" onClick={() => void pickPhoto(p.id)} aria-pressed={p.active} title={p.active ? 'The one the Mirror dresses' : 'Dress this one'} className={`press block w-12 overflow-hidden rounded-[3px] border transition-colors ${p.active ? 'border-brass ring-2 ring-brass/30' : 'border-ink/15 opacity-70 hover:opacity-100'}`}>
                    <img src={resolveImageUrl(p.url)} alt="" className="aspect-[3/4] w-full object-cover" />
                  </button>
                  <button type="button" onClick={() => void removePhoto(p.id)} aria-label="Delete this photo and its renders" className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-[3px] bg-ink/80 text-bone group-hover:flex">
                    <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" fill="none" />
                    </svg>
                  </button>
                </div>
              ))}
              {photos.length < photoMax && (
                <button type="button" onClick={() => setPhotoModal(true)} className="flex aspect-[3/4] w-12 items-center justify-center rounded-[3px] border border-dashed border-ink/25 text-ink/40 transition-colors hover:border-brass hover:text-brass" aria-label="Add a photo">
                  +
                </button>
              )}
              </div>
              <p className="mt-2 text-xs text-ink/45">{photos.length < photoMax ? 'Another for winter, a haircut, a different length. The brass one is the one the Mirror dresses.' : 'Three at most. The brass one is the one the Mirror dresses.'}</p>
            </section>
          )}

          {/* the decision */}
          {ready && current && !compareMode && (
            <section className="mt-8 animate-rise border-t border-ink/10 pt-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Then</p>
              {current.items && current.items.length > 0 && <p className="mt-2 text-xs text-ink/50">This render: {current.items.map(label).join(' · ')}</p>}
              <div className="action-row mt-4">
                {decided.wear ? (
                  <span className="inline-flex h-11 items-center rounded-[3px] border border-brass/30 bg-iris-soft px-4 text-sm font-semibold text-brass">Logged for today</span>
                ) : (
                  <button type="button" disabled={busy !== null} onClick={() => void wearIt()} className="btn-primary">
                    {busy === 'wear' ? 'Logging…' : 'Wearing it'}
                  </button>
                )}
                <button type="button" disabled={busy !== null || Boolean(decided.keep)} onClick={() => void keepOutfit()} className="btn-ghost">
                  {decided.keep ?? 'Keep the outfit'}
                </button>
                <button type="button" disabled={busy !== null || Boolean(decided.tomorrow)} onClick={() => void tomorrow()} className="btn-quiet">
                  {decided.tomorrow ?? 'Tomorrow'}
                </button>
                <ShareButton target={{ kind: 'render', id: current.id, title: 'Me, in the Mirror', text: 'Rendered on me from my own closet.' }} onDone={(l) => l && flash(l)} />
              </div>
              {shareFor && (
                <div className="action-row mt-3">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setBusy('attach')
                      void setLookPhotoFromRender(shareFor, current.id)
                        .then(() => {
                          setShareFor(null)
                          flash('Shared to your circle, with you in it.')
                          navigate('/circle')
                        })
                        .catch(() => flash('Could not attach the render.'))
                        .finally(() => setBusy(null))
                    }}
                    className="btn-ghost btn-sm"
                  >
                    {busy === 'attach' ? 'Sharing…' : 'Share this to your circle'}
                  </button>
                  <button type="button" onClick={() => setShareFor(null)} className="btn-quiet !h-9 !text-xs">
                    Keep the pieces only
                  </button>
                </div>
              )}
              <div className="action-row mt-2">
                {!current.retryOf ? (
                  <button type="button" disabled={busy !== null} onClick={() => void tryAgain()} className="btn-quiet !h-9 !text-xs">
                    {busy === 'retry' ? 'Starting…' : 'Not right? Try again · free once'}
                  </button>
                ) : (
                  <button type="button" disabled={busy !== null} onClick={() => void fire(true)} className="btn-quiet !h-9 !text-xs">
                    Render fresh · 1 render
                  </button>
                )}
                {!current.reportedAt && (
                  <button type="button" disabled={busy !== null} onClick={() => void notMine()} className="btn-quiet !h-9 !text-xs !text-ink/40">
                    Not my clothes
                  </button>
                )}
              </div>
            </section>
          )}

          {/* compare controls */}
          {compareMode && (
            <section className="mt-8 animate-rise border-t border-ink/10 pt-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Which one?</p>
              <p className="mt-1 text-sm text-ink/55">{compared.length < 2 ? 'Pick two renders below.' : 'Side by side. Still torn? Ask the circle.'}</p>
              <div className="action-row mt-3">
                {compared.length === 2 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrent(compared[0])
                        setCompareMode(false)
                        setCompare([])
                      }}
                      className="btn-primary btn-sm"
                    >
                      A, this one
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrent(compared[1])
                        setCompareMode(false)
                        setCompare([])
                      }}
                      className="btn-ghost btn-sm"
                    >
                      B
                    </button>
                    <button type="button" disabled={pollBusy} onClick={() => void askCircle()} className="btn-quiet !h-9 !text-xs">
                      {pollBusy ? 'Sending…' : 'Ask the circle'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCompareMode(false)
                    setCompare([])
                  }}
                  className="btn-quiet !h-9 !text-xs !text-ink/40"
                >
                  Done
                </button>
              </div>
            </section>
          )}

          {/* ---------------- Renders ---------------- */}
          {photoUrl && (tryOns?.length ?? 0) > 0 && (
            <section className="mt-10 border-t border-ink/10 pt-6">
              {/* label row: the section name left, its one action right; the filters get their own row */}
              <div className="flex h-8 items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Renders</p>
                {(tryOns?.length ?? 0) >= 2 && !compareMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompareMode(true)
                      setCompare([])
                    }}
                    className="btn-ghost btn-sm"
                  >
                    Which one?
                  </button>
                )}
              </div>
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" onClick={() => setActiveBook(null)} aria-pressed={activeBook === null} className="filter press">
                    All<span className="count">{tryOns?.length ?? 0}</span>
                  </button>
                  {lookbooks.map((b) => (
                    <span key={b.id} className="inline-flex items-center">
                      <button type="button" onClick={() => setActiveBook((prev) => (prev === b.id ? null : b.id))} aria-pressed={activeBook === b.id} className="filter press">
                        {b.name}
                        <span className="count">{b.tryOnIds.length}</span>
                      </button>
                      {activeBook === b.id && (
                        <button type="button" aria-label="Delete lookbook" onClick={() => void handleDeleteBook(b.id)} className="ml-1 text-ink/35 hover:text-red-500">
                          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
                          </svg>
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {galleryRenders.map((t) => {
                  const idx = compare.indexOf(t.id)
                  const isCurrent = current?.id === t.id
                  return (
                    <div key={t.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (compareMode) toggleCompare(t.id)
                          else {
                            setCurrent(t)
                            setFresh(false)
                            setSplit(0)
                            setDecided({})
                            if (t.itemIds?.length) setRail(t.itemIds.map((id) => ({ id, on: true })))
                          }
                        }}
                        className={`press block w-full overflow-hidden rounded-[3px] border transition-colors ${idx >= 0 || isCurrent ? 'border-brass ring-2 ring-brass/30' : 'border-ink/12 hover:border-brass/50'}`}
                      >
                        {t.status === 'queued' || t.status === 'rendering' ? (
                          <div className="flex aspect-[3/4] w-full items-center justify-center bg-ink/5 text-ink/40">
                            <Spinner className="h-4 w-4" />
                          </div>
                        ) : (
                          <img src={resolveImageUrl(t.imageUrl)} alt="Try-on render" loading="lazy" className="aspect-[3/4] w-full object-cover" />
                        )}
                      </button>
                      {idx >= 0 && <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-[3px] bg-brass text-xs font-bold text-[rgb(26_21_9)]">{idx === 0 ? 'A' : 'B'}</span>}
                      {!compareMode && (
                        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-90 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                          <button type="button" onClick={() => setPickerFor(t.id)} aria-label="Save to lookbook" className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-ink/70 text-bone hover:bg-ink">
                            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => void handleDelete(t.id)} aria-label="Remove render" className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-ink/70 text-bone hover:bg-ink">
                            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {(t.items?.length ?? 0) > 0 && <p className="mt-1 truncate text-[10px] text-ink/45">{t.items!.map(label).join(' · ')}</p>}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ---- Swap / add a piece ---- */}
      <Modal open={swapFor !== null} onClose={() => setSwapFor(null)} title={swapFor?.id ? `Instead of the ${label(swapFor)}` : 'Add a piece'}>
        {swapFor?.id && alternatives === null && (
          <div className="py-6 text-center text-ink/40">
            <Spinner className="h-5 w-5" />
          </div>
        )}
        {swapFor?.id && alternatives && (
          <>
            {alternatives.length === 0 && <p className="text-sm text-ink/55">Nothing else of that kind is clean right now.</p>}
            <div className="grid grid-cols-3 gap-3">
              {alternatives.map((a) => (
                <button key={a.id} type="button" onClick={() => swap(a.id)} className="press text-left">
                  <div className="arch-bezel aspect-[5/6]">
                    <div className="arch-niche h-full w-full">
                      <img src={resolveImageUrl(a.imageUrl)} alt={label(a)} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                    </div>
                  </div>
                  <span className="mt-1.5 block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/60">{label(a)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {swapFor && !swapFor.id && closet && (
          <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {closet
              .filter((p) => !rail.some((x) => x.id === p.id))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setRail((r) => [...r, { id: p.id, on: true }])
                    setSwapFor(null)
                  }}
                  className="press text-left"
                >
                  <div className="arch-bezel aspect-[5/6]">
                    <div className="arch-niche h-full w-full">
                      <img src={resolveImageUrl(p.imageUrl)} alt={label(p)} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                    </div>
                  </div>
                  <span className="mt-1.5 block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/60">{label(p)}</span>
                </button>
              ))}
          </div>
        )}
      </Modal>

      {/* ---- Photo door ---- */}
      <input ref={cameraRef} type="file" accept="image/*" capture="user" onChange={handlePhotoFile} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoFile} className="hidden" />
      <Modal open={photoModal} onClose={() => setPhotoModal(false)} title="Add your photo">
        {chosen.length > 0 && <p className="mb-4 rounded-[3px] border border-brass/30 bg-iris-soft px-4 py-3 font-display text-sm italic text-ink/80">The pieces stay on the rail. Once your photo’s in, See it on me is one tap.</p>}
        <label className="mb-4 flex cursor-pointer items-start gap-3 text-sm text-ink/70">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(200,164,94)]" />
          <span>I agree my photo is stored to generate try-on images. It’s used only for this, never shared, and I can delete it anytime.</span>
        </label>
        <div className={`space-y-3 ${consent ? '' : 'pointer-events-none opacity-40'}`}>
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={!consent || photoBusy} className="press flex w-full items-center justify-between rounded-[3px] border border-ink/12 px-5 py-4 text-left transition-colors hover:border-brass">
            <span>
              <span className="block text-sm font-semibold text-ink">Take a photo</span>
              <span className="block text-xs text-ink/50">Full-length, a plain wall behind you, even light</span>
            </span>
            <span className="text-ink/30">→</span>
          </button>
          <button type="button" onClick={() => galleryRef.current?.click()} disabled={!consent || photoBusy} className="press flex w-full items-center justify-between rounded-[3px] border border-ink/12 px-5 py-4 text-left transition-colors hover:border-brass">
            <span>
              <span className="block text-sm font-semibold text-ink">Choose from gallery</span>
              <span className="block text-xs text-ink/50">A clear, front-facing, full-length shot</span>
            </span>
            <span className="text-ink/30">→</span>
          </button>
        </div>
        {photoBusy && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-ink/50">
            <Spinner className="h-4 w-4" /> saving your photo…
          </div>
        )}
      </Modal>

      {/* ---- Lookbook picker ---- */}
      <Modal open={pickerFor !== null} onClose={() => setPickerFor(null)} title="Save to a lookbook">
        {pickerFor && (
          <>
            {lookbooks.length > 0 && (
              <div className="space-y-2">
                {lookbooks.map((b) => {
                  const inBook = b.tryOnIds.includes(pickerFor)
                  return (
                    <button key={b.id} type="button" onClick={() => void handleToggleBook(b.id, pickerFor)} className={`press flex w-full items-center justify-between rounded-[3px] border px-4 py-3 text-sm transition-colors ${inBook ? 'border-brass bg-iris-soft text-brass' : 'border-ink/12 text-ink/75 hover:border-brass/50'}`}>
                      <span>{b.name}</span>
                      <span className="text-xs">{inBook ? 'added' : `${b.tryOnIds.length} renders`}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <input value={newBookName} onChange={(e) => setNewBookName(e.target.value)} placeholder="New lookbook — e.g. Wedding options" className="field field-sm" />
              <button type="button" onClick={() => void handleCreateBook()} className="btn-primary btn-sm">
                Create
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
