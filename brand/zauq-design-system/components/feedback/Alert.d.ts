/**
 * An inline tinted message beside the thing that produced it.
 */
export interface AlertProps {
  tone?: 'error' | 'warning' | 'success'
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Alert(props: AlertProps): JSX.Element
