// (Mirror of frontend/src/lib/flatlay.ts — keep in sync.)
// The flat-lay: a deterministic composition for a look made of items.
// Every category has a home in a 4:3 frame (percent units), the way pieces
// would be laid on a table: the outer layer left and large with the top
// tucked beneath, bottoms descending to the right, footwear at the hem,
// small things in the margins. Same items always lay out the same way.

export interface Slot {
  left: number
  top: number
  w: number
  h: number
  rot: number
  z: number
}

export interface LayoutItem {
  category: string
  subtype: string | null
}

export type Role =
  | 'outerwear'
  | 'top'
  | 'dress'
  | 'bottom'
  | 'footwear'
  | 'bag'
  | 'jewel'
  | 'hat'
  | 'glasses'
  | 'small'

export function roleOf(item: LayoutItem): Role {
  const c = (item.category ?? '').toLowerCase()
  const s = (item.subtype ?? '').toLowerCase()
  if (c === 'outerwear' || /blazer|jacket|coat|trench|cardigan|overshirt|parka/.test(s)) return 'outerwear'
  if (c === 'dress' || /dress|jumpsuit|gown|romper/.test(s)) return 'dress'
  if (c === 'bottom' || /trouser|pant|jean|skirt|short|chino/.test(s)) return 'bottom'
  if (c === 'footwear' || /shoe|sneaker|boot|heel|pump|loafer|sandal|flip/.test(s)) return 'footwear'
  if (/bag|tote|clutch|backpack|purse/.test(s)) return 'bag'
  if (/earring|necklace|ring|bracelet|watch|jewel|pendant|brooch/.test(s)) return 'jewel'
  if (/hat|cap|beanie|beret/.test(s)) return 'hat'
  if (/sunglass|glasses|shades/.test(s)) return 'glasses'
  if (c === 'accessory' || c === 'other') return 'small'
  return 'top'
}

// Slot table for the full composition. Values are % of a 4:3 frame.
const FULL: Record<Role, Slot> = {
  outerwear: { left: 3, top: 7, w: 46, h: 68, rot: -6, z: 5 },
  top: { left: 24, top: 12, w: 32, h: 54, rot: -1, z: 4 },
  dress: { left: 10, top: 4, w: 44, h: 84, rot: -3, z: 5 },
  bottom: { left: 44, top: 8, w: 36, h: 64, rot: 6, z: 3 },
  footwear: { left: 56, top: 58, w: 33, h: 38, rot: -12, z: 6 },
  bag: { left: 70, top: 4, w: 27, h: 34, rot: 8, z: 4 },
  jewel: { left: 8, top: 70, w: 15, h: 24, rot: -8, z: 6 },
  hat: { left: 1, top: 1, w: 21, h: 22, rot: -10, z: 6 },
  glasses: { left: 78, top: 42, w: 19, h: 14, rot: 14, z: 6 },
  small: { left: 33, top: 74, w: 24, h: 22, rot: 4, z: 5 },
}

// When there's no outer layer the top takes its place and everything
// closes in a little so two or three pieces still fill the frame.
const TOP_LEAD: Slot = { left: 5, top: 7, w: 46, h: 64, rot: -4, z: 5 }
const BOTTOM_LEAD: Slot = { left: 40, top: 6, w: 42, h: 76, rot: 5, z: 3 }

// Where extra pieces of an already-filled role go, in order.
const OVERFLOW: Slot[] = [
  { left: 2, top: 44, w: 17, h: 22, rot: -6, z: 6 },
  { left: 80, top: 62, w: 18, h: 20, rot: 10, z: 6 },
  { left: 60, top: 32, w: 18, h: 20, rot: 3, z: 2 },
]

export interface Placed extends Slot {
  index: number
  role: Role
}

export function composeLook(items: LayoutItem[]): Placed[] {
  const roles = items.map(roleOf)
  const has = (r: Role) => roles.includes(r)
  const seen = new Map<Role, number>()
  let overflow = 0
  const out: Placed[] = []

  items.forEach((_, index) => {
    const role = roles[index]
    const nth = seen.get(role) ?? 0
    seen.set(role, nth + 1)

    let slot: Slot | undefined
    if (nth === 0) {
      if (role === 'top' && !has('outerwear')) slot = TOP_LEAD
      else if (role === 'bottom' && !has('outerwear') && !has('top') && !has('dress')) slot = BOTTOM_LEAD
      else if (role === 'bottom' && !has('outerwear')) slot = { ...FULL.bottom, left: 42, w: 38, h: 68 }
      else slot = FULL[role]
    } else {
      // A second of the same kind sits just behind and beside the first.
      const base = FULL[role]
      slot = nth === 1 ? { ...base, left: base.left + 9, top: base.top + 7, z: base.z - 1, rot: base.rot + 5 } : OVERFLOW[overflow++ % OVERFLOW.length]
    }
    out.push({ ...slot, index, role })
  })
  return out
}

/** Dressing order for the recipe strip: outer, top, bottom, shoes, then extras. */
const ORDER: Role[] = ['outerwear', 'dress', 'top', 'bottom', 'footwear', 'bag', 'hat', 'glasses', 'jewel', 'small']
export function dressingOrder<T extends LayoutItem>(items: T[]): T[] {
  return [...items].sort((a, b) => ORDER.indexOf(roleOf(a)) - ORDER.indexOf(roleOf(b)))
}
