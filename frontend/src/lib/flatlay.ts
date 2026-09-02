// The flat-lay: a deterministic, stacked composition for a look made of
// items. Same items, same board. See composeLook for the arrangement.

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
  if (c === 'outerwear' || /blazer|jacket|coat|trench|cardigan|overshirt|parka|hoodie|vest/.test(s)) return 'outerwear'
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

export interface Placed extends Slot {
  index: number
  role: Role
}

const isAcc = (r: Role) => r === 'bag' || r === 'jewel' || r === 'hat' || r === 'glasses' || r === 'small'

// A stacked flat-lay, in the language of the best outfit boards: the jacket
// leads, the shirt shows half behind it, the jeans tuck under the hem and
// swing right, the shoes cross the leg at the foot, the small things sit
// where a hand would leave them. Sizes follow the real world (shoes are
// about half a jacket wide, glasses a quarter). Nothing goes into the
// arch's rounded corners: anything above y=20 stays inside x=20..80.
//
// Coordinates are % of a 5:4 frame: left, top, width, height, rotation, z.

const ACC: Record<Exclude<Role, 'outerwear' | 'top' | 'dress' | 'bottom' | 'footwear'>, Slot> = {
  glasses: { left: 70, top: 16, w: 12, h: 8, rot: 12, z: 6 },
  hat: { left: 26, top: 3, w: 18, h: 12, rot: -8, z: 6 },
  bag: { left: 66, top: 30, w: 20, h: 26, rot: 6, z: 4 },
  jewel: { left: 8, top: 64, w: 10, h: 12, rot: -6, z: 6 },
  small: { left: 8, top: 80, w: 16, h: 12, rot: 3, z: 5 },
}
// A second of the same accessory finds a free pocket of the frame.
const ACC_FALLBACK: Slot[] = [
  { left: 8, top: 46, w: 12, h: 12, rot: -4, z: 6 },
  { left: 76, top: 52, w: 12, h: 12, rot: 8, z: 6 },
  { left: 40, top: 86, w: 14, h: 10, rot: 2, z: 6 },
]

export function composeLook(items: LayoutItem[]): Placed[] {
  const roles = items.map(roleOf)
  const first = (r: Role) => roles.indexOf(r)
  const out: Placed[] = []
  const used = new Set<number>()
  const place = (index: number, slot: Slot) => {
    if (index < 0 || used.has(index)) return
    used.add(index)
    out.push({ ...slot, index, role: roles[index] })
  }

  const hasOuter = first('outerwear') >= 0
  const hasTop = first('top') >= 0
  const hasDress = first('dress') >= 0
  const hasBottom = first('bottom') >= 0
  const hasShoes = first('footwear') >= 0

  if (hasDress) {
    // The dress is the spine; a jacket leans in from the right, shoes at the foot.
    place(first('dress'), { left: 22, top: 6, w: 40, h: 90, rot: -3, z: 5 })
    if (hasOuter) place(first('outerwear'), { left: 52, top: 10, w: 30, h: 42, rot: 6, z: 4 })
    if (hasShoes) place(first('footwear'), { left: 60, top: 66, w: 20, h: 24, rot: -14, z: 6 })
  } else if (hasOuter && hasTop) {
    // Jacket leads; the shirt shows its right half behind it, a touch lower;
    // the jeans tuck under the hem and swing right; shoes cross the leg.
    place(first('outerwear'), { left: 16, top: 8, w: 42, h: 54, rot: -5, z: 5 })
    place(first('top'), { left: 40, top: 12, w: 34, h: 46, rot: 6, z: 4 })
    if (hasBottom) place(first('bottom'), { left: 30, top: 46, w: 36, h: 52, rot: 4, z: 3 })
    if (hasShoes) place(first('footwear'), { left: 58, top: 70, w: 20, h: 24, rot: -14, z: 6 })
  } else if (hasOuter || hasTop) {
    // One upper garment leads, larger; jeans hang from its hem; shoes at the foot.
    const lead = hasOuter ? first('outerwear') : first('top')
    place(lead, { left: 18, top: 8, w: 44, h: 56, rot: -4, z: 5 })
    if (hasBottom) place(first('bottom'), { left: 36, top: 44, w: 36, h: 54, rot: 4, z: 3 })
    if (hasShoes) place(first('footwear'), { left: 60, top: 68, w: 20, h: 24, rot: -14, z: 6 })
    // No shoes: a bag takes the foot of the frame instead, larger.
    if (!hasShoes && first('bag') >= 0) place(first('bag'), { left: 62, top: 30, w: 22, h: 28, rot: 6, z: 4 })
  } else {
    // Bottoms and shoes only: the trousers stand tall, shoes at the hem.
    if (hasBottom) place(first('bottom'), { left: 30, top: 6, w: 36, h: 80, rot: -2, z: 3 })
    if (hasShoes) place(first('footwear'), { left: 56, top: 60, w: 20, h: 24, rot: -14, z: 6 })
  }

  // Accessories: each where a hand would leave it; a second finds a free pocket.
  let fallback = 0
  const taken = new Set<string>()
  items.forEach((_, index) => {
    const r = roles[index]
    if (used.has(index) || !isAcc(r)) return
    const key = r as keyof typeof ACC
    const slot = taken.has(key) ? ACC_FALLBACK[fallback++ % ACC_FALLBACK.length] : ACC[key]
    taken.add(key)
    place(index, slot)
  })

  // Anything still unplaced (a second top, a second pair of shoes): small,
  // along the bottom-left, so nothing is silently dropped.
  let extra = 0
  items.forEach((_, index) => {
    if (used.has(index)) return
    place(index, { left: 6 + (extra++ % 2) * 14, top: 86, w: 12, h: 12, rot: -3 + extra * 4, z: 2 })
  })

  return out
}

/** Dressing order for the recipe strip: outer, top, bottom, shoes, then extras. */
const ORDER: Role[] = ['outerwear', 'dress', 'top', 'bottom', 'footwear', 'bag', 'hat', 'glasses', 'jewel', 'small']
export function dressingOrder<T extends LayoutItem>(items: T[]): T[] {
  return [...items].sort((a, b) => ORDER.indexOf(roleOf(a)) - ORDER.indexOf(roleOf(b)))
}
