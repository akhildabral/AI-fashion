/**
 * An inline tinted message beside the thing that produced it.
 * @startingPoint section="Feedback" subtitle="Alerts, badges, toasts, skeletons and errors" viewport="700x380"
 */
export interface AlertProps {
  tone?: 'error' | 'warning' | 'success'
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Alert(props: AlertProps): JSX.Element
