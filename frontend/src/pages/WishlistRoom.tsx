import { money } from '@zauq/shared/money'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { deleteWardrobeItem, getWishlist, updateWardrobeItem } from '@zauq/shared/wardrobe'
import { ClosetRooms, RoomMantel } from '../components/ClosetRooms'
import { PageShell, Toast, useFlash, SkeletonBlock, LoadError, UndoBar, Arch } from '../components/ui'
import { resolveImageUrl } from '../lib/api'
import type { WardrobeItem } from '@zauq/shared/types'

// Wishlist: pieces you don't own yet, each carrying its verdict. Ranked by
// what each one unlocks, not by when you added it.

interface Verdict {
  outfits: number
  pairs: number
  closetSize: number
  computedAt: string
}

function inr(n: number): string {
  return money(n)
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
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<{ item: WardrobeItem; timer: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await getWishlist()
      const withV = r.items.map((i) => ({ ...i, v: (i as WardrobeItem & { verdict?: Verdict | null }).verdict ?? null }))
      withV.sort((a, b) => (b.v?.outfits ?? -1) - (a.v?.outfits ?? -1))
      setItems(withV)
      setFailed(false)
    } catch {
      setFailed(true)
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
  // Deferred delete: the piece leaves the list now, but the server call waits
  // ~5s so an Undo can pull it back.
  function letGo(it: WardrobeItem) {
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

  const total = (items ?? []).reduce((s, i) => s + (i.seenPrice ?? 0), 0)

  return (
    <PageShell wide>
      <Toast msg={toast} />
      <RoomMantel
        eyebrow="The collection"
        title="Wishlist"
        line={items ? `${items.length} piece${items.length === 1 ? '' : 's'} in mind${total > 0 ? ` · ${inr(total)} if you bought them all` : ''}` : undefined}
        aside={
          items && items.length > 0 ? (
            <button type="button" onClick={() => navigate('/closet/store')} className="btn-ghost btn-sm">
              Point at a piece
            </button>
          ) : undefined
        }
      />
      <ClosetRooms current="wishlist" />

      {failed && !items && <LoadError message="Couldn’t load your wishlist. Check your connection and try again." onRetry={() => { setFailed(false); void load() }} />}

      {items === null && !failed && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card grid grid-cols-[96px_1fr] gap-4 p-4">
              <SkeletonBlock className="aspect-[5/6]" />
              <div className="flex flex-col gap-2">
                <SkeletonBlock className="h-5 w-3/4" />
                <SkeletonBlock className="h-4 w-1/2" />
                <SkeletonBlock className="mt-auto h-9 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!failed && items && items.length === 0 && (
        <div className="mt-10 max-w-lg animate-rise-1">
          <p className="empty-line">Nothing in mind yet.</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink/55">Next time you’re holding something in a shop, point the camera at it. The closet says how many outfits it makes before you pay for it, and “keep in mind” lands here.</p>
          <div className="action-row mt-4">
            <button type="button" onClick={() => navigate('/closet/store')} className="btn-primary">
              Point at a piece
            </button>
          </div>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="mt-8 grid animate-rise-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {items.map((it) => {
            const v = (it as WardrobeItem & { v?: Verdict | null }).v
            const label = [it.primaryColor, it.subtype ?? it.category].filter(Boolean).join(' ')
            return (
              <article key={it.id} className="card grid grid-cols-[96px_1fr] gap-4 p-4">
                <Link to={`/closet/store?item=${it.id}`} className="press block self-start">
                  <Arch aspect="aspect-[5/6]">
                    <img src={resolveImageUrl(it.imageUrl)} alt={label} className={`relative z-[1] h-full w-full object-contain p-[7%] ${it.status === 'processing' ? 'opacity-40 blur-[2px]' : ''}`} />
                    {it.status === 'processing' && (
                      <span className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--text-in-niche)]">
                        developing
                      </span>
                    )}
                  </Arch>
                </Link>
                <div className="min-w-0">
                  <p className="font-display text-xl font-medium leading-tight text-ink">{label}</p>
                  {v ? (
                    <p className="mt-1 text-sm text-ink/70">
                      <b className="text-brass-ink">{v.outfits} outfit{v.outfits === 1 ? '' : 's'}</b> · pairs with {v.pairs}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-ink/50">{it.status === 'processing' ? 'still developing' : 'verdict pending'}</p>
                  )}
                  <p className="mt-1 text-xs text-ink/50">
                    {it.seenAt ? `Seen ${when(it.seenAt)}` : 'Seen'}
                    {it.store ? ` at ${it.store}` : ''}
                    {it.seenPrice != null ? ` · ${inr(it.seenPrice)}` : ''}
                  </p>
                  {it.nudgeAt && <p className="mt-1 text-xs text-ink/45">Nudge on {new Date(it.nudgeAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>}
                  <div className="action-row mt-4">
                    <button type="button" disabled={busy === it.id} onClick={() => void bought(it)} className="btn-primary btn-sm">
                      Bought it
                    </button>
                    <Link to={`/closet/store?item=${it.id}`} className="btn-quiet btn-quiet-sm">
                      The verdict
                    </Link>
                    <button type="button" disabled={busy === it.id} onClick={() => void letGo(it)} className="btn-quiet btn-quiet-sm">
                      Let it go
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {pending && <UndoBar message={`${pending.item.subtype ?? pending.item.category} let go.`} onUndo={undoLetGo} />}
    </PageShell>
  )
}
