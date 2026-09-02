import { FlatLay } from './CircleCards'
import type { WardrobeItem } from '../lib/types'

// A look on its board: the flat-lay inside the arch, the frame every
// outfit in the product is shown in. Same engine as the Circle posts.

export function LookBoard({ items, ratio = '5 / 4', className = '' }: { items: Pick<WardrobeItem, 'id' | 'imageUrl' | 'subtype' | 'category'>[]; ratio?: string; className?: string }) {
  const [w, h] = ratio.split('/').map((n) => Number(n.trim()))
  return (
    <div className={`arch-bezel ${className}`} style={{ aspectRatio: ratio, ['--arch-h' as string]: `${(37.3 * (w / h)).toFixed(1)}%` }}>
      <div className="arch-niche h-full w-full">
        <FlatLay items={items.map((i) => ({ id: i.id, imageUrl: i.imageUrl, subtype: i.subtype, category: i.category }))} frameRatio={w / h} />
      </div>
    </div>
  )
}
