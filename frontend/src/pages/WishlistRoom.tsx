import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { deleteWardrobeItem, getWishlist, updateWardrobeItem } from '../lib/wardrobe'
import { ClosetRooms, RoomMantel } from '../components/ClosetRooms'
import { PageShell, Toast, useFlash } from '../components/ui'
import { Spinner } from '../components/Spinner'
import { resolveImageUrl } from '../lib/api'
import type { WardrobeItem } from '../lib/types'

// Wishlist: pieces you don't own yet, each carrying its verdict. Ranked by
// what each one unlocks, not by when you added it.

interface Verdict {
  outfits: number
  pairs: number
  closetSize: number
  computedAt: string
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function WishlistRoom() {
  usePageTitle('Wishlist')
  const navigate = useNavigate()
  const { toast, flash } = useFlash()
  const [items, setItems] = useState<WardrobeItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await getWishlist()
      const withV = r.items.map((i) => ({ ...i, v: (i as WardrobeItem & { verdict?: Verdict | null }).verdict ?? null }))
      withV.sort((a, b) => (b.v?.outfits ?? -1) - (a.v?.outfits ?? -1))
      setItems(withV)
    } catch {
      setItems([])
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function bought(it: WardrobeItem) {
    setBusy(it.id)
    try {
      await updateWardrobeItem(it.id, { owned: true })
      flash(`In the closet. The ${it.subtype ?? it.category} is a piece now.`)
      await load()
    } finally {
      setBusy(null)
    }
  }
  async function letGo(it: WardrobeItem) {
    setBusy(it.id)
    try {
      await deleteWardrobeItem(it.id)
      flash('Let go.')
      setItems((p) => (p ?? []).filter((x) => x.id !== it.id))
    } finally {
      setBusy(null)
    }
  }

  const total = (items ?? []).reduce((s, i) => s + (i.seenPrice ?? 0), 0)

  return (
    <PageShell wide>
      <Toast msg={toast} />
      <RoomMantel eyebrow="The collection" title="Wishlist" line={items ? `${items.length} piece${items.length === 1 ? '' : 's'} in mind${total > 0 ? ` · ${inr(total)} if you bought them all` : ''}` : undefined} />
      <ClosetRooms current="wishlist" />

      {items === null && (
        <div className="flex min-h-[40vh] items-center justify-center text-ink/50">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="mt-10 max-w-lg animate-rise-1">
          <p className="font-display text-2xl italic text-ink/70">Nothing in mind yet.</p>
          <p className="mt-2 text-sm text-ink/55">Next time you’re holding something in a shop, point the camera at it. The closet says how many outfits it makes before you pay for it, and “keep in mind” lands here.</p>
          <button type="button" onClick={() => navigate('/closet/store')} className="btn-primary mt-5">
            In the store
          </button>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="mt-8 grid animate-rise-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const v = (it as WardrobeItem & { v?: Verdict | null }).v
            const label = [it.primaryColor, it.subtype ?? it.category].filter(Boolean).join(' ')
            return (
              <article key={it.id} className="card grid grid-cols-[96px_1fr] gap-4 p-4">
                <Link to={`/closet/store?item=${it.id}`} className="press arch-bezel aspect-[5/6] self-start">
                  <div className="arch-niche h-full w-full">
                    <img src={resolveImageUrl(it.imageUrl)} alt={label} className={`relative z-[1] h-full w-full object-contain p-[8%] ${it.status === 'processing' ? 'opacity-40 blur-[2px]' : ''}`} />
                  </div>
                </Link>
                <div className="min-w-0">
                  <p className="font-display text-xl font-medium leading-tight text-ink">{label}</p>
                  {v ? (
                    <p className="mt-1 text-sm text-ink/70">
                      <b className="text-brass">{v.outfits} outfit{v.outfits === 1 ? '' : 's'}</b> · pairs with {v.pairs}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-ink/50">{it.status === 'processing' ? 'still developing' : 'verdict pending'}</p>
                  )}
                  <p className="mt-1 text-xs text-ink/50">
                    {it.seenAt ? `Seen ${when(it.seenAt)}` : 'Seen'}
                    {it.store ? ` at ${it.store}` : ''}
                    {it.seenPrice != null ? ` · ${inr(it.seenPrice)}` : ''}
                  </p>
                  {it.nudgeAt && <p className="mt-1 text-[11px] text-ink/45">Nudge on {new Date(it.nudgeAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy === it.id} onClick={() => void bought(it)} className="btn-primary !px-3 !py-1.5 !text-xs">
                      Bought it
                    </button>
                    <Link to={`/closet/store?item=${it.id}`} className="btn-ghost !px-3 !py-1.5 !text-xs">
                      The verdict
                    </Link>
                    <button type="button" disabled={busy === it.id} onClick={() => void letGo(it)} className="press ml-auto text-xs text-ink/40 hover:text-ink/70">
                      Let go
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
