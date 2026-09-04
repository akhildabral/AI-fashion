/** A quiet filter token: narrows a set, ink wash when on. */
export interface FilterProps {
  on?: boolean
  onClick?: () => void
  count?: number
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Filter(props: FilterProps): JSX.Element
