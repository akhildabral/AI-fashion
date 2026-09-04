import { FlatLay } from './CircleCards'
import type { WardrobeItem } from '@zauq/shared/types'

// A look on its board: the flat-lay inside the frame every outfit in the
// product is shown in. Same engine as the Circle posts.
//
// The arch is a portrait form — its crown is a semicircle of radius w/2, so
// --arch-h = 50% × (w/h) and 1/1 is the widest it may ever be. A wide board
// (the default 5/4) is a 3px rectangle with a hairline instead; the lit niche
// fill stays so the cut-outs sit in a vitrine.

export function LookBoard({ items, ratio = '5 / 4', className = '' }: { items: Pick<WardrobeItem, 'id' | 'imageUrl' | 'subtype' | 'category'>[]; ratio?: string; className?: string }) {
  const [w, h] = ratio.split('/').map((n) => Number(n.trim()))
  const arched = w <= h
  return (
    <div
      className={`${arched ? 'arch-bezel' : 'rect-frame'} ${className}`}
      style={{ aspectRatio: ratio, ...(arched ? { ['--arch-h' as string]: `${(50 * (w / h)).toFixed(1)}%` } : null) }}
    >
      <div className="arch-niche h-full w-full">
        <FlatLay items={items.map((i) => ({ id: i.id, imageUrl: i.imageUrl, subtype: i.subtype, category: i.category }))} frameRatio={w / h} />
      </div>
    </div>
  )
}
