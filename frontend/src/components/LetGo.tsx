import { money } from '@zauq/shared/money'
import { useState } from 'react'
import { Modal } from './ui'
import { updateWardrobeItem, getResaleDraft } from '@zauq/shared/wardrobe'
import { copyText } from '../lib/clipboard'
import type { WardrobeItem } from '@zauq/shared/types'

// Let it go: an idle piece gets a decision, not a shelf. Lend it, retire it,
// or draft the listing that sells it.

export function LetGoModal({ item, onClose, onChanged, onNote }: { item: WardrobeItem | null; onClose: () => void; onChanged: (it: WardrobeItem) => void; onNote: (line: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ title: string; body: string; price?: string } | null>(null)

  async function setState(state: 'lent-out' | 'retired') {
    if (!item) return
    setBusy(state)
    try {
      const { item: updated } = await updateWardrobeItem(item.id, { state })
      onChanged(updated)
      onNote(state === 'lent-out' ? 'Marked lent out. It comes back from the basket.' : 'Retired. It stays in the ledger, out of the rotation.')
      onClose()
    } finally {
      setBusy(null)
    }
  }

  async function listing() {
    if (!item) return
    setBusy('listing')
    try {
      const { draft: d } = await getResaleDraft(item.id)
      setDraft({ title: d.title, body: d.description, price: d.suggestedPrice || undefined })
    } catch {
      onNote('Could not draft a listing right now.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={item !== null} onClose={onClose} title={item ? `Let the ${item.subtype ?? item.category} go?` : 'Let it go'}>
      {item && !draft && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink/60">It has been sitting. Three ways out, none of them final.</p>
          <button type="button" disabled={busy !== null} onClick={() => void setState('lent-out')} className="card card-hover press p-4 text-left disabled:cursor-not-allowed disabled:opacity-50">
            <span className="block font-display text-xl font-medium text-ink">Lend it out</span>
            <span className="mt-1 block text-xs text-ink/55">Goes to the basket as lent out; one tap brings it back.</span>
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void listing()} className="card card-hover press p-4 text-left disabled:cursor-not-allowed disabled:opacity-50">
            <span className="block font-display text-xl font-medium text-ink">{busy === 'listing' ? 'Drafting…' : 'Draft a listing'}</span>
            <span className="mt-1 block text-xs text-ink/55">The stylist writes the resale post from the photo and the tags.</span>
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void setState('retired')} className="card card-hover press p-4 text-left disabled:cursor-not-allowed disabled:opacity-50">
            <span className="block font-display text-xl font-medium text-ink">Retire it</span>
            <span className="mt-1 block text-xs text-ink/55">Out of the rotation, kept in the ledger.</span>
          </button>
        </div>
      )}
      {draft && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">Listing draft</p>
          <p className="mt-2 font-display text-xl font-medium text-ink">{draft.title}</p>
          {draft.price && <p className="mt-1 text-sm text-brass-ink">Ask {money(Number(draft.price) || 0)}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink/70">{draft.body}</p>
          <div className="action-row mt-4">
            <button
              type="button"
              onClick={() => void copyText(`${draft.title}\n\n${draft.body}${draft.price ? `\n\n${money(Number(draft.price) || 0)}` : ''}`).then((ok) => onNote(ok ? 'Listing copied. Paste it where you sell.' : 'Could not copy.'))}
              className="btn-primary btn-sm"
            >
              Copy the listing
            </button>
            <button type="button" onClick={() => setDraft(null)} className="btn-quiet btn-quiet-sm">
              Back
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
