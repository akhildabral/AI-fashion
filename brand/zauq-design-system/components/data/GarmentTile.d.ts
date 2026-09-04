/**
 * The one garment tile: a garment spotlit in an arched niche.
 * @startingPoint section="Data" subtitle="Garment tiles and stat figures" viewport="700x340"
 */
export interface GarmentTileProps {
  imageUrl: string
  /** Tracked uppercase label under the arch. */
  label?: string
  /** A brass second line — cost per wear, wear count. */
  sublabel?: string
  onClick?: () => void
  /** Brightens the bezel: the lit / chosen state. */
  selected?: boolean
  /** Upload still being matted and tagged — dims the image and reads "developing". */
  processing?: boolean
  aspect?: '3/4' | '4/5' | '5/6' | '1/1'
  className?: string
  style?: React.CSSProperties
}
export function GarmentTile(props: GarmentTileProps): JSX.Element
