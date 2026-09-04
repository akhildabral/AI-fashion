import { currencySymbol } from '@zauq/shared/money'
import { useState } from 'react'
import { Arch, Modal, Alert, EmptyState } from './ui'
import { resolveImageUrl } from '../lib/api'
import { updateWardrobeItem } from '@zauq/shared/wardrobe'
import type { WardrobeItem } from '@zauq/shared/types'

// Pricing the closet: a quick pass over pieces without a price, so the
// estate value and cost-per-wear can exist. Save as you go; skip anything.

export function PriceDrawer({
  open,
  items,
  onClose,
  onPriced,
}: {
  open: boolean
  items: WardrobeItem[]
  onClose: () => void
  onPriced: (id: string, price: number) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unpriced = items.filter((i) => i.price == null)

  async function save(item: WardrobeItem) {
    const raw = (drafts[item.id] ?? '').trim()
    const price = Number(raw)
    if (!raw || Number.isNaN(price) || price < 0) return
    setBusy(item.id)
    setError(null)
    try {
      await updateWardrobeItem(item.id, { price })
      onPriced(item.id, price)
      setDrafts((d) => {
        const next = { ...d }
        delete next[item.id]
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that price.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="What did these cost?">
      <p className="text-sm text-ink/60">
        A rough number is fine. Prices power your estate value and cost-per-wear; they’re only ever shown to you.
      </p>
      {unpriced.length === 0 ? (
        <EmptyState className="mt-6" line="Every piece has a price. Your estate value is on the mantel." />
      ) : (
        <ul className="mt-4 flex flex-col">
          {unpriced.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-t border-ink/10 py-3 first:border-t-0">
              <Arch aspect="aspect-[4/5]" className="w-12 shrink-0">
                <img src={resolveImageUrl(item.imageUrl)} alt="" className="relative z-[1] h-full w-full object-contain p-[10%]" />
              </Arch>
              <p className="min-w-0 flex-1 truncate text-sm font-medium capitalize text-ink">{item.subtype ?? item.category}</p>
              <label className="sr-only" htmlFor={`price-${item.id}`}>
                Price for {item.subtype ?? item.category}
              </label>
              {/* A small field with the currency inside it: 36 tall, the height sets the padding. */}
              <div className="flex h-9 items-center gap-1 rounded-[3px] border border-ink/15 bg-surface px-3 transition focus-within:border-iris/70 focus-within:ring-2 focus-within:ring-iris/20">
                <span className="text-[13px] text-ink/40">{currencySymbol()}</span>
                <input
                  id={`price-${item.id}`}
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={drafts[item.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save(item)
                  }}
                  className="w-20 border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink/35 sm:text-[13px]"
                  placeholder="0"
                />
              </div>
              <button
                type="button"
                disabled={busy === item.id || !(drafts[item.id] ?? '').trim()}
                onClick={() => void save(item)}
                className="btn-primary btn-sm"
              >
                {busy === item.id ? '…' : 'Save'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert className="mt-4">{error}</Alert>}
    </Modal>
  )
}
