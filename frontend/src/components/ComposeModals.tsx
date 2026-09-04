import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Arch, Modal } from './ui'
import { Spinner } from './Spinner'
import { resolveImageUrl } from '../lib/api'
import { clearLookPhoto, getMyRecentLooks, setLookPhoto, setLookPhotoFromRender, shareLook, unshareLook, type MyLook } from '@zauq/shared/circle'
import { getOutfits, type Outfit } from '@zauq/shared/outfits'
import { getNetwork, type NetworkEntry } from '@zauq/shared/social'
import { FlatLay } from './CircleCards'
import { getTryOns } from '@zauq/shared/tryon'
import { getWardrobe } from '@zauq/shared/wardrobe'
import { createPoll, type PollAudience, type PollOptionInput } from '@zauq/shared/polls'
import type { TryOn, WardrobeItem } from '@zauq/shared/types'

// Composing from inside the Circle: put a recent wear on the circle, or ask
// it a verdict — without leaving the room.

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diff = Math.round((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/* ---------- Share a look ---------- */

export function ShareLookModal({ open, onClose, onShared }: { open: boolean; onClose: () => void; onShared: () => void }) {
  const [looks, setLooks] = useState<MyLook[] | null>(null)
  const [renders, setRenders] = useState<TryOn[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pickingRender, setPickingRender] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileFor = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setLooks(null)
    setError(null)
    setPickingRender(null)
    void getMyRecentLooks().then((r) => setLooks(r.looks)).catch(() => setLooks([]))
    void getTryOns().then((r) => setRenders(r.tryOns)).catch(() => setRenders([]))
  }, [open])

  const patch = (id: string, fn: (l: MyLook) => MyLook) => setLooks((ls) => (ls ? ls.map((l) => (l.id === id ? fn(l) : l)) : ls))

  async function run(id: string, work: () => Promise<void>) {
    setBusy(id)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.')
    } finally {
      setBusy(null)
    }
  }

  const toggleShare = (look: MyLook) =>
    run(look.id, async () => {
      if (look.shared) await unshareLook(look.id)
      else await shareLook(look.id)
      patch(look.id, (l) => ({ ...l, shared: !l.shared }))
      onShared()
    })

  function pickFile(id: string) {
    fileFor.current = id
    fileRef.current?.click()
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const id = fileFor.current
    e.target.value = ''
    if (!file || !id) return
    void run(id, async () => {
      const { photoUrl } = await setLookPhoto(id, file)
      patch(id, (l) => ({ ...l, photoUrl }))
      onShared()
    })
  }
  const useRender = (id: string, tryOnId: string) =>
    run(id, async () => {
      const { photoUrl } = await setLookPhotoFromRender(id, tryOnId)
      patch(id, (l) => ({ ...l, photoUrl }))
      setPickingRender(null)
      onShared()
    })
  const removePhoto = (id: string) =>
    run(id, async () => {
      await clearLookPhoto(id)
      patch(id, (l) => ({ ...l, photoUrl: null }))
      onShared()
    })

  return (
    <Modal open={open} onClose={onClose} title="Share a look">
      <p className="text-sm text-ink/60">Your recent wears. Put one on the circle as the pieces, or add a photo of you in it.</p>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      {looks === null && (
        <div className="py-10 text-center text-ink/40">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {looks && looks.length === 0 && (
        <div className="mt-4 rounded-[3px] border border-dashed border-ink/20 p-6 text-center">
          <p className="text-sm text-ink/60">Nothing logged in the last two weeks.</p>
          <Link to="/" onClick={onClose} className="btn-primary mt-4 inline-flex btn-sm">
            Wear today’s brief
          </Link>
        </div>
      )}
      {looks && looks.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {looks.map((l) => (
            <li key={l.id} className="border-t border-ink/10 pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-3">
                {l.photoUrl ? (
                  <Arch aspect="aspect-[3/4]" className="w-11 shrink-0">
                    <img src={resolveImageUrl(l.photoUrl)} alt="You in the look" className="relative z-[1] h-full w-full object-cover" />
                  </Arch>
                ) : (
                  <div className="flex gap-1.5">
                    {l.items.slice(0, 3).map((it) => (
                      <Arch key={it.id} aspect="aspect-[4/5]" className="w-11">
                        <img src={resolveImageUrl(it.imageUrl)} alt={it.subtype ?? it.category} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                      </Arch>
                    ))}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{dayLabel(l.wornOn)}</p>
                  <p className="text-xs text-ink/50">
                    {l.items.length} piece{l.items.length === 1 ? '' : 's'}
                    {l.eventType ? ` · ${l.eventType}` : ''}
                    {l.shared ? ' · on the circle' : ''}
                    {l.photoUrl ? ' · with photo' : ''}
                  </p>
                </div>
                <button type="button" disabled={busy === l.id} onClick={() => void toggleShare(l)} className={l.shared ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}>
                  {busy === l.id ? '…' : l.shared ? 'Take down' : 'Share'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-[11px] font-semibold text-brass">
                {l.photoUrl ? (
                  <>
                    <button type="button" onClick={() => pickFile(l.id)} className="press hover:underline">Change photo</button>
                    <button type="button" onClick={() => void removePhoto(l.id)} className="press text-ink/45 hover:underline">Remove photo</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => pickFile(l.id)} className="press hover:underline">Add a photo</button>
                    {renders && renders.length > 0 && (
                      <button type="button" onClick={() => setPickingRender(pickingRender === l.id ? null : l.id)} className="press hover:underline">
                        {pickingRender === l.id ? 'Cancel' : 'Use a Mirror render'}
                      </button>
                    )}
                  </>
                )}
              </div>
              {pickingRender === l.id && renders && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {renders.slice(0, 12).map((r) => (
                    <button key={r.id} type="button" onClick={() => void useRender(l.id, r.id)} className="press w-14 shrink-0" aria-label="Use this render">
                      <Arch aspect="aspect-[3/4]" className="w-14">
                        <img src={resolveImageUrl(r.imageUrl)} alt="" className="relative z-[1] h-full w-full object-cover" />
                      </Arch>
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 alert-error">{error}</p>}
    </Modal>
  )
}

/* ---------- Ask the circle ---------- */

type Source = 'outfits' | 'looks' | 'renders' | 'pieces'

/** Something you can ask with: a picture, or a set of pieces the server lays out on a board. */
interface Candidate {
  key: string
  label: string
  imageUrl?: string
  items?: { id: string; imageUrl: string; subtype: string | null; category: string }[]
}

const SOURCES: { key: Source; label: string }[] = [
  { key: 'outfits', label: 'Outfits' },
  { key: 'looks', label: 'Recent looks' },
  { key: 'renders', label: 'Renders' },
  { key: 'pieces', label: 'Pieces' },
]

const EXPIRIES: { key: string; label: string; minutes: () => number }[] = [
  { key: 'day', label: '24 hours', minutes: () => 24 * 60 },
  {
    key: 'tonight',
    label: 'Until tonight',
    minutes: () => {
      const t = new Date()
      t.setHours(20, 0, 0, 0)
      if (t.getTime() < Date.now() + 5 * 60_000) t.setDate(t.getDate() + 1)
      return Math.max(5, Math.round((t.getTime() - Date.now()) / 60_000))
    },
  },
  { key: 'three', label: '3 days', minutes: () => 3 * 24 * 60 },
]

export function AskCircleModal({ open, onClose, onAsked, initialOutfitId = null }: { open: boolean; onClose: () => void; onAsked: () => void; initialOutfitId?: string | null }) {
  const [source, setSource] = useState<Source>('outfits')
  const [outfits, setOutfits] = useState<Outfit[] | null>(null)
  const [looks, setLooks] = useState<MyLook[] | null>(null)
  const [renders, setRenders] = useState<TryOn[] | null>(null)
  const [closet, setCloset] = useState<WardrobeItem[] | null>(null)
  const [people, setPeople] = useState<NetworkEntry[] | null>(null)
  const [chosen, setChosen] = useState<Candidate[]>([])
  const [question, setQuestion] = useState('')
  const [audience, setAudience] = useState<PollAudience>('circle')
  const [friends, setFriends] = useState<string[]>([])
  const [expiry, setExpiry] = useState('day')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen([])
    setQuestion('')
    setError(null)
    setAudience('circle')
    setFriends([])
    setExpiry('day')
    void getOutfits()
      .then((r) => {
        setOutfits(r.outfits)
        const first = initialOutfitId ? r.outfits.find((o) => o.id === initialOutfitId) : null
        if (first) {
          setSource('outfits')
          setChosen([{ key: `o-${first.id}`, label: first.rationale?.slice(0, 40) || first.eventType, items: first.items }])
        } else if (r.outfits.length < 2) setSource('looks')
      })
      .catch(() => setOutfits([]))
    void getMyRecentLooks().then((r) => setLooks(r.looks)).catch(() => setLooks([]))
    void getTryOns().then((r) => setRenders(r.tryOns.filter((t) => t.status === 'ready' && t.imageUrl))).catch(() => setRenders([]))
    void getWardrobe().then((r) => setCloset(r.items.filter((i) => i.status === 'ready'))).catch(() => setCloset([]))
    void getNetwork().then((n) => setPeople(n.following)).catch(() => setPeople([]))
  }, [open, initialOutfitId])

  const pool: Candidate[] =
    source === 'outfits'
      ? (outfits ?? []).map((o) => ({ key: `o-${o.id}`, label: o.rationale?.slice(0, 40) || o.eventType, items: o.items }))
      : source === 'looks'
        ? (looks ?? []).map((l) => ({ key: `l-${l.id}`, label: dayLabel(l.wornOn), items: l.items, imageUrl: l.photoUrl ?? undefined }))
        : source === 'renders'
          ? (renders ?? []).map((r) => ({ key: `r-${r.id}`, label: 'Render', imageUrl: r.imageUrl }))
          : (closet ?? []).map((i) => ({ key: `p-${i.id}`, label: i.subtype ?? i.category, imageUrl: i.imageUrl }))

  const loading = source === 'outfits' ? outfits === null : source === 'looks' ? looks === null : source === 'renders' ? renders === null : closet === null

  function pick(c: Candidate) {
    setChosen((cs) => (cs.some((x) => x.key === c.key) ? cs.filter((x) => x.key !== c.key) : cs.length >= 3 ? cs : [...cs, c]))
  }

  async function ask() {
    if (chosen.length < 2 || sending) return
    if (audience === 'friends' && friends.length === 0) {
      setError('Pick at least one friend to ask.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const options: PollOptionInput[] = chosen.map((c) =>
        // A look with a photo asks with the photo; otherwise its pieces become a board.
        c.imageUrl && (!c.items || c.key.startsWith('l-')) ? { imageUrl: c.imageUrl, label: c.label } : { itemIds: (c.items ?? []).map((i) => i.id), label: c.label },
      )
      await createPoll({
        options,
        question: question.trim() || undefined,
        audience,
        friendHandles: audience === 'friends' ? friends : undefined,
        expiresInMinutes: EXPIRIES.find((e) => e.key === expiry)?.minutes() ?? 24 * 60,
      })
      onAsked()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the verdict.')
    } finally {
      setSending(false)
    }
  }

  const empty: Record<Source, ReactNode> = {
    outfits: (
      <>
        Save a couple of outfits first, from{' '}
        <Link to="/closet/outfits" onClick={onClose} className="font-semibold text-brass hover:underline">
          the Closet
        </Link>
        .
      </>
    ),
    looks: 'Wear a few days and they gather here.',
    renders: (
      <>
        You need two renders to compare.{' '}
        <Link to="/mirror" onClick={onClose} className="font-semibold text-brass hover:underline">
          Try a look in the Mirror
        </Link>
        .
      </>
    ),
    pieces: 'Add a few pieces to your closet first.',
  }

  return (
    <Modal open={open} onClose={onClose} title="Ask the circle">
      <p className="text-sm text-ink/60">Two or three of anything. Ask everyone, a few friends, or just a link.</p>

      {/* what to ask with */}
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">Ask with</p>
      <div role="tablist" aria-label="Choose from" className="tabs mt-2">
        {SOURCES.map((s) => (
          <button key={s.key} role="tab" type="button" aria-selected={source === s.key} onClick={() => setSource(s.key)} className="tab press">
            {s.label}
          </button>
        ))}
      </div>
      {loading && (
        <div className="py-10 text-center text-ink/40">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {!loading && pool.length === 0 && <div className="mt-4 rounded-[3px] border border-dashed border-ink/20 p-6 text-center text-sm text-ink/60">{empty[source]}</div>}
      {!loading && pool.length > 0 && (
        <div className="mt-3 grid max-h-[38vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
          {pool.map((c) => {
            const idx = chosen.findIndex((x) => x.key === c.key)
            return (
              <button key={c.key} type="button" onClick={() => pick(c)} aria-pressed={idx >= 0} className="press relative text-left" aria-label={idx >= 0 ? `Remove ${c.label}` : `Choose ${c.label}`}>
                {c.items && !(c.imageUrl && c.key.startsWith('l-')) ? (
                  <Arch aspect="aspect-[4/5]" bright={idx >= 0}>
                    <FlatLay items={c.items} frameRatio={0.8} />
                  </Arch>
                ) : (
                  <Arch aspect="aspect-[4/5]" bright={idx >= 0}>
                    <img src={resolveImageUrl(c.imageUrl ?? '')} alt={c.label} loading="lazy" className={`relative z-[1] h-full w-full ${source === 'pieces' ? 'object-contain p-[10%]' : 'object-cover'}`} />
                  </Arch>
                )}
                {idx >= 0 && <span className="absolute right-1.5 top-1.5 z-[3] flex h-6 w-6 items-center justify-center rounded-[3px] bg-iris text-[11px] font-semibold text-on-brass">{'ABC'[idx]}</span>}
                <p className="mt-1 truncate text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/55">{c.label}</p>
              </button>
            )
          })}
        </div>
      )}

      <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={140} className="field mt-4 !text-sm" placeholder="Which one should I wear? (optional)" />

      {/* who */}
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">Ask</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            ['circle', 'Everyone'],
            ['friends', 'A few friends'],
            ['link', 'Just a link'],
          ] as [PollAudience, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setAudience(k)} aria-pressed={audience === k} className="chip">
            {l}
          </button>
        ))}
      </div>
      {audience === 'friends' && (
        <div className="mt-2">
          {people === null && <Spinner className="h-4 w-4" />}
          {people && people.length === 0 && <p className="text-xs text-ink/50">Follow a few people first; they’ll appear here.</p>}
          {people && people.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {people.slice(0, 24).map((p) => (
                <button key={p.handle} type="button" onClick={() => setFriends((f) => (f.includes(p.handle) ? f.filter((x) => x !== p.handle) : f.length >= 8 ? f : [...f, p.handle]))} aria-pressed={friends.includes(p.handle)} className="chip !h-8 !text-xs">
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-ink/45">They’re told; the rest of the circle isn’t.</p>
        </div>
      )}
      {audience === 'link' && <p className="mt-2 text-xs text-ink/45">Only people with the link see it. You still see who voted, if they’re members.</p>}

      {/* how long */}
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.28em] text-brass">For</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXPIRIES.map((e) => (
          <button key={e.key} type="button" onClick={() => setExpiry(e.key)} aria-pressed={expiry === e.key} className="chip">
            {e.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 alert-error">{error}</p>}
      <div className="action-row mt-5">
        <button type="button" disabled={chosen.length < 2 || sending} onClick={() => void ask()} className="btn-primary disabled:opacity-40">
          {sending ? 'Asking…' : `Ask (${chosen.length}/3)`}
        </button>
        <button type="button" onClick={onClose} className="btn-quiet">
          Cancel
        </button>
      </div>
    </Modal>
  )
}
