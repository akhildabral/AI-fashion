/** A flat card: hairline border on a raised fill. No shadow. */
export interface CardProps {
  /** Brass-tints the border on hover — for cards that are links. */
  hover?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Card(props: CardProps): JSX.Element
