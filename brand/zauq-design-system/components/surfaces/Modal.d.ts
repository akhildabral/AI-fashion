/** The centred detail surface. */
export interface ModalProps {
  open: boolean
  onClose?: () => void
  /** Bodoni title in the header bar. */
  title?: string
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Modal(props: ModalProps): JSX.Element | null
