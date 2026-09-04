/**
 * The one text input: 44px, hairline border, brass focus ring.
 * @startingPoint section="Forms" subtitle="Field, label and the tailor's tape" viewport="700x300"
 */
export interface FieldProps {
  id?: string
  type?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  /** md = 44px (default), sm = 36px inside cards and drawers. */
  size?: 'md' | 'sm'
  disabled?: boolean
  invalid?: boolean
  className?: string
  style?: React.CSSProperties
}
export function Field(props: FieldProps): JSX.Element
