// The flat-lay: a deterministic composition for a look made of items, in
// the language of an editorial "outfit board": pieces sit on a grid in
// body order (outer layer and top up top, bottoms below, shoes at the foot),
// side by side rather than piled, with even gutters and almost no rotation.
// Accessories stack in a narrow column at the edge. Same items, same board.
//
// Coordinates are % of a 5:4 frame.

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

// The board has three columns: the body column (left), a second column for
// the top-beside-the-jacket and the shoes, and an accessory rail at the
// right edge. Widths are chosen so the largest garment reads largest.
const RAIL_LEFT = 82
const RAIL_W = 15

// Accessory rail slots, top to bottom, roughly by real size.
const RAIL: Record<Exclude<Role, 'outerwear' | 'top' | 'dress' | 'bottom' | 'footwear'>, Slot> = {
  glasses: { left: RAIL_LEFT, top: 8, w: RAIL_W, h: 9, rot: 0, z: 4 },
  hat: { left: RAIL_LEFT, top: 20, w: RAIL_W, h: 14, rot: -4, z: 4 },
  bag: { left: RAIL_LEFT - 1, top: 36, w: RAIL_W + 2, h: 22, rot: 0, z: 4 },
  jewel: { left: RAIL_LEFT + 1, top: 62, w: RAIL_W - 2, h: 12, rot: 0, z: 4 },
  small: { left: RAIL_LEFT, top: 78, w: RAIL_W, h: 14, rot: 0, z: 4 },
}
// If the rail's natural slot is taken (two bags), fall down the rail.
const RAIL_FALLBACK: Slot[] = [
  { left: RAIL_LEFT, top: 50, w: RAIL_W, h: 12, rot: 0, z: 4 },
  { left: RAIL_LEFT, top: 90, w: RAIL_W, h: 9, rot: 0, z: 4 },
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
  const hasAcc = roles.some(isAcc)
  // With no accessories the rail's space goes back to the garments.
  const wide = !hasAcc

  if (hasDress) {
    // A dress carries the body column on its own; shoes and a bag beside.
    place(first('dress'), { left: 8, top: 4, w: wide ? 46 : 40, h: 92, rot: -1, z: 5 })
    if (hasOuter) place(first('outerwear'), { left: 52, top: 6, w: 28, h: 40, rot: 2, z: 4 })
    if (hasShoes) place(first('footwear'), { left: 52, top: hasOuter ? 58 : 52, w: 26, h: 28, rot: -6, z: 6 })
  } else if (hasOuter && hasTop) {
    // Jacket leads the body column; the top sits beside it, a touch smaller;
    // bottoms hang below the jacket, tucked just under its hem.
    place(first('outerwear'), { left: 5, top: 5, w: 40, h: 50, rot: -2, z: 5 })
    place(first('top'), { left: 48, top: 8, w: wide ? 34 : 30, h: 40, rot: 2, z: 4 })
    if (hasBottom) place(first('bottom'), { left: 11, top: 50, w: 30, h: 46, rot: 0, z: 3 })
    if (hasShoes) place(first('footwear'), { left: 49, top: 58, w: 28, h: 30, rot: -6, z: 6 })
  } else if (hasOuter || hasTop) {
    // One upper garment leads; bottoms below it; shoes take the second column.
    const lead = hasOuter ? first('outerwear') : first('top')
    place(lead, { left: 7, top: 5, w: wide ? 44 : 40, h: 50, rot: -2, z: 5 })
    if (hasBottom) place(first('bottom'), { left: 12, top: 50, w: 30, h: 46, rot: 0, z: 3 })
    if (hasShoes) place(first('footwear'), { left: 52, top: 54, w: 28, h: 30, rot: -6, z: 6 })
    // With no shoes the second column is free: a bag moves up there, large.
    if (!hasShoes && first('bag') >= 0) place(first('bag'), { left: 52, top: 14, w: 26, h: 34, rot: 2, z: 4 })
  } else {
    // Bottoms and shoes only: a pair, side by side.
    if (hasBottom) place(first('bottom'), { left: 12, top: 6, w: 34, h: 88, rot: -1, z: 3 })
    if (hasShoes) place(first('footwear'), { left: 52, top: 52, w: 28, h: 32, rot: -6, z: 6 })
  }

  // Accessories: the rail, each in its natural slot, extras falling down it.
  let fallback = 0
  const railTaken = new Set<string>()
  items.forEach((_, index) => {
    const r = roles[index]
    if (used.has(index) || !isAcc(r)) return
    const key = r as keyof typeof RAIL
    const slot = railTaken.has(key) ? RAIL_FALLBACK[fallback++ % RAIL_FALLBACK.length] : RAIL[key]
    railTaken.add(key)
    place(index, slot)
  })

  // Anything still unplaced (a second top, a second pair of shoes): a row
  // along the very bottom, small, so nothing is silently dropped.
  let extra = 0
  items.forEach((_, index) => {
    if (used.has(index)) return
    place(index, { left: 6 + (extra++ % 3) * 25, top: 86, w: 18, h: 12, rot: 0, z: 2 })
  })

  return out
}

/** Dressing order for the recipe strip: outer, top, bottom, shoes, then extras. */
const ORDER: Role[] = ['outerwear', 'dress', 'top', 'bottom', 'footwear', 'bag', 'hat', 'glasses', 'jewel', 'small']
export function dressingOrder<T extends LayoutItem>(items: T[]): T[] {
  return [...items].sort((a, b) => ORDER.indexOf(roleOf(a)) - ORDER.indexOf(roleOf(b)))
}
