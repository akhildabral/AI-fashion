import { money } from '@zauq/shared/money'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { deleteWardrobeItem, getWardrobeItem, recatalogWardrobeItem, resolveTwin, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { getStory, type StoryResponse } from '@zauq/shared/outfits'
import type { WardrobeItem, WardrobeItemEdit } from '@zauq/shared/types'
import { resolveImageUrl } from '../lib/api'
import { Arch, PageShell, Tabs, Toast, useFlash, SkeletonBlock } from '../components/ui'
import { Spinner } from '../components/Spinner'
import { ShareButton } from '../components/ShareButton'
import { GoesWith } from '../components/GoesWith'
import { LetGoModal } from '../components/LetGo'
import { TryOnModal } from '../components/TryOnModal'

// The piece page: one garment, every fact in order, each with its source;
// the story and Goes with beside them. Tap a fact to change it.

type Kind = 'chips' | 'multi' | 'text' | 'money' | 'note'
interface Fact {
  key: string
  group: 'Core' | 'Make' | 'Cut and fit' | 'When' | 'Yours'
  label: string
  kind: Kind
  options?: [string, string][]
  /** A per-type detail, stored under details.<key>. */
  detail?: boolean
  /** Only shown for these categories. */
  only?: string[]
  /** Never read from the photo: no source shown until you set it. */
  yours?: boolean
}

const CATEGORIES: [string, string][] = [['top', 'Top'], ['bottom', 'Bottom'], ['outerwear', 'Outerwear'], ['dress', 'Dress'], ['footwear', 'Footwear'], ['accessory', 'Accessory'], ['other', 'Other']]
const CUT_FOR: [string, string][] = [['womens', 'Her'], ['mens', 'Him'], ['unisex', 'Anyone']]
const MATERIALS: [string, string][] = [['cotton', 'Cotton'], ['linen', 'Linen'], ['wool', 'Wool'], ['silk', 'Silk'], ['denim', 'Denim'], ['leather', 'Leather'], ['synthetic', 'Synthetic'], ['blend', 'Blend'], ['other', 'Other']]
const PATTERNS: [string, string][] = [['solid', 'Solid'], ['striped', 'Striped'], ['plaid', 'Plaid'], ['checked', 'Checked'], ['floral', 'Floral'], ['graphic', 'Graphic'], ['other', 'Other']]
const TEXTURES: [string, string][] = [['smooth', 'Smooth'], ['woven', 'Woven'], ['knit', 'Knit'], ['ribbed', 'Ribbed'], ['fuzzy', 'Fuzzy'], ['glossy', 'Glossy'], ['other', 'Other']]
const WEIGHTS: [string, string][] = [['light', 'Light'], ['mid', 'Mid'], ['heavy', 'Heavy']]
const FITS: [string, string][] = [['slim', 'Slim'], ['regular', 'Regular'], ['relaxed', 'Relaxed'], ['oversized', 'Oversized']]
const LENGTHS: [string, string][] = [['cropped', 'Cropped'], ['regular', 'Regular'], ['long', 'Long']]
const FORMALITY: [string, string][] = [['casual', 'Casual'], ['smart-casual', 'Smart casual'], ['business', 'Business'], ['formal', 'Formal'], ['athletic', 'Athletic']]
const SEASONS: [string, string][] = [['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Autumn'], ['winter', 'Winter']]
const OCCASIONS: [string, string][] = [['work', 'Work'], ['casual', 'Weekend'], ['evening', 'Evening'], ['occasion', 'Occasion'], ['athletic', 'Training']]
const CARE: [string, string][] = [['machine', 'Machine wash'], ['hand', 'Hand wash'], ['dry-clean', 'Dry clean'], ['none', 'No washing']]

const FACTS: Fact[] = [
  { key: 'category', group: 'Core', label: 'Category', kind: 'chips', options: CATEGORIES },
  { key: 'subtype', group: 'Core', label: 'Type', kind: 'text' },
  { key: 'cutFor', group: 'Core', label: 'Cut for', kind: 'chips', options: CUT_FOR },
  { key: 'primaryColor', group: 'Core', label: 'Colour', kind: 'text' },
  { key: 'secondaryColor', group: 'Core', label: 'Second colour', kind: 'text' },
  { key: 'material', group: 'Make', label: 'Material', kind: 'chips', options: MATERIALS },
  { key: 'materialNote', group: 'Make', label: 'Material, in detail', kind: 'text', detail: true },
  { key: 'pattern', group: 'Make', label: 'Pattern', kind: 'chips', options: PATTERNS },
  { key: 'texture', group: 'Make', label: 'Texture', kind: 'chips', options: TEXTURES },
  { key: 'renderNotes', group: 'Make', label: 'For the Mirror', kind: 'note' },
  { key: 'weight', group: 'Make', label: 'Weight', kind: 'chips', options: WEIGHTS },
  { key: 'fit', group: 'Cut and fit', label: 'Fit', kind: 'chips', options: FITS },
  { key: 'length', group: 'Cut and fit', label: 'Length', kind: 'chips', options: LENGTHS },
  { key: 'neckline', group: 'Cut and fit', label: 'Neckline', kind: 'text', detail: true, only: ['top', 'dress', 'outerwear'] },
  { key: 'sleeve', group: 'Cut and fit', label: 'Sleeve', kind: 'text', detail: true, only: ['top', 'dress', 'outerwear'] },
  { key: 'rise', group: 'Cut and fit', label: 'Rise', kind: 'text', detail: true, only: ['bottom'] },
  { key: 'leg', group: 'Cut and fit', label: 'Leg', kind: 'text', detail: true, only: ['bottom'] },
  { key: 'heel', group: 'Cut and fit', label: 'Heel', kind: 'text', detail: true, only: ['footwear'] },
  { key: 'toe', group: 'Cut and fit', label: 'Toe', kind: 'text', detail: true, only: ['footwear'] },
  { key: 'closure', group: 'Cut and fit', label: 'Closure', kind: 'text', detail: true, only: ['top', 'outerwear', 'dress', 'bottom', 'footwear', 'accessory'] },
  { key: 'formality', group: 'When', label: 'Formality', kind: 'chips', options: FORMALITY },
  { key: 'season', group: 'When', label: 'Seasons', kind: 'multi', options: SEASONS },
  { key: 'occasions', group: 'When', label: 'Occasions', kind: 'multi', options: OCCASIONS },
  { key: 'brand', group: 'Yours', label: 'Brand', kind: 'text', yours: true },
  { key: 'size', group: 'Yours', label: 'Size', kind: 'text', yours: true },
  { key: 'price', group: 'Yours', label: 'Paid', kind: 'money', yours: true },
  { key: 'care', group: 'Yours', label: 'Care', kind: 'chips', options: CARE, yours: true },
  { key: 'note', group: 'Yours', label: 'Note', kind: 'note', yours: true },
]
const GROUPS: Fact['group'][] = ['Core', 'Make', 'Cut and fit', 'When', 'Yours']
const STATES: Record<string, string> = { clean: 'Clean', 'in-wash': 'In the wash', packed: 'Packed', 'lent-out': 'Lent out', retired: 'Let go' }

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
function labelFor(fact: Fact, value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => fact.options?.find(([k]) => k === v)?.[1] ?? title(String(v))).join(', ')
  if (fact.kind === 'money' && typeof value === 'number') return money(value)
  const opt = fact.options?.find(([k]) => k === value)
  return opt ? opt[1] : title(String(value))
}
function valueOf(item: WardrobeItem, fact: Fact): unknown {
  if (fact.detail) return item.details?.[fact.key] ?? null
  const v = (item as unknown as Record<string, unknown>)[fact.key]
  if (Array.isArray(v)) return v.length ? v : null
  return v ?? null
}
/** Where a fact came from: read from the photo, a guess, set by you, or not known. */
function sourceOf(item: WardrobeItem, fact: Fact, value: unknown): 'read' | 'guess' | 'you' | 'none' {
  if (value == null || value === '') return 'none'
  if (fact.yours || fact.detail) return item.attrConfidence?.[fact.key] != null && item.attrConfidence[fact.key] < 1 ? 'read' : fact.yours ? 'you' : 'read'
  const c = item.attrConfidence?.[fact.key]
  if (c == null) return 'read'
  if (c >= 1) return 'you'
  if (c < 0.5) return 'guess'
  return 'read'
}
const SOURCE_WORD = { read: 'read from the photo', guess: 'a guess, tap to confirm', you: 'you set it', none: '' }
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** A twin flag: this piece and the one it looks like, side by side, and your answer. */
function TwinBanner({ item, onResolved, onNote }: { item: WardrobeItem; onResolved: (kept: WardrobeItem | null) => void; onNote: (msg: string) => void }) {
  const [other, setOther] = useState<WardrobeItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    if (!item.twinOfId) return
    getWardrobeItem(item.twinOfId)
      .then((r) => setOther(r.item))
      .catch(() => setOther(null))
  }, [item.twinOfId])
  async function answer(resolution: 'same' | 'different', keepPhoto = false) {
    setBusy(resolution + (keepPhoto ? '-photo' : ''))
    try {
      const r = await resolveTwin(item.id, resolution, keepPhoto)
      onNote(resolution === 'same' ? 'One piece, then. The count’s right again.' : 'Two pieces. Noted. I won’t ask again.')
      onResolved(resolution === 'same' ? r.kept : null)
    } catch (err) {
      onNote(err instanceof Error ? err.message : 'Could not save that.')
      setBusy(null)
    }
  }
  const name = (i: WardrobeItem) => title(i.subtype ?? i.category)
  return (
    <section className="mt-6 rounded-[3px] border border-brass/50 p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">A twin?</p>
      <p className="mt-1 text-sm text-ink/70">
        This looks like a piece you already have{other ? `: the ${name(other).toLowerCase()}` : ''}.{item.twinScore != null ? (item.twinScore >= 13 ? ' Same type, same colours, and the photo matches.' : ' The same type and colours.') : ''} Nothing happens until you say.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <div className="w-16 shrink-0">
          <Arch aspect="aspect-[4/5]">
            <img src={resolveImageUrl(item.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[10%]" />
          </Arch>
          <p className="mt-1 text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/45">New</p>
        </div>
        {other && (
          <Link to={`/closet/piece/${other.id}`} className="w-16 shrink-0">
            <Arch aspect="aspect-[4/5]">
              <img src={resolveImageUrl(other.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[10%]" />
            </Arch>
            <p className="mt-1 text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/45">Yours</p>
          </Link>
        )}
        <div className="flex min-w-0 flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void answer('same')} className="btn-primary btn-sm">
            {busy === 'same' ? '…' : 'Same piece'}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void answer('same', true)} className="btn-ghost btn-sm">
            {busy === 'same-photo' ? '…' : 'Same, keep this photo'}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void answer('different')} className="btn-quiet btn-quiet-sm">
            {busy === 'different' ? '…' : 'Different'}
          </button>
        </div>
      </div>
    </section>
  )
}

/** One fact row, and its editor when open. */
function FactRow({ item, fact, open, onOpen, onSave }: { item: WardrobeItem; fact: Fact; open: boolean; onOpen: () => void; onSave: (value: unknown) => Promise<void> }) {
  const value = valueOf(item, fact)
  const source = sourceOf(item, fact, value)
  const [draft, setDraft] = useState<string>(value == null ? '' : Array.isArray(value) ? '' : String(value))
  const [multi, setMulti] = useState<string[]>(Array.isArray(value) ? (value as string[]) : [])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setDraft(value == null || Array.isArray(value) ? '' : String(value))
    setMulti(Array.isArray(value) ? (value as string[]) : [])
  }, [value, open])

  async function commit(v: unknown) {
    setBusy(true)
    try {
      await onSave(v)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-ink/10 first:border-t-0">
      <button type="button" onClick={onOpen} className="flex w-full items-baseline justify-between gap-4 py-3 text-left" aria-expanded={open}>
        <span className="text-sm text-ink/55">{fact.label}</span>
        <span className="min-w-0 text-right">
          {source === 'none' ? (
            <span className="font-display text-sm italic text-brass">{fact.yours ? 'Add it' : fact.kind === 'chips' && fact.options ? `unsure · which?` : 'unsure'}</span>
          ) : (
            <span className={`text-sm font-semibold ${source === 'guess' ? 'text-brass' : 'text-ink'}`}>{labelFor(fact, value)}</span>
          )}
          {source !== 'none' && <span className="ml-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink/35">{source === 'read' ? 'read' : source === 'guess' ? 'a guess' : 'you set it'}</span>}
        </span>
      </button>
      {open && (
        <div className="pb-4">
          {source !== 'none' && <p className="mb-2 text-xs text-ink/45">{SOURCE_WORD[source]}.</p>}
          {(fact.kind === 'chips' || fact.kind === 'multi') && fact.options && (
            <div className="flex flex-wrap gap-2">
              {fact.options.map(([k, l]) => {
                const on = fact.kind === 'multi' ? multi.includes(k) : value === k
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    onClick={() => {
                      if (fact.kind === 'multi') {
                        const next = on ? multi.filter((x) => x !== k) : [...multi, k]
                        setMulti(next)
                        void commit(next)
                      } else void commit(on ? null : k)
                    }}
                    className={`chip ${on ? 'chip-on' : ''}`}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
          )}
          {(fact.kind === 'text' || fact.kind === 'money' || fact.kind === 'note') && (
            <form
              className="flex flex-wrap items-start gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const t = draft.trim()
                void commit(fact.kind === 'money' ? (t ? Number(t) : null) : t || null)
              }}
            >
              {fact.kind === 'note' ? (
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={fact.key === 'renderNotes' ? 4 : 2} maxLength={fact.key === 'renderNotes' ? 900 : 400} className="field min-w-0 flex-1 !h-auto py-2" placeholder={fact.key === 'renderNotes' ? 'What the Mirror must get right: the exact shade, the fabric, the collar, every logo and where it sits…' : 'Sleeves taken up, a gift from…, dry clean only'} />
              ) : (
                <input value={draft} onChange={(e) => setDraft(e.target.value)} inputMode={fact.kind === 'money' ? 'decimal' : 'text'} type={fact.kind === 'money' ? 'number' : 'text'} min={0} className="field field-sm min-w-0 flex-1 max-w-xs" placeholder={fact.kind === 'money' ? 'What it cost' : fact.label} autoFocus />
              )}
              <button type="submit" disabled={busy} className="btn-primary btn-sm">
                {busy ? '…' : 'Save'}
              </button>
              {value != null && (
                <button type="button" disabled={busy} onClick={() => void commit(null)} className="btn-quiet btn-quiet-sm">
                  Clear
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  )
}

export function PiecePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { toast, flash } = useFlash()
  const [item, setItem] = useState<WardrobeItem | null>(null)
  const [story, setStory] = useState<StoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'facts' | 'story' | 'goes'>('facts')
  const [openFact, setOpenFact] = useState<string | null>(null)
  const [tryOn, setTryOn] = useState(false)
  const [original, setOriginal] = useState(false)
  const [menu, setMenu] = useState(false)
  const [lettingGo, setLettingGo] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [, setBusy] = useState<string | null>(null)
  const [whisper, setWhisper] = useState('')
  const poll = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await getWardrobeItem(id)
      setItem(r.item)
      getStory(id).then(setStory).catch(() => undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the piece.')
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])
  // While the photo is being read again, look in every few seconds.
  useEffect(() => {
    if (item?.status !== 'processing') return
    poll.current = window.setInterval(() => void load(), 3000)
    return () => {
      if (poll.current) window.clearInterval(poll.current)
    }
  }, [item?.status, load])

  usePageTitle(item ? title(item.subtype ?? item.category) : 'A piece')

  async function save(patch: WardrobeItemEdit) {
    if (!item) return
    try {
      const { item: updated } = await updateWardrobeItem(item.id, patch)
      setItem(updated)
      setWhisper('Saved.')
      window.setTimeout(() => setWhisper(''), 1600)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save that.')
    }
  }
  async function saveFact(fact: Fact, value: unknown) {
    if (!item) return
    if (fact.detail) {
      const details = { ...(item.details ?? {}) }
      if (value == null || value === '') delete details[fact.key]
      else details[fact.key] = String(value)
      await save({ details })
    } else await save({ [fact.key]: value } as WardrobeItemEdit)
    if (fact.kind !== 'multi') setOpenFact(null)
  }
  async function reread() {
    if (!item) return
    setMenu(false)
    setBusy('reread')
    try {
      const { item: updated } = await recatalogWardrobeItem(item.id)
      setItem(updated)
      flash('Reading the photo again. Facts you set stay yours.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not read it again.')
    } finally {
      setBusy(null)
    }
  }
  async function remove() {
    if (!item) return
    try {
      await deleteWardrobeItem(item.id)
      navigate('/closet', { replace: true })
    } catch {
      flash('Couldn’t remove it. Try again.')
    }
  }

  if (error) {
    return (
      <PageShell>
        <p className="alert-error" role="alert">
          {error}
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => { setError(null); void load() }} className="btn-primary">
            Try again
          </button>
          <Link to="/closet" className="btn-ghost inline-flex">
            The closet
          </Link>
        </div>
      </PageShell>
    )
  }
  if (!item) {
    return (
      <PageShell>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]" aria-busy="true" aria-label="Loading the piece">
          <div className="arch-bezel aspect-[5/6] animate-pulse opacity-60"><div className="arch-niche h-full w-full" /></div>
          <div className="flex flex-col gap-4 pt-2">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-12 w-3/4" />
            <SkeletonBlock className="h-9 w-40" />
            <div className="mt-4 flex flex-col gap-3 border-t border-ink/10 pt-5">
              {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  const name = title(item.subtype?.trim() || item.category)
  const hasOriginal = Boolean(item.originalUrl && item.originalUrl !== item.imageUrl)
  const cut = CUT_FOR.find(([k]) => k === item.cutFor)?.[1]
  const cutGuess = (item.attrConfidence?.cutFor ?? 1) < 0.5
  const facts = FACTS.filter((f) => !f.only || f.only.includes(item.category))
  const unsure = facts.filter((f) => !f.yours && !f.detail && valueOf(item, f) == null).length

  return (
    <PageShell>
      <Toast msg={toast} />
      <p className="animate-rise text-[11px] font-semibold uppercase tracking-[0.32em] text-brass">
        <Link to="/closet" className="hover:underline">
          The closet
        </Link>{' '}
        · a piece
      </p>

      <div className="mt-4 grid gap-8 md:grid-cols-[260px_minmax(0,1fr)] md:gap-12 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* the piece, in its niche */}
        <div className="mx-auto w-full max-w-[260px] md:mx-0 md:max-w-none">
          <Arch aspect="aspect-[4/5]" className="w-full">
            <img src={resolveImageUrl(original && item.originalUrl ? item.originalUrl : item.imageUrl)} alt={name} className={`relative z-[1] h-full w-full ${original ? 'object-cover' : 'object-contain p-[8%]'}`} />
            {item.status === 'processing' && (
              <span className="absolute left-3 top-3 z-[2] inline-flex items-center gap-1.5 rounded-[3px] bg-surface/90 px-2.5 py-1 text-xs text-ink/70">
                <Spinner className="h-3 w-3" /> reading the photo…
              </span>
            )}
          </Arch>
          {hasOriginal && (
            <button type="button" onClick={() => setOriginal((v) => !v)} className="mt-2 w-full text-center text-xs font-semibold text-brass hover:underline">
              {original ? 'The cut-out' : 'The original photo'}
            </button>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">{title(item.category)}</span>
            {cut && (
              <button type="button" onClick={() => { setTab('facts'); setOpenFact('cutFor') }} className={`chip ${cutGuess ? '' : 'chip-on'}`} title={cutGuess ? 'A guess. Tap to confirm' : 'Read from the photo'}>
                Cut for {cut.toLowerCase()}{cutGuess ? ' ?' : ''}
              </button>
            )}
            <span className="chip">{STATES[item.state] ?? title(item.state)}</span>
            <span className="chip">{item.visibility === 'public' ? 'Public' : 'Private'}</span>
            {item.suppressed && <span className="chip">Not suggested</span>}
          </div>
          <h1 className="mt-3 animate-rise-1 font-display text-5xl font-medium leading-none text-ink sm:text-6xl">
            {item.primaryColor ? `${title(item.primaryColor)} ` : ''}
            <em className="text-brass">{name.toLowerCase()}.</em>
          </h1>
          {item.description && <p className="mt-3 max-w-xl font-display text-lg italic text-ink/55">{item.description}</p>}

          <div className="action-row mt-6">
            {/* Wears are logged where the day is: Today, or the Journal. A piece
                page only reads the record, so nothing here can add to it by accident. */}
            <Link to={`/closet/compose?pin=${item.id}`} className="btn-primary">
              Style it
            </Link>
            <button type="button" onClick={() => setTryOn(true)} className="btn-quiet">
              See it on me
            </button>
            <div className="relative">
              <button type="button" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} className="btn-icon" aria-label="More">
                ···
              </button>
              {menu && (
                <div role="menu" className="absolute left-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-[3px] border border-brass/30 bg-surface py-1 shadow-float">
                  <button type="button" role="menuitem" onClick={() => void reread()} className="block w-full px-4 py-2 text-left text-sm text-ink/75 hover:bg-bone hover:text-ink">
                    Read the photo again
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); void save({ state: item.state === 'in-wash' ? 'clean' : 'in-wash' }) }} className="block w-full px-4 py-2 text-left text-sm text-ink/75 hover:bg-bone hover:text-ink">
                    {item.state === 'in-wash' ? 'Back from the wash' : 'Into the wash'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); void save({ state: item.state === 'lent-out' ? 'clean' : 'lent-out' }) }} className="block w-full px-4 py-2 text-left text-sm text-ink/75 hover:bg-bone hover:text-ink">
                    {item.state === 'lent-out' ? 'It’s back' : 'Lend it out'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); void save({ visibility: item.visibility === 'public' ? 'private' : 'public' }) }} className="block w-full px-4 py-2 text-left text-sm text-ink/75 hover:bg-bone hover:text-ink">
                    {item.visibility === 'public' ? 'Make it private' : 'Show it in your room'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); void save({ suppressed: !item.suppressed }) }} className="block w-full px-4 py-2 text-left text-sm text-ink/75 hover:bg-bone hover:text-ink">
                    {item.suppressed ? 'Suggest it again' : 'Don’t suggest it'}
                  </button>
                  <div className="my-1 border-t border-ink/10" />
                  <ShareButton target={{ kind: 'piece', id: item.id, title: `${name} from my closet` }} className="block w-full px-4 py-2 text-left text-sm text-ink/75 hover:bg-bone hover:text-ink" />
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setLettingGo(true) }} className="block w-full px-4 py-2 text-left text-sm text-ink/75 hover:bg-bone hover:text-ink">
                    Let it go
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setConfirmRemove(true) }} className="block w-full px-4 py-2 text-left text-sm text-[rgb(var(--c-danger))] hover:bg-bone">
                    Remove from the closet
                  </button>
                </div>
              )}
            </div>
          </div>
          {confirmRemove && (
            <div className="plaque mt-4 flex flex-wrap items-center gap-3 p-3 pl-4 text-sm">
              <span className="text-ink/70">Remove this piece and its record? There is no way back.</span>
              <button type="button" onClick={() => void remove()} className="btn-ghost btn-sm !border-[rgb(var(--c-danger))]/60 !text-[rgb(var(--c-danger))]">
                Yes, remove it
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className="btn-quiet !h-8 !text-xs">
                Keep it
              </button>
            </div>
          )}

          {item.twinOfId && <TwinBanner item={item} onResolved={(kept) => (kept ? navigate(`/closet/piece/${kept.id}`, { replace: true }) : void load())} onNote={flash} />}

          <section className="plaque mt-6 grid grid-cols-3 gap-3 p-4 pl-5 sm:gap-4">
            <div className="min-w-0">
              <p className="font-display text-lg text-ink [font-variant-numeric:tabular-nums] sm:text-2xl">{story ? story.wearCount : '–'}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">wears</p>
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg leading-tight text-ink sm:text-2xl">{story ? (story.lastWorn ? formatDay(story.lastWorn) : 'never') : '–'}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">last worn</p>
            </div>
            <div className="min-w-0">
              {story?.costPerWear != null ? (
                <p className="font-display text-lg leading-tight text-ink [font-variant-numeric:tabular-nums] sm:text-2xl">{money(story.costPerWear)}</p>
              ) : (
                <button type="button" onClick={() => { setTab('facts'); setOpenFact('price') }} className="font-display text-lg italic text-brass hover:underline">
                  Add what it cost
                </button>
              )}
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">a wear</p>
            </div>
          </section>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
            <Tabs label="The piece" value={tab} onChange={setTab} items={[{ key: 'facts', label: 'The facts', count: unsure || undefined }, { key: 'story', label: 'The story' }, { key: 'goes', label: 'Goes with' }]} />
            <p className="min-h-[1rem] font-display text-sm italic text-ink/45" aria-live="polite">
              {whisper}
            </p>
          </div>

          {tab === 'facts' && (
            <div className="mt-4">
              {unsure > 0 && <p className="mb-3 text-xs text-ink/45">{unsure} {unsure === 1 ? 'fact' : 'facts'} the photo couldn’t settle. Tap one to answer it; the stylist works either way.</p>}
              {GROUPS.map((g) => {
                const rows = facts.filter((f) => f.group === g)
                if (rows.length === 0) return null
                return (
                  <section key={g} className="mb-6">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-brass">{g}</p>
                    <div className="card px-4 sm:px-5">
                      {rows.map((f) => (
                        <FactRow key={f.key} item={item} fact={f} open={openFact === f.key} onOpen={() => setOpenFact((cur) => (cur === f.key ? null : f.key))} onSave={(v) => saveFact(f, v)} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          {tab === 'story' && (
            <div className="mt-4">
              {!story && (
                <div className="py-8 text-center text-ink/40">
                  <Spinner className="h-5 w-5" />
                </div>
              )}
              {story && (
                <>
                  <p className="font-display text-xl italic text-ink">
                    {story.wearCount === 0
                      ? 'Never worn yet.'
                      : `Worn ${story.wearCount}×${story.firstWorn ? `, first on ${formatDay(story.firstWorn)}` : ''}${story.lastWorn ? `, last on ${formatDay(story.lastWorn)}` : ''}${story.costPerWear != null ? ` · ${money(story.costPerWear)} a wear` : ''}.`}
                  </p>
                  {story.idleDays != null && story.idleDays >= 90 && <p className="mt-1 text-sm text-ink/55">Sitting idle for {story.idleDays} days.</p>}
                  {story.days.length > 0 && <p className="mt-1 text-sm text-ink/55">Mostly {story.days.map((d) => OCCASIONS.find(([k]) => k === d)?.[1].toLowerCase() ?? d).join(', ')}.</p>}
                  {story.wornWith.length > 0 && (
                    <>
                      <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-brass">Worn with</p>
                      <div className="mt-2 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                        {story.wornWith.map(({ item: w, times }) => (
                          <Link key={w.id} to={`/closet/piece/${w.id}`} className="w-16 flex-none text-center">
                            <Arch aspect="aspect-[4/5]">
                              <img src={resolveImageUrl(w.imageUrl)} alt={w.subtype ?? w.category} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                            </Arch>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/50">{times}×</p>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                  {story.wearCount > 0 && (
                    <Link to={`/journal?item=${item.id}`} className="mt-4 inline-block text-xs font-semibold text-brass hover:underline">
                      The days it was worn, in the record →
                    </Link>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'goes' && (
            <div className="mt-2">
              <GoesWith itemId={item.id} />
              <p className="mt-3 text-xs text-ink/45">Only pieces on the same side of the line: {cut ? `cut for ${cut.toLowerCase()}` : 'yours'}, or for anyone.</p>
            </div>
          )}
        </div>
      </div>

      <LetGoModal
        item={lettingGo ? item : null}
        onClose={() => setLettingGo(false)}
        onChanged={(it) => {
          setItem(it)
          setLettingGo(false)
        }}
        onNote={flash}
      />
      {tryOn && item && <TryOnModal itemIds={[item.id]} onClose={() => setTryOn(false)} />}
    </PageShell>
  )
}
