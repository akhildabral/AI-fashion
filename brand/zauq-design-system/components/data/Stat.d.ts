/** A Bodoni figure over a tracked label. */
export interface StatProps {
  value?: React.ReactNode
  label: string
  /** Brass figure instead of ink — for the one number that matters most. */
  accent?: boolean
  className?: string
  style?: React.CSSProperties
}
export function Stat(props: StatProps): JSX.Element
