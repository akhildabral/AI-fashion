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

// Slots are left/top/width (% of the frame) plus rotation and stacking
// order; height follows each image's own proportions. Pieces cluster
// around the centre so the board never has an empty side, shoes stay clear
// of the trouser hem, and small things sit beside the lead garment.
const ACC: Record<Exclude<Role, 'outerwear' | 'top' | 'dress' | 'bottom' | 'footwear'>, Slot> = {
  glasses: { left: 74, top: 22, w: 12, h: 0, rot: 12, z: 6 },
  hat: { left: 28, top: 2, w: 16, h: 0, rot: -8, z: 6 },
  bag: { left: 72, top: 36, w: 20, h: 0, rot: 6, z: 4 },
  jewel: { left: 6, top: 58, w: 9, h: 0, rot: -6, z: 6 },
  small: { left: 6, top: 74, w: 14, h: 0, rot: 3, z: 5 },
}
// A second of the same accessory finds a free pocket of the frame.
const ACC_FALLBACK: Slot[] = [
  { left: 6, top: 40, w: 11, h: 0, rot: -4, z: 6 },
  { left: 80, top: 60, w: 12, h: 0, rot: 8, z: 6 },
  { left: 40, top: 88, w: 12, h: 0, rot: 2, z: 6 },
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
    place(first('dress'), { left: 24, top: 6, w: 38, h: 0, rot: -3, z: 5 })
    if (hasOuter) place(first('outerwear'), { left: 56, top: 12, w: 28, h: 0, rot: 6, z: 4 })
    if (hasShoes) place(first('footwear'), { left: 64, top: 66, w: 18, h: 0, rot: -12, z: 6 })
  } else if (hasOuter && hasTop) {
    // Jacket leads; the top shows its right half behind it; the trousers hang
    // from the hem, slightly right; shoes sit beside the hem, never on it.
    place(first('outerwear'), { left: 14, top: 7, w: 40, h: 0, rot: -4, z: 5 })
    place(first('top'), { left: 44, top: 11, w: 30, h: 0, rot: 5, z: 4 })
    if (hasBottom) place(first('bottom'), { left: 24, top: 52, w: 28, h: 0, rot: 3, z: 3 })
    if (hasShoes) place(first('footwear'), { left: 62, top: 64, w: 18, h: 0, rot: -12, z: 6 })
  } else if (hasOuter || hasTop) {
    // One upper garment leads, larger; trousers from its hem; shoes beside.
    const lead = hasOuter ? first('outerwear') : first('top')
    place(lead, { left: 18, top: 7, w: 42, h: 0, rot: -4, z: 5 })
    if (hasBottom) place(first('bottom'), { left: 30, top: 50, w: 30, h: 0, rot: 3, z: 3 })
    if (hasShoes) place(first('footwear'), { left: 66, top: 62, w: 18, h: 0, rot: -12, z: 6 })
    if (!hasShoes && first('bag') >= 0) place(first('bag'), { left: 66, top: 30, w: 22, h: 0, rot: 6, z: 4 })
  } else {
    // Bottoms lead: they take the centre-left, a bag beside the hip, shoes
    // beside the hem, so the board is balanced without an upper garment.
    if (hasBottom) place(first('bottom'), { left: 24, top: 8, w: 38, h: 0, rot: -2, z: 3 })
    if (first('bag') >= 0) place(first('bag'), { left: 64, top: 16, w: 24, h: 0, rot: 6, z: 4 })
    if (hasShoes) place(first('footwear'), { left: 60, top: 62, w: 20, h: 0, rot: -12, z: 6 })
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
    place(index, { left: 6 + (extra++ % 2) * 14, top: 86, w: 12, h: 0, rot: -3 + extra * 4, z: 2 })
  })

  return out
}

/** Dressing order for the recipe strip: outer, top, bottom, shoes, then extras. */
const ORDER: Role[] = ['outerwear', 'dress', 'top', 'bottom', 'footwear', 'bag', 'hat', 'glasses', 'jewel', 'small']
export function dressingOrder<T extends LayoutItem>(items: T[]): T[] {
  return [...items].sort((a, b) => ORDER.indexOf(roleOf(a)) - ORDER.indexOf(roleOf(b)))
}
