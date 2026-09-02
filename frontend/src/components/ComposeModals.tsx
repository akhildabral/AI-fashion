import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arch, Modal } from './ui'
import { Spinner } from './Spinner'
import { resolveImageUrl } from '../lib/api'
import { getMyRecentLooks, shareLook, unshareLook, type MyLook } from '../lib/circle'
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
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLooks(null)
    void getMyRecentLooks().then((r) => setLooks(r.looks)).catch(() => setLooks([]))
  }, [open])

  async function toggle(look: MyLook) {
    setBusy(look.id)
    try {
      if (look.shared) await unshareLook(look.id)
      else await shareLook(look.id)
      setLooks((ls) => (ls ? ls.map((l) => (l.id === look.id ? { ...l, shared: !l.shared } : l)) : ls))
      onShared()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share a look">
      <p className="text-sm text-ink/60">Your recent wears. Put one on the circle — friends can react, recreate it, and save it.</p>
      {looks === null && (
        <div className="py-10 text-center text-ink/40">
          <Spinner className="h-5 w-5" />
        </div>
      )}
      {looks && looks.length === 0 && (
        <div className="mt-4 rounded-[3px] border border-dashed border-ink/20 p-6 text-center">
          <p className="text-sm text-ink/60">Nothing logged in the last two weeks.</p>
          <Link to="/" onClick={onClose} className="btn-primary mt-4 inline-flex !py-2 !text-xs">
            Wear today’s brief
          </Link>
        </div>
      )}
      {looks && looks.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {looks.map((l) => (
            <li key={l.id} className="flex items-center gap-3 border-t border-ink/10 pt-3 first:border-t-0 first:pt-0">
              <div className="flex gap-1.5">
                {l.items.slice(0, 3).map((it) => (
                  <Arch key={it.id} aspect="aspect-[4/5]" className="w-11">
                    <img src={resolveImageUrl(it.imageUrl)} alt={it.subtype ?? it.category} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                  </Arch>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{dayLabel(l.wornOn)}</p>
                <p className="text-xs text-ink/50">
                  {l.items.length} piece{l.items.length === 1 ? '' : 's'}
                  {l.eventType ? ` · ${l.eventType}` : ''}
                  {l.shared ? ' · on the circle' : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === l.id}
                onClick={() => void toggle(l)}
                className={l.shared ? 'btn-ghost !px-3 !py-2 !text-xs' : 'btn-primary !px-3 !py-2 !text-xs'}
              >
                {busy === l.id ? '…' : l.shared ? 'Take down' : 'Share'}
              </button>
            </li>
          ))}
        </ul>
      )}
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

      <div role="tablist" aria-label="Choose from" className="mt-4 inline-flex rounded-[3px] border border-ink/15 bg-surface p-1">
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
            className={`rounded-[2px] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              source === s ? 'bg-brass text-[rgb(26_21_9)]' : 'text-ink/55 hover:text-ink'
            }`}
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
        <button type="button" disabled={chosen.length < 2 || sending} onClick={() => void ask()} className="btn-primary !py-2 !text-sm disabled:opacity-40">
          {sending ? 'Asking…' : `Ask (${chosen.length}/3)`}
        </button>
      </div>
      {error && <p className="mt-2 alert-error">{error}</p>}
    </Modal>
  )
}
