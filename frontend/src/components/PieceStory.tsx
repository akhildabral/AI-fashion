import { useEffect, useState } from 'react'
import { getStory, type StoryResponse } from '../lib/outfits'
import { resolveImageUrl } from '../lib/api'

// A piece's story: when it was last worn, what it's worn with, what it's
// cost you per wear. The numbers already existed in the API; this is the
// first time the piece itself tells them.

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} days ago`
  if (d < 365) return `${Math.round(d / 30)} months ago`
  return `${Math.round(d / 365)} years ago`
}

export function PieceStory({ itemId }: { itemId: string }) {
  const [s, setS] = useState<StoryResponse | null>(null)
  useEffect(() => {
    let alive = true
    setS(null)
    getStory(itemId)
      .then((r) => alive && setS(r))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [itemId])
  if (!s) return null
  return (
    <section className="mt-5 border-t border-ink/10 pt-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/45">Its story</p>
      <p className="mt-1 font-display text-xl italic text-ink">
        {s.wearCount === 0
          ? 'Never worn yet.'
          : `Worn ${s.wearCount}×, last ${ago(s.lastWorn)}${s.costPerWear != null ? ` · ₹${s.costPerWear.toLocaleString('en-IN')} a wear` : ''}.`}
      </p>
      {s.wornWith.length > 0 && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <span className="flex-none text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">Worn with</span>
          {s.wornWith.map(({ item, times }) => (
            <div key={item.id} className="w-12 flex-none" title={`${item.subtype ?? item.category} · ${times}×`}>
              <div className="arch-bezel aspect-[5/6]">
                <div className="arch-niche flex h-full w-full items-center justify-center">
                  <img src={resolveImageUrl(item.imageUrl)} alt={item.subtype ?? item.category} className="relative z-[1] h-full w-full object-contain p-[10%]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {s.days.length > 0 && <p className="mt-2 text-xs text-ink/45">Mostly {s.days.map((d) => (d === 'casual' ? 'weekends' : d === 'work' ? 'workdays' : d === 'evening' ? 'evenings' : d)).join(', ')}.</p>}
    </section>
  )
}
