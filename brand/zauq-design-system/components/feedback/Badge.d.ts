/** A small filled label: a count or a one-word state. */
export interface BadgeProps {
  tone?: 'brass' | 'quiet'
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Badge(props: BadgeProps): JSX.Element
