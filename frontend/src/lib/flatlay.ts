// The flat-lay: a deterministic composition for a look made of items.
//
// Every piece is sized by its real-world height (a pair of jeans is about
// a body long, a crop top a third of that, sneakers a quarter), its width
// following the image's own proportions. Pieces are anchored in body order
// (the upper garment leads, trousers hang from its hem, shoes beside the
// hem, small things at the edges), then the whole cluster is scaled and
// centred to fit the frame. Same items, same board, and nothing ever runs
// off the edge.

export interface LayoutItem {
  category: string
  subtype: string | null
  /** Image height ÷ width. Measured from the image; a role default until then. */
  aspect?: number
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
  if (c === 'bottom' || /trouser|pant|jean|skirt|short|chino|legging/.test(s)) return 'bottom'
  if (c === 'footwear' || /shoe|sneaker|boot|heel|pump|loafer|sandal|flip|trainer/.test(s)) return 'footwear'
  if (/bag|tote|clutch|backpack|purse/.test(s)) return 'bag'
  if (/earring|necklace|ring|bracelet|watch|jewel|pendant|brooch/.test(s)) return 'jewel'
  if (/hat|cap|beanie|beret/.test(s)) return 'hat'
  if (/sunglass|glasses|shades/.test(s)) return 'glasses'
  if (c === 'accessory' || c === 'other') return 'small'
  return 'top'
}

/** Real-world height of a piece, in body units (1 = a full leg length). */
export function bodyHeight(item: LayoutItem): number {
  const r = roleOf(item)
  const s = (item.subtype ?? '').toLowerCase()
  switch (r) {
    case 'outerwear':
      return /coat|trench|parka/.test(s) ? 0.95 : 0.76
    case 'top':
      if (/crop|cami|bralette|tube/.test(s)) return 0.36
      if (/tank|vest/.test(s)) return 0.5
      if (/shirt|blouse|sweater|jumper|knit|hoodie/.test(s)) return 0.6
      return 0.55
    case 'dress':
      return /mini/.test(s) ? 0.9 : 1.25
    case 'bottom':
      if (/short/.test(s)) return 0.45
      if (/mini/.test(s)) return 0.42
      if (/skirt/.test(s)) return 0.7
      return 1.0
    case 'footwear':
      return /boot/.test(s) ? 0.38 : 0.3
    case 'bag':
      return /clutch/.test(s) ? 0.2 : /backpack/.test(s) ? 0.45 : 0.36
    case 'glasses':
      return 0.13
    case 'hat':
      return 0.24
    case 'jewel':
      return 0.12
    default:
      return 0.2
  }
}

/** A sensible image aspect (h ÷ w) per role, used until the image is measured. */
export function defaultAspect(item: LayoutItem): number {
  switch (roleOf(item)) {
    case 'outerwear':
      return 1.05
    case 'top':
      return 0.95
    case 'dress':
      return 1.7
    case 'bottom':
      return 1.9
    case 'footwear':
      return 0.85
    case 'bag':
      return 1.0
    case 'glasses':
      return 0.4
    case 'hat':
      return 0.75
    default:
      return 1.0
  }
}

/** Widest a piece may be, in body units, so a cropped image can't dominate. */
function maxWidth(role: Role): number {
  switch (role) {
    case 'outerwear':
      return 0.72
    case 'top':
      return 0.62
    case 'dress':
      return 0.66
    case 'bottom':
      return 0.5
    case 'footwear':
      return 0.4
    case 'bag':
      return 0.38
    case 'glasses':
      return 0.3
    case 'hat':
      return 0.3
    case 'jewel':
      return 0.18
    default:
      return 0.28
  }
}

export interface Placed {
  index: number
  role: Role
  /** % of the frame's width / height. */
  left: number
  top: number
  w: number
  h: number
  rot: number
  z: number
}

interface Box {
  index: number
  role: Role
  x: number
  y: number
  w: number
  h: number
  rot: number
  z: number
}

/**
 * Lay a look out inside a frame of the given width÷height ratio.
 * Positions are computed in body units, then the cluster is fitted.
 */
export function composeLook(items: LayoutItem[], frameRatio = 1.25, margin = 0.05): Placed[] {
  if (items.length === 0) return []
  const roles = items.map(roleOf)
  const size = items.map((it, i) => {
    const a = it.aspect && it.aspect > 0 ? it.aspect : defaultAspect(it)
    let h = bodyHeight(it)
    let w = h / a
    const cap = maxWidth(roles[i])
    if (w > cap) {
      w = cap
      h = w * a
    }
    return { h, w }
  })
  const first = (r: Role) => roles.indexOf(r)
  const boxes: Box[] = []
  const used = new Set<number>()
  const put = (index: number, x: number, y: number, rot: number, z: number): Box | null => {
    if (index < 0 || used.has(index)) return null
    used.add(index)
    const b: Box = { index, role: roles[index], x, y, w: size[index].w, h: size[index].h, rot, z }
    boxes.push(b)
    return b
  }
  const GAP = 0.045

  const iOuter = first('outerwear')
  const iTop = first('top')
  const iDress = first('dress')
  const iBottom = first('bottom')
  const iShoes = first('footwear')
  const iBag = first('bag')

  let lead: Box | null = null
  let bottom: Box | null = null

  if (iDress >= 0) {
    lead = put(iDress, 0, 0, -3, 5)
    const beside = iOuter >= 0 && lead ? put(iOuter, lead.w + GAP, 0.1, 5, 4) : null
    if (iShoes >= 0 && lead) put(iShoes, (beside ? beside.x : lead.w + GAP) + 0.04, lead.h - size[iShoes].h - 0.04, -12, 6)
  } else if (iOuter >= 0 || iTop >= 0) {
    const iLead = iOuter >= 0 ? iOuter : iTop
    lead = put(iLead, 0, 0, -4, 5)
    if (iOuter >= 0 && iTop >= 0 && lead) put(iTop, lead.w + GAP * 0.6, 0.08, 5, 4)
    if (iBottom >= 0 && lead) {
      // Trousers hang from the hem, a touch right of centre, tucked under it.
      const bw = size[iBottom].w
      bottom = put(iBottom, lead.x + lead.w * 0.5 - bw * 0.42, lead.h - 0.1, 2, 3)
    }
    if (iShoes >= 0) {
      const ref = bottom ?? lead
      if (ref) put(iShoes, ref.x + ref.w - 0.03, ref.y + ref.h - size[iShoes].h * 0.85, -12, 6)
    }
  } else {
    if (iBottom >= 0) bottom = put(iBottom, 0, 0, -2, 3)
    // A bag beside the hip, then the shoes beside the hem, never on the bag.
    const bag = iBag >= 0 && bottom ? put(iBag, bottom.w + GAP, 0.05, 5, 4) : null
    if (iShoes >= 0 && bottom) {
      const y = Math.max(bottom.h - size[iShoes].h - 0.02, bag ? bag.y + bag.h + GAP : 0)
      put(iShoes, bottom.w + GAP, y, -12, 6)
    }
    if (iShoes >= 0 && !bottom) put(iShoes, 0, 0, -12, 6)
  }

  // The right column: glasses above, bag below, beside the upper garments.
  const upperRight = boxes.filter((b) => b.y < 0.5).map((b) => b.x + b.w)
  const colX = (upperRight.length ? Math.max(...upperRight) : 0) + GAP
  let colY = 0.02
  const iGlasses = first('glasses')
  if (iGlasses >= 0 && !used.has(iGlasses)) {
    const g = put(iGlasses, colX - 0.02, colY, 10, 6)
    if (g) colY = g.y + g.h + GAP
  }
  if (iBag >= 0 && !used.has(iBag)) {
    const b = put(iBag, colX - 0.035, Math.max(colY, 0.34), 5, 4)
    if (b) colY = b.y + b.h + GAP
  }
  const iHat = first('hat')
  if (iHat >= 0 && !used.has(iHat) && lead) put(iHat, lead.w * 0.55, -size[iHat].h * 0.7, -8, 6)

  // Small things sit at the left edge, beside the trousers.
  const leftRef = bottom ?? lead
  let leftY = leftRef ? leftRef.y + 0.12 : 0
  const leftX = leftRef ? leftRef.x - GAP : 0
  items.forEach((_, index) => {
    if (used.has(index)) return
    const r = roles[index]
    if (r === 'jewel' || r === 'small') {
      const b = put(index, leftX - size[index].w, leftY, -6, 6)
      if (b) leftY = b.y + b.h + GAP
    }
  })
  // Whatever is left (a second top, a second pair of shoes) lines up under the cluster.
  let extraX = 0
  const floor = (boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) : 0) + GAP
  items.forEach((_, index) => {
    if (used.has(index)) return
    const b = put(index, extraX, floor, 0, 2)
    if (b) extraX += b.w + GAP
  })

  // Fit: scale and centre the cluster inside the frame (frame height = 1).
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  const cw = maxX - minX
  const ch = maxY - minY
  const availW = frameRatio * (1 - 2 * margin)
  const availH = 1 - 2 * margin
  const scale = Math.min(availW / cw, availH / ch)
  const offX = (frameRatio - cw * scale) / 2 - minX * scale
  const offY = (1 - ch * scale) / 2 - minY * scale

  return boxes.map((b) => ({
    index: b.index,
    role: b.role,
    left: ((b.x * scale + offX) / frameRatio) * 100,
    top: (b.y * scale + offY) * 100,
    w: ((b.w * scale) / frameRatio) * 100,
    h: b.h * scale * 100,
    rot: b.rot,
    z: b.z,
  }))
}

/** Dressing order for the recipe strip: outer, top, bottom, shoes, then extras. */
const ORDER: Role[] = ['outerwear', 'dress', 'top', 'bottom', 'footwear', 'bag', 'hat', 'glasses', 'jewel', 'small']
export function dressingOrder<T extends LayoutItem>(items: T[]): T[] {
  return [...items].sort((a, b) => ORDER.indexOf(roleOf(a)) - ORDER.indexOf(roleOf(b)))
}
