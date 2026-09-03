// The fitting's vocabulary, verbatim from the web's ProfilePage.
export const BUILDS = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const
export const TONES: [string, string][] = [
  ['fair', '#F3DCC8'],
  ['light', '#E6BE9A'],
  ['medium', '#C9946A'],
  ['tan', '#A06A45'],
  ['deep', '#5E3B2A'],
]
export const COLOURS: [string, string][] = [
  ['red', '#B8322E'],
  ['orange', '#D9782D'],
  ['yellow', '#E3C24B'],
  ['green', '#4E7A4B'],
  ['teal', '#2F7F84'],
  ['blue', '#3459A8'],
  ['purple', '#6E4B9E'],
  ['pink', '#D98AA9'],
  ['brown', '#7A5230'],
  ['neon', '#B6F53A'],
]
export const INTENTS: [string, string][] = [
  ['decided', 'Decided for me'],
  ['own', 'Wearing what I own, better'],
  ['friends', 'Dressed by my friends'],
]
export const DAYS: [string, string][] = [
  ['work', 'Work'],
  ['casual', 'Weekends'],
  ['evening', 'Evenings out'],
  ['occasion', 'Occasions'],
  ['athletic', 'Training'],
]
export const VIBES = ['minimal', 'classic', 'streetwear', 'bohemian', 'formal', 'sporty', 'edgy'] as const
export const BUDGETS: [string, string][] = [
  ['budget', 'Carefully'],
  ['mid', 'Mid-range'],
  ['premium', 'Premium'],
  ['luxury', 'Luxury'],
]
export const WHO: [string, string][] = [
  ['female', 'Her'],
  ['male', 'Him'],
  ['unisex', 'Either'],
]
export const TOP_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
export const BOTTOM_SIZES = ['24', '26', '28', '30', '32', '34', '36', '38', '40']
export const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']

export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Height reads in the member's units; it is always stored in centimetres. */
export function heightLabel(cm: number, units: string | null | undefined): string {
  if (units === 'imperial') {
    const inches = Math.round(cm / 2.54)
    return `${Math.floor(inches / 12)}′ ${inches % 12}″`
  }
  return `${cm} cm`
}

export const HEIGHT_MIN = 140
export const HEIGHT_MAX = 210

/** The plan's public name, as the web prints it. */
export function planLabel(plan: string | undefined): string {
  const p = plan ?? 'free'
  return p === 'founder' ? 'Founding member' : p === 'free' ? 'Free' : title(p)
}
