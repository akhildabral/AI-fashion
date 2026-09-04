import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBasket, getWishlist } from '@zauq/shared/wardrobe'

// The closet, in the morning: one line when the basket is worth a load, one
// when a wishlist piece is still on your mind. Quiet when there's nothing.

interface Note {
  to: string
  eyebrow: string
  line: string
}

export function ClosetNotes() {
  const [notes, setNotes] = useState<Note[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([getBasket().catch(() => null), getWishlist().catch(() => null)]).then(([b, w]) => {
      if (!alive) return
      const out: Note[] = []
      if (b?.worthALoad) out.push({ to: '/closet/basket', eyebrow: 'The basket', line: `${b.counts.inWash} pieces in the wash. Worth a load; the stylist is working around them.` })
      const best = (w?.items ?? [])
        .map((i) => ({ i, v: (i as { verdict?: { outfits?: number } | null }).verdict }))
        .filter((x) => (x.v?.outfits ?? 0) >= 3)
        .sort((a, b) => (b.v?.outfits ?? 0) - (a.v?.outfits ?? 0))[0]
      if (best) {
        const label = [best.i.primaryColor, best.i.subtype ?? best.i.category].filter(Boolean).join(' ')
        out.push({ to: '/closet/wishlist', eyebrow: 'Still in mind', line: `The ${label} would make ${best.v?.outfits} outfits with what you own.` })
      }
      setNotes(out)
    })
    return () => {
      alive = false
    }
  }, [])

  if (notes.length === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-2">
      {notes.map((n) => (
        <Link key={n.to} to={n.to} className="plaque press flex animate-rise items-center justify-between gap-4 p-3.5 pl-5">
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/45">{n.eyebrow}</span>
            <span className="mt-0.5 block font-display text-base italic text-ink">{n.line}</span>
          </span>
          <span className="text-brass">→</span>
        </Link>
      ))}
    </div>
  )
}
