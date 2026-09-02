import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arch, Modal } from './ui'
import { Spinner } from './Spinner'
import { resolveImageUrl } from '../lib/api'
import { clearLookPhoto, getMyRecentLooks, setLookPhoto, setLookPhotoFromRender, shareLook, unshareLook, type MyLook } from '../lib/circle'
import { getTryOns } from '../lib/tryon'
import { getWardrobe } from '../lib/wardrobe'
import { createPoll } from '../lib/polls'
import type { TryOn, WardrobeItem } from '../lib/types'

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

type Source = 'renders' | 'closet'

export function AskCircleModal({ open, onClose, onAsked }: { open: boolean; onClose: () => void; onAsked: () => void }) {
  const [source, setSource] = useState<Source>('renders')
  const [renders, setRenders] = useState<TryOn[] | null>(null)
  const [closet, setCloset] = useState<WardrobeItem[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen([])
    setQuestion('')
    setError(null)
    setRenders(null)
    setCloset(null)
    void getTryOns()
      .then((r) => {
        setRenders(r.tryOns)
        if (r.tryOns.length < 2) setSource('closet')
      })
      .catch(() => {
        setRenders([])
        setSource('closet')
      })
    void getWardrobe()
      .then((r) => setCloset(r.items.filter((i) => i.status === 'ready')))
      .catch(() => setCloset([]))
  }, [open])

  const pool: { id: string; imageUrl: string; label: string }[] =
    source === 'renders'
      ? (renders ?? []).map((r) => ({ id: r.imageUrl, imageUrl: r.imageUrl, label: 'Render' }))
      : (closet ?? []).map((i) => ({ id: i.imageUrl, imageUrl: i.imageUrl, label: i.subtype ?? i.category }))

  function pick(url: string) {
    setChosen((c) => (c.includes(url) ? c.filter((x) => x !== url) : c.length >= 3 ? c : [...c, url]))
  }

  async function ask() {
    if (chosen.length < 2 || sending) return
    setSending(true)
    setError(null)
    try {
      await createPoll({ imageUrls: chosen, question: question.trim() || undefined, expiresInMinutes: 24 * 60 })
      onAsked()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the verdict.')
    } finally {
      setSending(false)
    }
  }

  const loading = source === 'renders' ? renders === null : closet === null

  return (
    <Modal open={open} onClose={onClose} title="Ask the circle">
      <p className="text-sm text-ink/60">Pick two or three, ask which. Your circle votes; you see the verdict.</p>

      <div role="tablist" aria-label="Choose from" className="tabs mt-4">
        {(['renders', 'closet'] as Source[]).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={source === s}
            onClick={() => {
              setSource(s)
              setChosen([])
            }}
            className="tab press"
          >
            {s === 'renders' ? 'Mirror renders' : 'Closet pieces'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-10 text-center text-ink/40">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {!loading && pool.length < 2 && (
        <div className="mt-4 rounded-[3px] border border-dashed border-ink/20 p-6 text-center text-sm text-ink/60">
          {source === 'renders' ? (
            <>
              You need two renders to compare.{' '}
              <Link to="/mirror" onClick={onClose} className="font-semibold text-brass hover:underline">
                Try a look in the Mirror
              </Link>
              .
            </>
          ) : (
            'Add a few pieces to your closet first.'
          )}
        </div>
      )}
      {!loading && pool.length >= 2 && (
        <div className="mt-4 grid max-h-[40vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
          {pool.map((p) => {
            const idx = chosen.indexOf(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                aria-pressed={idx >= 0}
                className="press relative text-left"
                aria-label={idx >= 0 ? `Remove ${p.label}` : `Choose ${p.label}`}
              >
                <Arch aspect={source === 'renders' ? 'aspect-[3/4]' : 'aspect-[4/5]'} bright={idx >= 0}>
                  <img
                    src={resolveImageUrl(p.imageUrl)}
                    alt={p.label}
                    loading="lazy"
                    className={`relative z-[1] h-full w-full ${source === 'renders' ? 'object-cover' : 'object-contain p-[10%]'}`}
                  />
                </Arch>
                {idx >= 0 && (
                  <span className="absolute right-1.5 top-1.5 z-[3] flex h-6 w-6 items-center justify-center rounded-[3px] bg-iris text-[11px] font-bold text-[rgb(26_21_9)]">
                    {'ABC'[idx]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={140}
          className="field flex-1 !py-2 !text-sm"
          placeholder="Which one should I wear? (optional)"
        />
        <button type="button" disabled={chosen.length < 2 || sending} onClick={() => void ask()} className="btn-primary btn-sm disabled:opacity-40">
          {sending ? 'Asking…' : `Ask (${chosen.length}/3)`}
        </button>
      </div>
      {error && <p className="mt-2 alert-error">{error}</p>}
    </Modal>
  )
}
