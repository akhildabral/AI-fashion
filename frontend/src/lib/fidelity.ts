import type { TryOn } from '@zauq/shared/types'

// The Mirror's second look, in a line: which pieces didn't take. Honest,
// short, and silent when everything took or nothing was checked. Shared by
// the Mirror and the Fitting Room's "See it on you".

function label(p: { category: string; subtype: string | null }) {
  return p.subtype ?? p.category
}

export function fidelityLine(t: Pick<TryOn, 'fidelity' | 'items'>): string | null {
  const f = t.fidelity
  if (!f || !f.checked || !f.garments) return null
  const missed = f.garments.filter((g) => {
    if (g.present && g.matches.colour && g.matches.sleeveOrLength && g.matches.silhouette && g.matches.print) return false
    return !(f.shoesOutOfFrame && g.slot === 'shoes')
  })
  if (missed.length === 0) return f.shoesOutOfFrame ? 'Your reflection stops above the feet, so the shoes are not in it.' : null
  const names = missed.map((g) => {
    const item = t.items?.find((i) => i.id === g.itemId)
    return item ? label(item) : `the ${g.slot}`
  })
  const what = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${what.charAt(0).toUpperCase()}${what.slice(1)} did not quite take${f.attempts > 1 ? ', even on a second pass' : ''}. Try again, or flag it as not your clothes.`
}
