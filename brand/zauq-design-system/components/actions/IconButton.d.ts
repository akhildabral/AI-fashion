/** A square 36px bordered icon control. */
export interface IconButtonProps {
  /** Required: the accessible name. */
  label: string
  onClick?: () => void
  disabled?: boolean
  /** The glyph. Defaults to the ··· overflow dots. */
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function IconButton(props: IconButtonProps): JSX.Element
