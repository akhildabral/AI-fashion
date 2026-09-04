/** A choice token: picks a value. Brass fill when chosen. */
export interface ChipProps {
  /** Chosen state. */
  on?: boolean
  onClick?: () => void
  disabled?: boolean
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Chip(props: ChipProps): JSX.Element
