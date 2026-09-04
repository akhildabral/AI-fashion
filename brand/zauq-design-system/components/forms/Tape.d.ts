/** A range input drawn as a brass tailor's thread. */
export interface TapeProps {
  min?: number
  max?: number
  step?: number
  value?: number
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Accessible name. */
  label?: string
  className?: string
  style?: React.CSSProperties
}
export function Tape(props: TapeProps): JSX.Element
